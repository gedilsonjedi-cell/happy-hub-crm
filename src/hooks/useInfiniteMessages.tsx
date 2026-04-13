import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  fetchExternalMessages,
  fetchInternalMessages,
  type ExternalMessageRow,
} from "@/lib/externalDb";
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
  cursor: string | null
): Promise<MessagePage> {
  const phoneVariants = getPhoneLookupVariants(conversationPhone);

  const requestParams = {
    channelId,
    phoneVariants,
    cursor,
    pageSize: PAGE_SIZE,
  };

  // Try external first, then internal. If external returns empty, also try internal.
  let externalOk = false;
  let result: { messages: MessageRow[]; nextCursor: string | null; hasMore: boolean } | null = null;

  try {
    result = await fetchExternalMessages(requestParams);
    externalOk = true;
  } catch (e) {
    console.warn("[fetchMessagePage] External fetch failed, falling back to internal:", e);
  }

  // If external succeeded but returned no messages, or if it failed, try internal
  if (!result?.messages?.length) {
    try {
      const internalResult = await fetchInternalMessages(requestParams);
      if (internalResult.messages.length > 0) {
        result = internalResult;
      }
    } catch (e) {
      console.warn("[fetchMessagePage] Internal fetch also failed:", e);
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
 * - Uses channel_id + conversation_phone as multi-tenant keys
 * - Selects only essential fields to minimize JSON payload
 */
export function useInfiniteMessages(
  channelId: string | null,
  conversationPhone: string | null
) {
  const queryClient = useQueryClient();
  const conversationThreadKey = conversationPhone
    ? getCanonicalPhoneThreadKey(conversationPhone)
    : null;

  const queryKey = ["messages", channelId, conversationThreadKey];

  const query = useInfiniteQuery<MessagePage, Error>({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchMessagePage(
        channelId!,
        conversationPhone!,
        pageParam as string | null
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!channelId && !!conversationPhone,
    staleTime: 30_000,
    gcTime: 3 * 60_000,
    refetchOnMount: "always",
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  // All pages combined in chronological order (oldest → newest)
  const allMessages: MessageRow[] = query.data
    ? query.data.pages
        .flatMap((p) => p.messages)
        // De-duplicate across pages
        .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
        // Chronological
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
    : [];
  const isInitialLoading =
    query.isPending || (query.isFetching && allMessages.length === 0);

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
          // Avoid exact duplicate
          if (firstPage?.messages.some((m) => m.id === msg.id)) return old;

          // Remove optimistic (temp_*) messages that match this real message
          // by checking direction + approximate timestamp (within 30s)
          const msgTime = new Date(msg.created_at).getTime();
          const cleanedMessages = (firstPage?.messages ?? []).filter((m) => {
            if (!m.id.startsWith("temp_")) return true;
            if (m.direction !== msg.direction) return true;
            const timeDiff = Math.abs(new Date(m.created_at).getTime() - msgTime);
            // Same direction, similar time, same content → it's the optimistic twin
            if (timeDiff < 30000 && m.content === msg.content) return false;
            return true;
          });

          return {
            ...old,
            pages: [
              {
                ...firstPage,
                messages: [msg, ...cleanedMessages],
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

  return {
    messages: allMessages,
    isLoading: isInitialLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    prependMessage,
    updateMessageStatus,
    invalidate,
  };
}
