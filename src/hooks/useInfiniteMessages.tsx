import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
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

export interface MessagePage {
  messages: MessageRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type MessageRow = ExternalMessageRow;

async function fetchMessagePage(
  channelId: string,
  conversationPhone: string,
  cursor: string | null,
  effectiveOrganizationId: string | null,
  channelPhone?: string | null
): Promise<MessagePage> {
  const phoneVariants = getPhoneLookupVariants(conversationPhone);

  const externalParams = {
    channelId,
    phoneVariants,
    cursor,
    pageSize: PAGE_SIZE,
    impersonatedOrgId: effectiveOrganizationId,
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
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const conversationThreadKey = conversationPhone
    ? getCanonicalPhoneThreadKey(conversationPhone)
    : null;

  const queryKey = ["messages", effectiveOrganizationId, channelId, conversationThreadKey];

  const query = useInfiniteQuery<MessagePage, Error>({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchMessagePage(
        channelId!,
        conversationPhone!,
        pageParam as string | null,
        effectiveOrganizationId,
        channelPhone
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!channelId && !!conversationPhone && !!effectiveOrganizationId,
    // PERFORMANCE: cache messages for 30s and keep them in memory for 5min.
    // Switching between conversations no longer triggers a full external DB
    // refetch — Realtime keeps the cache fresh via prependMessage.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
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
      queryClient.setQueryData(
        queryKey,
        (old: { pages: MessagePage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          const firstPage = old.pages[0];
          // Avoid exact duplicate by id
          if (firstPage?.messages.some((m) => m.id === msg.id)) return old;

          const msgTime = new Date(msg.created_at).getTime();
          const normalize = (s?: string | null) => (s ?? "").trim();
          const incomingContent = normalize(msg.content);

          // Detect optimistic twin: same direction + same content within 60s.
          // This covers BOTH temp_* optimistic bubbles AND realtime sync messages
          // (rt_*) that may arrive when an outbound message is echoed back from
          // conversation_stats. Without this we end up showing the same message
          // twice (once as the optimistic green bubble, once as the realtime echo).
          const TWIN_WINDOW_MS = 60_000;
          const findTwinIndex = (messages: MessageRow[]) =>
            messages.findIndex((m) => {
              if (m.id === msg.id) return true;
              if (msg.message_id && m.message_id === msg.message_id) return true;
              if (m.direction !== msg.direction) return false;
              const sameContent = normalize(m.content) === incomingContent;
              if (!sameContent) return false;
              const diff = Math.abs(new Date(m.created_at).getTime() - msgTime);
              return diff < TWIN_WINDOW_MS;
            });

          const twinIndex = findTwinIndex(firstPage?.messages ?? []);
          if (twinIndex >= 0) {
            // Replace the optimistic / synthetic twin with the authoritative copy,
            // preferring real ids and keeping the latest status.
            const existing = firstPage.messages[twinIndex];
            const isExistingTemp = existing.id.startsWith("temp_");
            const isExistingSynthetic = existing.id.startsWith("rt_") || existing.id.startsWith("stats_");
            const isIncomingSynthetic = msg.id.startsWith("rt_") || msg.id.startsWith("stats_");

            // If the existing one is a real persisted message and the incoming is
            // synthetic/realtime, keep the existing — just refresh status if better.
            if (!isExistingTemp && !isExistingSynthetic && isIncomingSynthetic) {
              return old;
            }

            const merged: MessageRow = {
              ...existing,
              ...msg,
              // Prefer the existing id when the incoming one is synthetic and the
              // existing one is already real, otherwise take incoming.
              id: !isIncomingSynthetic ? msg.id : existing.id,
              message_id: !isIncomingSynthetic ? msg.message_id : existing.message_id,
              status: msg.status || existing.status,
              created_at: existing.created_at, // keep original timestamp to avoid reordering
            };

            const newMessages = [...firstPage.messages];
            newMessages[twinIndex] = merged;
            return {
              ...old,
              pages: [
                { ...firstPage, messages: newMessages },
                ...old.pages.slice(1),
              ],
            };
          }

          return {
            ...old,
            pages: [
              {
                ...firstPage,
                messages: [msg, ...(firstPage?.messages ?? [])],
              },
              ...old.pages.slice(1),
            ],
          };
        }
      );
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
