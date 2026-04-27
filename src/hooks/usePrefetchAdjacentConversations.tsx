import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchExternalMessages,
  fetchConversationStatsMessages,
} from "@/lib/externalDb";
import {
  getCanonicalPhoneThreadKey,
  getPhoneLookupVariants,
} from "@/lib/phoneThreadKey";
import { getPrefetchBudget, type PrefetchBudget } from "@/lib/devicePerformance";

const PAGE_SIZE = 25;

interface PrefetchTarget {
  channelId: string | null;
  phone: string;
  channelPhone?: string | null;
}

interface Options {
  /** Hard caps — applied AFTER the adaptive budget. Useful to throttle
   *  prefetching for specific screens regardless of device tier. */
  maxRadius?: number;
  maxConcurrency?: number;
  /** Force-disable prefetching (e.g. while doing a heavy operation). */
  disabled?: boolean;
}

/**
 * Predictive prefetch of message history for the conversations adjacent to the
 * currently selected one.
 *
 * The size and frequency of prefetching is **adaptive**: a per-device budget
 * (CPU cores, RAM, network type, Save-Data, micro-bench) decides the radius,
 * concurrency, debounce and minimum interval between waves. Weak machines get
 * a small radius and long debounce; strong desktops get aggressive prefetch.
 *
 * Additional safeguards:
 *  - Stops entirely when the tab is hidden (no point spending CPU/data).
 *  - Stops when the user enables Save-Data or a 2g connection.
 *  - Skips entries already in cache or being fetched.
 *  - Uses requestIdleCallback so it never competes with user interactions.
 *  - Honors a soft `minIntervalMs` rate-limit between waves.
 */
export function usePrefetchAdjacentConversations(
  conversations: Array<{ channelId: string | null; phone: string }>,
  selectedKey: string | null,
  effectiveOrganizationId: string | null,
  resolveChannelPhone: (channelId: string | null) => string | null,
  getKey: (c: { channelId: string | null; phone: string }) => string,
  opts: Options = {}
) {
  const { maxRadius, maxConcurrency, disabled } = opts;
  const queryClient = useQueryClient();
  const inflightRef = useRef<Set<string>>(new Set());
  const lastWaveAtRef = useRef<number>(0);

  // Re-evaluate the budget when tab visibility changes — a hidden tab returns
  // an "enabled: false" budget so we stop spending resources in background.
  const [budget, setBudget] = useState<PrefetchBudget>(() => getPrefetchBudget());
  useEffect(() => {
    const update = () => setBudget(getPrefetchBudget());
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);

  const radius = Math.min(budget.radius, maxRadius ?? budget.radius);
  const concurrency = Math.min(
    budget.concurrency,
    maxConcurrency ?? budget.concurrency
  );
  const debounceMs = budget.debounceMs;
  const minIntervalMs = budget.minIntervalMs;
  const enabled = budget.enabled && !disabled;


  useEffect(() => {
    if (!enabled) return;
    if (!selectedKey || !effectiveOrganizationId || conversations.length === 0) {
      return;
    }
    if (radius < 1 || concurrency < 1) return;

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
          getNextPageParam: (lastPage: { nextCursor: string | null }) =>
            lastPage.nextCursor ?? undefined,
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

    // Soft rate-limit: respect minIntervalMs between waves so we don't
    // hammer the device when the user scrolls through many conversations.
    const since = Date.now() - lastWaveAtRef.current;
    const wait = Math.max(debounceMs, minIntervalMs - since);

    const timer = window.setTimeout(() => {
      lastWaveAtRef.current = Date.now();
      schedule(() => {
        runQueue();
      });
    }, wait);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    enabled,
    selectedKey,
    effectiveOrganizationId,
    conversations,
    radius,
    debounceMs,
    concurrency,
    minIntervalMs,
    queryClient,
    resolveChannelPhone,
    getKey,
  ]);
}
