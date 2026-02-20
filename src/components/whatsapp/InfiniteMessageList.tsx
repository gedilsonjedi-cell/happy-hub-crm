import { useEffect, useRef, useCallback, memo } from "react";
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

/**
 * InfiniteMessageList
 *
 * - Renders messages using memoized MessageBubble (no re-render per bubble when new msg arrives)
 * - IntersectionObserver at the TOP triggers fetchNextPage when user scrolls up
 * - Scroll is preserved: we anchor to bottom on mount and after new messages,
 *   and anchor to previous position when older pages load
 */
const InfiniteMessageList = memo(function InfiniteMessageList({
  messages,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onMediaPreview,
  templates,
}: InfiniteMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevMessageCountRef = useRef<number>(0);
  const isLoadingMoreRef = useRef(false);

  // Scroll to bottom on first load and when a new message is appended
  useEffect(() => {
    if (isLoading) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const newCount = messages.length;
    const prevCount = prevMessageCountRef.current;

    if (prevCount === 0 && newCount > 0) {
      // First load — jump to bottom
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    } else if (newCount > prevCount) {
      // New message appended — if already near bottom, stay there
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom < 200) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }

    prevMessageCountRef.current = newCount;
  }, [messages.length, isLoading]);

  // Restore scroll position after loading older pages (scroll up)
  useEffect(() => {
    if (!isFetchingNextPage) {
      const container = scrollContainerRef.current;
      if (!container || !isLoadingMoreRef.current) return;
      // Scroll so the user stays at the same relative position
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
      container.scrollTop = scrollDiff;
      isLoadingMoreRef.current = false;
    }
  }, [isFetchingNextPage]);

  // IntersectionObserver: when top sentinel enters view → load more
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      const container = scrollContainerRef.current;
      if (container) {
        prevScrollHeightRef.current = container.scrollHeight;
        isLoadingMoreRef.current = true;
      }
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  // Pre-compute date separators
  const datesShown = new Set<string>();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto p-4"
      style={{ overscrollBehavior: "contain" }}
    >
      {/* Top sentinel — triggers older page load when scrolled into view */}
      <div ref={topSentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasNextPage && messages.length > 0 && (
        <div className="text-center text-xs text-muted-foreground py-2">
          Início da conversa
        </div>
      )}

      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.map((message) => {
          const dateKey = format(new Date(message.created_at), "yyyy-MM-dd");
          const showDateSeparator = !datesShown.has(dateKey);
          if (showDateSeparator) datesShown.add(dateKey);

          return (
            <MessageBubble
              key={message.id}
              message={message}
              showDateSeparator={showDateSeparator}
              onMediaPreview={onMediaPreview}
              templates={templates}
            />
          );
        })}
      </div>

      <div ref={bottomRef} />
    </div>
  );
});

export { InfiniteMessageList };
