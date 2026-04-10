import { useEffect, useRef, useCallback, useMemo, memo } from "react";
import { VariableSizeList as List } from "react-window";
import { Loader2 } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { format } from "date-fns";
import type { MessageRow } from "@/hooks/useInfiniteMessages";

interface InfiniteMessageListProps {
  messages: MessageRow[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  onMediaPreview: (url: string, type: string, fileName?: string) => void;
  templates: Map<string, {
    content: string;
    variables: string[] | null;
    components: { buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }> } | null;
  }>;
}

const DEFAULT_ITEM_HEIGHT = 90;
const OVERSCAN_COUNT = 5;

/**
 * Virtualized InfiniteMessageList
 *
 * Uses react-window VariableSizeList to keep only ~20 DOM nodes
 * regardless of how many messages are loaded. Dynamic height
 * measurement ensures correct layout for variable-height bubbles.
 */

interface RowItem {
  type: "date-separator" | "message";
  message?: MessageRow;
  dateLabel?: string;
}

function buildItems(messages: MessageRow[]): RowItem[] {
  const items: RowItem[] = [];
  const datesShown = new Set<string>();

  for (const msg of messages) {
    const dateKey = format(new Date(msg.created_at), "yyyy-MM-dd");
    if (!datesShown.has(dateKey)) {
      datesShown.add(dateKey);
      items.push({ type: "date-separator", dateLabel: dateKey });
    }
    items.push({ type: "message", message: msg });
  }

  return items;
}

// Measures actual rendered height and reports back
const MeasuredRow = memo(function MeasuredRow({
  item,
  index,
  onMediaPreview,
  templates,
  onHeightMeasured,
}: {
  item: RowItem;
  index: number;
  onMediaPreview: (url: string, type: string, fileName?: string) => void;
  templates: InfiniteMessageListProps["templates"];
  onHeightMeasured: (index: number, height: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowRef.current) {
      const h = rowRef.current.getBoundingClientRect().height;
      onHeightMeasured(index, h);
    }
  }, [index, onHeightMeasured]);

  if (item.type === "date-separator") {
    return (
      <div ref={rowRef}>
        <div className="flex justify-center py-2">
          <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
            {item.dateLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={rowRef}>
      <MessageBubble
        message={item.message!}
        showDateSeparator={false}
        onMediaPreview={onMediaPreview}
        templates={templates}
      />
    </div>
  );
});

const InfiniteMessageList = memo(function InfiniteMessageList({
  messages,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onMediaPreview,
  templates,
}: InfiniteMessageListProps) {
  const listRef = useRef<List>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const heightMapRef = useRef<Map<number, number>>(new Map());
  const prevMessageCountRef = useRef<number>(0);
  const isLoadingMoreRef = useRef(false);
  const containerHeightRef = useRef(500);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Build flat item list with date separators
  const items = useMemo(() => buildItems(messages), [messages]);

  // Extra rows: loading indicator at top, "start" label
  const hasTopLoader = isFetchingNextPage;
  const hasStartLabel = !hasNextPage && messages.length > 0;
  const prefixCount = (hasTopLoader ? 1 : 0) + (hasStartLabel ? 1 : 0);
  const totalCount = prefixCount + items.length;

  // Height getter for VariableSizeList
  const getItemSize = useCallback(
    (index: number) => {
      // Prefix rows (loader / start label)
      if (index < prefixCount) return 40;
      const realIndex = index - prefixCount;
      return heightMapRef.current.get(realIndex) ?? DEFAULT_ITEM_HEIGHT;
    },
    [prefixCount]
  );

  // When a row measures itself, update the map and reset the list cache
  const handleHeightMeasured = useCallback(
    (realIndex: number, height: number) => {
      const prev = heightMapRef.current.get(realIndex);
      if (prev !== height) {
        heightMapRef.current.set(realIndex, height);
        const listIndex = realIndex + prefixCount;
        listRef.current?.resetAfterIndex(listIndex, false);
      }
    },
    [prefixCount]
  );

  // Measure container height
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const h = wrapper.clientHeight;
      if (h > 0 && h !== containerHeightRef.current) {
        containerHeightRef.current = h;
        listRef.current?.resetAfterIndex(0, false);
      }
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(wrapper);
    resizeObserverRef.current = ro;
    return () => ro.disconnect();
  }, []);

  // Scroll to bottom on first load and new messages
  useEffect(() => {
    if (isLoading) return;

    const newCount = messages.length;
    const prevCount = prevMessageCountRef.current;

    if (prevCount === 0 && newCount > 0) {
      // First load — jump to end
      requestAnimationFrame(() => {
        listRef.current?.scrollToItem(totalCount - 1, "end");
      });
    } else if (newCount > prevCount && !isLoadingMoreRef.current) {
      // New message appended — if near bottom, scroll down
      const outer = outerRef.current;
      if (outer) {
        const distFromBottom = outer.scrollHeight - outer.scrollTop - outer.clientHeight;
        if (distFromBottom < 200) {
          requestAnimationFrame(() => {
            listRef.current?.scrollToItem(totalCount - 1, "end");
          });
        }
      }
    }

    prevMessageCountRef.current = newCount;
  }, [messages.length, isLoading, totalCount]);

  // When older page loads, maintain scroll position
  useEffect(() => {
    if (!isFetchingNextPage && isLoadingMoreRef.current) {
      isLoadingMoreRef.current = false;
      // Heights map indices shift — clear and let re-measure
      heightMapRef.current.clear();
      listRef.current?.resetAfterIndex(0, false);
    }
  }, [isFetchingNextPage]);

  // Detect scroll near top → load more
  const handleScroll = useCallback(
    ({ scrollOffset }: { scrollOffset: number }) => {
      if (scrollOffset < 100 && hasNextPage && !isFetchingNextPage) {
        isLoadingMoreRef.current = true;
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  // Render each row
  const renderRow = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      // Prefix: start label
      if (hasStartLabel && index === 0) {
        return (
          <div style={style}>
            <div className="text-center text-xs text-muted-foreground py-2">
              Início da conversa
            </div>
          </div>
        );
      }

      // Prefix: loader
      if (hasTopLoader && index === (hasStartLabel ? 1 : 0)) {
        return (
          <div style={style} className="flex justify-center py-3">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        );
      }

      const realIndex = index - prefixCount;
      const item = items[realIndex];
      if (!item) return null;

      return (
        <div style={style}>
          <MeasuredRow
            item={item}
            index={realIndex}
            onMediaPreview={onMediaPreview}
            templates={templates}
            onHeightMeasured={handleHeightMeasured}
          />
        </div>
      );
    },
    [items, prefixCount, hasStartLabel, hasTopLoader, onMediaPreview, templates, handleHeightMeasured]
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="flex-1 overflow-hidden">
      <List
        ref={listRef}
        outerRef={outerRef}
        height={containerHeightRef.current}
        itemCount={totalCount}
        itemSize={getItemSize}
        width="100%"
        overscanCount={OVERSCAN_COUNT}
        onScroll={handleScroll}
        className="p-4"
        style={{ overscrollBehavior: "contain" }}
      >
        {renderRow}
      </List>
    </div>
  );
});

export { InfiniteMessageList };
