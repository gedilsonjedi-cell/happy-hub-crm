import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchExternalMessages,
  fetchConversationStatsMessages,
} from "@/lib/externalDb";
import {
  getCanonicalPhoneThreadKey,
  getPhoneLookupVariants,
} from "@/lib/phoneThreadKey";

const PAGE_SIZE = 25;

interface PrefetchTarget {
  channelId: string | null;
  phone: string;
  channelPhone?: string | null;
}

interface Options {
  /** How many neighbours above & below the selected conversation to prefetch */
  radius?: number;
  /** Debounce window before prefetching kicks in (ms) */
  debounceMs?: number;
  /** Cap of parallel prefetches */
  concurrency?: number;
}

/**
 * Predictive prefetch of message history for the conversations adjacent to the
 * currently selected one. Result lives inside React Query's cache under the
 * same key as `useInfiniteMessages`, so when the user actually clicks one of
 * the predicted conversations the message list is rendered instantly without
 * a network round-trip.
 *
 * Implementation notes:
 *  - Skips entries already present in cache (or being fetched).
 *  - Uses requestIdleCallback so prefetching never competes with user
 *    interactions or the active conversation's data fetch.
 *  - Each prefetched query inherits the cache TTL of useInfiniteMessages
 *    (staleTime 30s, gcTime 5min).
 */
export function usePrefetchAdjacentConversations(
  conversations: Array<{ channelId: string | null; phone: string }>,
  selectedKey: string | null,
  effectiveOrganizationId: string | null,
  resolveChannelPhone: (channelId: string | null) => string | null,
  getKey: (c: { channelId: string | null; phone: string }) => string,
  opts: Options = {}
) {
  const { radius = 4, debounceMs = 350, concurrency = 3 } = opts;
  const queryClient = useQueryClient();
  const inflightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedKey || !effectiveOrganizationId || conversations.length === 0) {
      return;
    }

    const idx = conversations.findIndex((c) => getKey(c) === selectedKey);
    if (idx < 0) return;

    // Build the target window: a few above, a few below, plus the immediate next
    // one weighted first because that's the most common navigation pattern.
    const targets: PrefetchTarget[] = [];
    const seen = new Set<string>();
    const order = [
      ...Array.from({ length: radius }, (_, i) => idx + 1 + i),
      ...Array.from({ length: radius }, (_, i) => idx - 1 - i),
    ];

    for (const i of order) {
      if (i < 0 || i >= conversations.length) continue;
      const c = conversations[i];
      if (!c?.phone || !c?.channelId) continue;
      const k = getKey(c);
      if (seen.has(k)) continue;
      seen.add(k);
      targets.push({
        channelId: c.channelId,
        phone: c.phone,
        channelPhone: resolveChannelPhone(c.channelId),
      });
    }

    if (targets.length === 0) return;

    let cancelled = false;

    const schedule = (fn: () => void) => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(fn, { timeout: 1500 });
      } else {
        setTimeout(fn, 0);
      }
    };

    const prefetchOne = async (t: PrefetchTarget) => {
      const threadKey = getCanonicalPhoneThreadKey(t.phone);
      const queryKey = ["messages", effectiveOrganizationId, t.channelId, threadKey];
      const dedupeKey = queryKey.join("|");

      // Skip if already cached or in flight
      if (inflightRef.current.has(dedupeKey)) return;
      const existing = queryClient.getQueryState(queryKey);
      if (existing?.data) return;

      inflightRef.current.add(dedupeKey);
      try {
        await queryClient.prefetchInfiniteQuery({
          queryKey,
          initialPageParam: null as string | null,
          queryFn: async ({ pageParam }) => {
            const phoneVariants = getPhoneLookupVariants(t.phone);
            const params = {
              channelId: t.channelId!,
              phoneVariants,
              cursor: pageParam as string | null,
              pageSize: PAGE_SIZE,
              impersonatedOrgId: effectiveOrganizationId,
              channelPhone: t.channelPhone || null,
            };
            let result = await fetchExternalMessages(params).catch(() => null);
            if (!result?.messages?.length) {
              result = await fetchConversationStatsMessages(params).catch(() => null);
            }
            return {
              messages: result?.messages ?? [],
              nextCursor: result?.nextCursor ?? null,
              hasMore: result?.hasMore ?? false,
            };
          },
          staleTime: 30_000,
          gcTime: 5 * 60_000,
          pages: 1,
        });
      } catch {
        // Silent — prefetch failures are non-blocking
      } finally {
        inflightRef.current.delete(dedupeKey);
      }
    };

    const runQueue = async () => {
      if (cancelled) return;
      // Process in small concurrent batches to avoid spamming the external DB
      for (let i = 0; i < targets.length; i += concurrency) {
        if (cancelled) return;
        const batch = targets.slice(i, i + concurrency);
        await Promise.all(batch.map(prefetchOne));
      }
    };

    const timer = window.setTimeout(() => {
      schedule(() => {
        runQueue();
      });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    selectedKey,
    effectiveOrganizationId,
    conversations,
    radius,
    debounceMs,
    concurrency,
    queryClient,
    resolveChannelPhone,
    getKey,
  ]);
}
