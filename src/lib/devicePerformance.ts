/**
 * Device performance tier detection.
 *
 * Combines static signals (CPU cores, RAM, network type, Save-Data,
 * reduced-motion) with a lightweight runtime micro-benchmark to classify
 * the device into one of three tiers. Other parts of the app can use
 * `getPrefetchBudget()` to size background work without freezing weaker
 * machines.
 *
 * - low:    máquina fraca / rede ruim / Save-Data / aba em background
 * - medium: padrão
 * - high:   desktop moderno em rede boa
 */

export type PerfTier = "low" | "medium" | "high";

export interface PrefetchBudget {
  tier: PerfTier;
  /** Max neighbours (each side) to prefetch around the selected item */
  radius: number;
  /** Max parallel prefetches */
  concurrency: number;
  /** Debounce before kicking off prefetches (ms) */
  debounceMs: number;
  /** Minimum interval between prefetch waves (ms) — soft rate limit */
  minIntervalMs: number;
  /** Master toggle — set to false to disable prefetching entirely */
  enabled: boolean;
}

interface DeviceSignals {
  cores: number;
  memoryGb: number | null;
  effectiveType: string | null;
  saveData: boolean;
  reducedMotion: boolean;
  benchScore: number | null; // ops/ms — higher is faster
}

let cachedSignals: DeviceSignals | null = null;
let cachedTier: PerfTier | null = null;

/** Quick CPU micro-bench. Runs once and caches. */
function runMicroBench(): number {
  // Bail out cheaply on non-browser environments
  if (typeof performance === "undefined") return 1000;
  const t0 = performance.now();
  let acc = 0;
  // ~3-5ms on a modern desktop, 15-30ms on a low-end mobile
  for (let i = 0; i < 200_000; i++) {
    acc += Math.sqrt(i) * 1.0001;
  }
  const elapsed = performance.now() - t0;
  // Guard against zero
  return acc > 0 ? 200_000 / Math.max(elapsed, 0.1) : 1000;
}

function readSignals(): DeviceSignals {
  if (cachedSignals) return cachedSignals;
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const conn = nav.connection ?? null;
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  cachedSignals = {
    cores: nav.hardwareConcurrency ?? 4,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    effectiveType: conn?.effectiveType ?? null,
    saveData: !!conn?.saveData,
    reducedMotion,
    benchScore: null,
  };
  // Bench is async-friendly: only run when explicitly requested
  return cachedSignals;
}

/** Detect tier on first call; cached afterwards. */
export function getDeviceTier(): PerfTier {
  if (cachedTier) return cachedTier;
  const s = readSignals();

  // Run micro-bench once
  if (s.benchScore == null) {
    try {
      s.benchScore = runMicroBench();
    } catch {
      s.benchScore = 1000;
    }
  }

  // Save-Data or 2g/slow-2g → always low
  if (s.saveData || s.effectiveType === "slow-2g" || s.effectiveType === "2g") {
    cachedTier = "low";
    return cachedTier;
  }

  // Score the device on a few axes
  let score = 0;
  // CPU cores
  if (s.cores >= 8) score += 2;
  else if (s.cores >= 4) score += 1;
  // RAM
  if (s.memoryGb != null) {
    if (s.memoryGb >= 8) score += 2;
    else if (s.memoryGb >= 4) score += 1;
    else if (s.memoryGb <= 2) score -= 1;
  }
  // Network
  if (s.effectiveType === "4g") score += 1;
  else if (s.effectiveType === "3g") score -= 1;
  // Bench
  const b = s.benchScore ?? 0;
  if (b >= 60_000) score += 2;
  else if (b >= 25_000) score += 1;
  else if (b < 10_000) score -= 2;
  // Accessibility hint: user wants minimal background work
  if (s.reducedMotion) score -= 1;

  if (score <= 0) cachedTier = "low";
  else if (score <= 3) cachedTier = "medium";
  else cachedTier = "high";

  return cachedTier;
}

/** Force a re-evaluation (e.g. after the user changes connection). */
export function resetDeviceTierCache() {
  cachedSignals = null;
  cachedTier = null;
}

/** Budget tuned for predictive prefetching. */
export function getPrefetchBudget(): PrefetchBudget {
  const tier = getDeviceTier();

  // Disable entirely when the tab is hidden — no point burning CPU/data
  // while the user can't see the UI. The hook will re-evaluate on focus.
  const tabHidden =
    typeof document !== "undefined" && document.visibilityState === "hidden";

  switch (tier) {
    case "low":
      return {
        tier,
        enabled: !tabHidden,
        radius: 1,
        concurrency: 1,
        debounceMs: 900,
        minIntervalMs: 1500,
      };
    case "medium":
      return {
        tier,
        enabled: !tabHidden,
        radius: 3,
        concurrency: 2,
        debounceMs: 450,
        minIntervalMs: 600,
      };
    case "high":
    default:
      return {
        tier,
        enabled: !tabHidden,
        radius: 5,
        concurrency: 3,
        debounceMs: 250,
        minIntervalMs: 250,
      };
  }
}
