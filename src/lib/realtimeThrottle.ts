/**
 * Batches rapid-fire callbacks into single execution cycles.
 * If 10 events arrive in 150ms, the handler runs once with all 10 items.
 */
export function createRealtimeBatcher<T>(
  handler: (items: T[]) => void,
  delayMs = 150
) {
  let buffer: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    timer = null;
    handler(batch);
  };

  return {
    push(item: T) {
      buffer.push(item);
      if (!timer) {
        timer = setTimeout(flush, delayMs);
      }
    },
    flush,
    destroy() {
      if (timer) clearTimeout(timer);
      buffer = [];
      timer = null;
    },
  };
}
