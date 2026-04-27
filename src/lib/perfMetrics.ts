/**
 * Lightweight client-side performance tracker for the Atendimento experience.
 *
 * Captures three signals, aggregated by device performance tier:
 *  - Conversation switch latency (ms): time from click → first paint of messages
 *  - Predictive prefetch attempts vs hits (cache effectiveness)
 *  - Sample size & last update time
 *
 * Stored in localStorage so the admin can read accumulated data across sessions
 * without needing a backend round-trip. Each device contributes its own bucket
 * (only the local browser sees its own counters), which is exactly what we want:
 * the customer can open the panel on a slow machine and capture its tier+stats.
 */
import { getDeviceTier, type PerfTier } from "./devicePerformance";

const STORAGE_KEY = "perf_metrics_v1";
const MAX_SAMPLES = 200; // keep latency samples bounded

export interface TierBucket {
  tier: PerfTier;
  switchSamples: number[]; // raw ms samples (rolling window)
  switchCount: number;
  switchSumMs: number;
  switchMaxMs: number;
  prefetchAttempts: number;
  prefetchHits: number; // served instantly from cache on selection
  prefetchMisses: number; // selection happened before prefetch finished
  lastUpdated: number;
}

export interface PerfMetricsSnapshot {
  deviceTier: PerfTier;
  userAgent: string;
  cores: number;
  memoryGb: number | null;
  buckets: Record<PerfTier, TierBucket>;
  generatedAt: number;
}

function emptyBucket(tier: PerfTier): TierBucket {
  return {
    tier,
    switchSamples: [],
    switchCount: 0,
    switchSumMs: 0,
    switchMaxMs: 0,
    prefetchAttempts: 0,
    prefetchHits: 0,
    prefetchMisses: 0,
    lastUpdated: 0,
  };
}

function loadBuckets(): Record<PerfTier, TierBucket> {
  if (typeof localStorage === "undefined") {
    return { low: emptyBucket("low"), medium: emptyBucket("medium"), high: emptyBucket("high") };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Record<PerfTier, TierBucket>;
    return {
      low: { ...emptyBucket("low"), ...parsed.low },
      medium: { ...emptyBucket("medium"), ...parsed.medium },
      high: { ...emptyBucket("high"), ...parsed.high },
    };
  } catch {
    return { low: emptyBucket("low"), medium: emptyBucket("medium"), high: emptyBucket("high") };
  }
}

let buckets: Record<PerfTier, TierBucket> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<() => void>();

function ensureLoaded(): Record<PerfTier, TierBucket> {
  if (!buckets) buckets = loadBuckets();
  return buckets;
}

function scheduleSave() {
  if (typeof localStorage === "undefined") return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buckets));
    } catch {
      /* quota / private mode — ignore */
    }
    subscribers.forEach((cb) => {
      try { cb(); } catch { /* noop */ }
    });
  }, 500);
}

export function recordSwitchLatency(ms: number) {
  if (!Number.isFinite(ms) || ms < 0 || ms > 30_000) return;
  const tier = getDeviceTier();
  const b = ensureLoaded()[tier];
  b.switchSamples.push(Math.round(ms));
  if (b.switchSamples.length > MAX_SAMPLES) {
    b.switchSamples.splice(0, b.switchSamples.length - MAX_SAMPLES);
  }
  b.switchCount += 1;
  b.switchSumMs += ms;
  if (ms > b.switchMaxMs) b.switchMaxMs = ms;
  b.lastUpdated = Date.now();
  scheduleSave();
}

export function recordPrefetchAttempt(n = 1) {
  if (n <= 0) return;
  const tier = getDeviceTier();
  const b = ensureLoaded()[tier];
  b.prefetchAttempts += n;
  b.lastUpdated = Date.now();
  scheduleSave();
}

/**
 * Record whether a conversation selection was served from a primed cache
 * (hit) or had to wait for the network (miss). Called by the chat shell
 * right after a switch is committed.
 */
export function recordSelectionCacheOutcome(hit: boolean) {
  const tier = getDeviceTier();
  const b = ensureLoaded()[tier];
  if (hit) b.prefetchHits += 1;
  else b.prefetchMisses += 1;
  b.lastUpdated = Date.now();
  scheduleSave();
}

export function getSnapshot(): PerfMetricsSnapshot {
  const buckets = ensureLoaded();
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & {
    deviceMemory?: number;
  };
  return {
    deviceTier: getDeviceTier(),
    userAgent: nav.userAgent ?? "",
    cores: nav.hardwareConcurrency ?? 0,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    buckets,
    generatedAt: Date.now(),
  };
}

export function resetMetrics() {
  buckets = { low: emptyBucket("low"), medium: emptyBucket("medium"), high: emptyBucket("high") };
  if (typeof localStorage !== "undefined") {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }
  subscribers.forEach((cb) => cb());
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

// ----- helpers for the UI -----
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function bucketAvgSwitch(b: TierBucket): number {
  return b.switchCount > 0 ? b.switchSumMs / b.switchCount : 0;
}

export function bucketHitRate(b: TierBucket): number {
  const total = b.prefetchHits + b.prefetchMisses;
  return total > 0 ? b.prefetchHits / total : 0;
}
