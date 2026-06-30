import { useInfiniteQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  fetchConversationStatsMessages,
  fetchExternalMessages,
  type ExternalMessageRow,
} from "@/lib/externalDb";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import {
  getCanonicalPhoneThreadKey,
  getPhoneLookupVariants,
} from "@/lib/phoneThreadKey";

const PAGE_SIZE = 25;
const MESSAGE_PAGE_TIMEOUT_MS = 20_000;

function withMessageTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("message_page_timeout"));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId!));
}


export interface MessagePage {
  messages: MessageRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type MessageRow = ExternalMessageRow;

type InfiniteMessagesCache = { pages: MessagePage[]; pageParams: unknown[] };

export function upsertMessageIntoInfiniteCache(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  msg: MessageRow
) {
  queryClient.setQueryData(
    queryKey,
    (old: InfiniteMessagesCache | undefined): InfiniteMessagesCache => {
      const firstPage = old?.pages?.[0] ?? { messages: [], nextCursor: null, hasMore: false };
      if (firstPage.messages.some((m) => m.id === msg.id)) {
        return old ?? { pages: [firstPage], pageParams: [null] };
      }

      const msgTime = new Date(msg.created_at).getTime();
      const normalize = (s?: string | null) => (s ?? "").trim();
      const incomingContent = normalize(msg.content);
      const isIncomingSynthetic = msg.id.startsWith("rt_") || msg.id.startsWith("stats_");

      const twinIndex = firstPage.messages.findIndex((m) => {
        if (m.id === msg.id) return true;
        if (msg.message_id && m.message_id === msg.message_id) return true;
        if (m.direction !== msg.direction) return false;

        const diff = Math.abs(new Date(m.created_at).getTime() - msgTime);
        const isExistingSynthetic = m.id.startsWith("rt_") || m.id.startsWith("stats_");
        if ((isExistingSynthetic || isIncomingSynthetic) && diff < 2_000) return true;

        return normalize(m.content) === incomingContent && diff < 60_000;
      });

      if (twinIndex >= 0) {
        const existing = firstPage.messages[twinIndex];
        const isExistingTemp = existing.id.startsWith("temp_");
        const isExistingSynthetic = existing.id.startsWith("rt_") || existing.id.startsWith("stats_");

        if (!isExistingTemp && !isExistingSynthetic && isIncomingSynthetic) {
          return old ?? { pages: [firstPage], pageParams: [null] };
        }

        const merged: MessageRow = isIncomingSynthetic
          ? { ...existing, status: existing.status || msg.status }
          : {
              ...existing,
              ...msg,
              id: msg.id,
              message_id: msg.message_id,
              message_type: msg.message_type || existing.message_type,
              media_url: msg.media_url ?? existing.media_url,
              content:
                msg.content && msg.content !== `[${existing.message_type}]`
                  ? msg.content
                  : existing.content,
              status: msg.status || existing.status,
              created_at: existing.created_at,
            };

        const newMessages = [...firstPage.messages];
        newMessages[twinIndex] = merged;
        return {
          ...(old ?? { pages: [], pageParams: [null] }),
          pages: [{ ...firstPage, messages: newMessages }, ...(old?.pages?.slice(1) ?? [])],
          pageParams: old?.pageParams?.length ? old.pageParams : [null],
        };
      }

      return {
        ...(old ?? { pages: [], pageParams: [null] }),
        pages: [
          { ...firstPage, messages: [msg, ...firstPage.messages] },
          ...(old?.pages?.slice(1) ?? []),
        ],
        pageParams: old?.pageParams?.length ? old.pageParams : [null],
      };
    }
  );
}

async function fetchMessagePage(
  channelId: string,
  conversationPhone: string,
  cursor: string | null,
  impersonatedOrgId: string | null,
  channelPhone?: string | null
): Promise<MessagePage> {
  const phoneVariants = getPhoneLookupVariants(conversationPhone);

  const externalParams = {
    channelId,
    phoneVariants,
    cursor,
    pageSize: PAGE_SIZE,
    impersonatedOrgId,
    channelPhone: channelPhone || null,
  };

  let result: { messages: MessageRow[]; nextCursor: string | null; hasMore: boolean } | null = null;

  // External DB is the single source of truth
  try {
    result = await fetchExternalMessages(externalParams);
  } catch (e) {
    console.error("[fetchMessagePage] External fetch failed:", e);
  }

  // Fallback to conversation_stats synthetic message if external is empty
  if (!result?.messages?.length) {
    try {
      const statsResult = await fetchConversationStatsMessages(externalParams);
      if (statsResult.messages.length > 0) {
        result = statsResult;
      }
    } catch (e) {
      console.warn("[fetchMessagePage] Stats fallback failed:", e);
    }
  }

  return {
    messages: result?.messages ?? [],
    nextCursor: result?.nextCursor ?? null,
    hasMore: result?.hasMore ?? false,
  };
}

/**
 * useInfiniteMessages — Paginated message loading for the chat panel.
 *
 * - Fetches ONLY the 40 most recent messages on mount
 * - `fetchNextPage()` loads the previous 40 (scrolling up)
 * - Uses organization scope + channel_id + conversation_phone as cache keys
 * - Selects only essential fields to minimize JSON payload
 */
export function useInfiniteMessages(
  channelId: string | null,
  conversationPhone: string | null,
  channelPhone?: string | null
) {
  const queryClient = useQueryClient();
  const { effectiveOrganizationId, isImpersonating, impersonatedOrganizationId } = useEffectiveOrganizationId();
  const externalImpersonatedOrgId = isImpersonating ? impersonatedOrganizationId ?? null : null;
  const conversationThreadKey = conversationPhone
    ? getCanonicalPhoneThreadKey(conversationPhone)
    : null;

  const queryKey = ["messages", effectiveOrganizationId, channelId, conversationThreadKey];

  const query = useInfiniteQuery<MessagePage, Error>({
    queryKey,
    queryFn: ({ pageParam }) =>
      withMessageTimeout(
        fetchMessagePage(
          channelId!,
          conversationPhone!,
          pageParam as string | null,
          externalImpersonatedOrgId,
          channelPhone
        ),
        MESSAGE_PAGE_TIMEOUT_MS
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!channelId && !!conversationPhone && !!effectiveOrganizationId,
    // Always refetch latest page when opening a conversation so that messages
    // sent very recently (campaign templates, follow-ups) appear immediately
    // even if Realtime missed the upsert event.
    staleTime: 0,
    gcTime: 5 * 60_000,
    // Aggressive refetch policy: always re-pull on mount, on tab focus and on
    // network reconnect. Prevents the "mensagens somem ao voltar pra aba" bug
    // where Realtime missed events while the tab was hidden / JWT expired.
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    // Silent fallback poll: refetch every 8s on the active conversation so
    // missed Realtime events still surface without F5.
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  // All pages combined in chronological order (oldest → newest)
  // Memoized so it doesn't re-run on every parent re-render (typing, etc.)
  const allMessages = useMemo<MessageRow[]>(() => {
    if (!query.data) return [];
    const seen = new Set<string>();
    const merged: MessageRow[] = [];
    for (const page of query.data.pages) {
      for (const msg of page.messages) {
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        merged.push(msg);
      }
    }
    merged.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return merged;
  }, [query.data]);
  const isInitialLoading = query.isPending && !query.data;

  /**
   * Prepend a new message received via Realtime without refetching.
   * Keeps the local state consistent instantly.
   */
  const prependMessage = useCallback(
    (msg: MessageRow) => {
      upsertMessageIntoInfiniteCache(queryClient, queryKey, msg);
    },
    [queryClient, queryKey.join("|")]
  );

  /**
   * Update a single message status in cache (delivered/read/failed).
   * Used instead of creating a new log record.
   */
  const updateMessageStatus = useCallback(
    (messageId: string, status: string) => {
      queryClient.setQueryData(
        queryKey,
        (old: { pages: MessagePage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === messageId ? { ...m, status } : m
              ),
            })),
          };
        }
      );
    },
    [queryClient, queryKey.join("|")]
  );

  /**
   * Invalidate cache (e.g. after switching conversations).
   */
  const invalidate = useCallback(() => {
    queryClient.removeQueries({ queryKey });
  }, [queryClient, queryKey.join("|")]);

  /**
   * Refetch the first (latest) page from the external DB.
   * Used when a conversation_stats realtime event indicates a new message
   * was written to the external DB but we only have a synthetic preview.
   */
  const refetchLatestPage = useCallback(() => {
    queryClient.invalidateQueries({ queryKey, refetchType: "active" });
  }, [queryClient, queryKey.join("|")]);

  return {
    messages: allMessages,
    isLoading: isInitialLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    prependMessage,
    updateMessageStatus,
    invalidate,
    refetchLatestPage,
  };
}
