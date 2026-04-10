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
 * InfiniteMessageList — standard DOM rendering with infinite scroll.
 * No virtualization to preserve text selection, copying, and click interactions.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const isLoadingMoreRef = useRef(false);
  const prevScrollHeightRef = useRef<number>(0);

  // Build date separator set
  const getDateKey = (dateStr: string) => format(new Date(dateStr), "yyyy-MM-dd");
  const datesShown = new Set<string>();

  // Scroll to bottom on first load and new messages
  useEffect(() => {
    if (isLoading) return;
    const container = containerRef.current;
    if (!container) return;

    const newCount = messages.length;
    const prevCount = prevMessageCountRef.current;

    if (prevCount === 0 && newCount > 0) {
      // First load — jump to bottom
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    } else if (newCount > prevCount && !isLoadingMoreRef.current) {
      // New message appended — if near bottom, scroll down
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom < 200) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    }

    prevMessageCountRef.current = newCount;
  }, [messages.length, isLoading]);

  // Maintain scroll position when older messages are prepended
  useEffect(() => {
    if (!isFetchingNextPage && isLoadingMoreRef.current) {
      isLoadingMoreRef.current = false;
      const container = containerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const diff = newScrollHeight - prevScrollHeightRef.current;
        container.scrollTop += diff;
      }
    }
  }, [isFetchingNextPage]);

  // Detect scroll near top → load more
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (container.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      isLoadingMoreRef.current = true;
      prevScrollHeightRef.current = container.scrollHeight;
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Reset date tracking for each render
  datesShown.clear();

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4"
      onScroll={handleScroll}
      style={{ overscrollBehavior: "contain" }}
    >
      {/* Start of conversation label */}
      {!hasNextPage && messages.length > 0 && (
        <div className="text-center text-xs text-muted-foreground py-2">
          Início da conversa
        </div>
      )}

      {/* Loading older messages */}
      {isFetchingNextPage && (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Messages */}
      {messages.map((msg) => {
        const dateKey = getDateKey(msg.created_at);
        const showDate = !datesShown.has(dateKey);
        if (showDate) datesShown.add(dateKey);

        return (
          <div key={msg.id}>
            {showDate && (
              <div className="flex justify-center py-2">
                <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {dateKey}
                </span>
              </div>
            )}
            <MessageBubble
              message={msg}
              showDateSeparator={false}
              onMediaPreview={onMediaPreview}
              templates={templates}
            />
          </div>
        );
      })}
    </div>
  );
});

export { InfiniteMessageList };
