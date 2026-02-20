import React, { useCallback, useRef, useEffect } from "react";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import { ConversationItem } from "./ConversationItem";

interface Conversation {
  id?: string;
  phone: string;
  name: string | null;
  lastMessage: string;
  lastMessageTime: string;
  lastInboundTime: string | null;
  unreadCount: number;
  channelId: string | null;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  sectorId: string | null;
  tags: string[] | null;
}

interface VirtualizedConversationListProps {
  conversations: Conversation[];
  selectedConversationKey: string | null;
  recentlyUpdatedConversations: Set<string>;
  sectors: Array<{ id: string; name: string }>;
  tagColors: Map<string, string>;
  onSelect: (conv: Conversation) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  formatDate: (date: string) => string;
  getConversationKey: (conv: Conversation) => string;
  height: number;
}

// Approximate item height: avatar (40) + padding (24) + name row + content rows ~= 80px
const ITEM_HEIGHT = 80;

export function VirtualizedConversationList({
  conversations,
  selectedConversationKey,
  recentlyUpdatedConversations,
  sectors,
  tagColors,
  onSelect,
  onLoadMore,
  hasMore,
  formatDate,
  getConversationKey,
  height,
}: VirtualizedConversationListProps) {
  const listRef = useRef<List>(null);

  // When the conversations list updates (e.g. new message bumps to top),
  // scroll to top so the agent sees the updated item
  const prevFirstKey = useRef<string | null>(null);
  useEffect(() => {
    const firstKey = conversations[0] ? getConversationKey(conversations[0]) : null;
    if (firstKey && firstKey !== prevFirstKey.current) {
      // Only scroll to top if the first item changed (a conversation moved up)
      listRef.current?.scrollToItem(0, "start");
      prevFirstKey.current = firstKey;
    }
  }, [conversations, getConversationKey]);

  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const conv = conversations[index];

      // Sentinel row — triggers load-more
      if (index === conversations.length) {
        return (
          <div style={style} className="flex items-center justify-center p-3">
            {hasMore ? (
              <button
                onClick={onLoadMore}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Carregar mais…
              </button>
            ) : null}
          </div>
        );
      }

      if (!conv) return null;

      const convKey = getConversationKey(conv);
      const isSelected = convKey === selectedConversationKey;
      const isRecentlyUpdated = recentlyUpdatedConversations.has(convKey);
      const sectorInfo = sectors.find((s) => s.id === conv.sectorId);

      return (
        <div style={style} className="px-2 py-3">
          <ConversationItem
            conversation={conv}
            isSelected={isSelected}
            isRecentlyUpdated={isRecentlyUpdated}
            sectorName={sectorInfo?.name}
            tagColors={tagColors}
            onSelect={onSelect}
            formatDate={formatDate}
          />
        </div>
      );
    },
    [
      conversations,
      selectedConversationKey,
      recentlyUpdatedConversations,
      sectors,
      tagColors,
      onSelect,
      formatDate,
      getConversationKey,
      hasMore,
      onLoadMore,
    ]
  );

  // Count includes a sentinel row for load-more
  const itemCount = conversations.length + (hasMore ? 1 : 0);

  return (
    <List
      ref={listRef}
      height={height}
      itemCount={itemCount}
      itemSize={ITEM_HEIGHT}
      width="100%"
      overscanCount={5}
    >
      {Row}
    </List>
  );
}
