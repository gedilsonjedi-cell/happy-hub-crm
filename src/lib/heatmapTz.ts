// Timezone helpers for heatmaps — everything is computed in America/Sao_Paulo
// to keep day/hour buckets aligned regardless of the user's browser timezone.

export const TZ = "America/Sao_Paulo";
export const DAY_LABELS = [
  "Domingo",
  "Segunda-Feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const dateHourFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateOnlyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function partsOf(fmt: Intl.DateTimeFormat, d: Date) {
  return fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
}

/** Convert a UTC ISO timestamp to {date: yyyy-mm-dd, hour: 0-23} in SP TZ. */
export function toLocalDateHour(iso: string): { date: string; hour: number } {
  const d = new Date(iso);
  const p = partsOf(dateHourFmt, d);
  // en-CA hour can be "24" at midnight in some engines — normalize.
  const hour = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, hour };
}

/** yyyy-mm-dd of "now" in SP TZ. */
function spTodayString(): string {
  const p = partsOf(dateOnlyFmt, new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

/** Add N days to a yyyy-mm-dd string (treated as a calendar date). */
function addDaysToDateString(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Use UTC math to avoid local TZ shifting the calendar date.
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Day-of-week (0=Sun..6=Sat) for a yyyy-mm-dd as observed in SP TZ. */
function spWeekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Noon UTC ensures the same calendar day in SP TZ.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wk = weekdayFmt.format(dt).slice(0, 3);
  return WEEKDAY_INDEX[wk] ?? 0;
}

/** Build the list of days to render, ending on "today" in SP TZ. */
export function buildDays(daysBack: number) {
  const today = spTodayString();
  const days: { dayOfWeek: number; date: string; label: string }[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const dateStr = addDaysToDateString(today, -i);
    const dow = spWeekdayOfDate(dateStr);
    days.push({ dayOfWeek: dow, date: dateStr, label: DAY_LABELS[dow] });
  }
  return days;
}

/** ISO timestamp (UTC) corresponding to start-of-day in SP TZ for the cutoff day. */
export function spCutoffIso(daysBack: number): string {
  const today = spTodayString();
  const cutoffDate = addDaysToDateString(today, -(daysBack - 1));
  // SP is UTC-3 year-round (no DST since 2019). Start of day SP = 03:00 UTC.
  return `${cutoffDate}T03:00:00.000Z`;
}
