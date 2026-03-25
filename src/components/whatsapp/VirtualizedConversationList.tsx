import React, { useRef, useEffect, useMemo } from "react";
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

const ITEM_HEIGHT = 110;

// Shared context to avoid re-creating Row on every render
interface ItemData {
  conversations: Conversation[];
  selectedConversationKey: string | null;
  recentlyUpdatedConversations: Set<string>;
  sectors: Array<{ id: string; name: string }>;
  tagColors: Map<string, string>;
  onSelect: (conv: Conversation) => void;
  formatDate: (date: string) => string;
  getConversationKey: (conv: Conversation) => string;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

// Stable Row component defined OUTSIDE the parent — react-window will not lose it
const Row = ({ index, style, data }: ListChildComponentProps<ItemData>) => {
  const {
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
  } = data;

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

  const conv = conversations[index];
  if (!conv) return null;

  const convKey = getConversationKey(conv);
  const isSelected = convKey === selectedConversationKey;
  const isRecentlyUpdated = recentlyUpdatedConversations.has(convKey);
  const sectorInfo = sectors.find((s) => s.id === conv.sectorId);

  return (
    <div
      style={style}
      className="px-2 cursor-pointer"
      onClick={() => onSelect(conv)}
    >
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
};

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

  // Scroll to top when first conversation changes (new message bumps to top)
  const prevFirstKey = useRef<string | null>(null);
  useEffect(() => {
    const firstKey = conversations[0] ? getConversationKey(conversations[0]) : null;
    if (firstKey && firstKey !== prevFirstKey.current) {
      listRef.current?.scrollToItem(0, "start");
      prevFirstKey.current = firstKey;
    }
  }, [conversations, getConversationKey]);

  // itemData is passed to every Row via data prop — avoids stale closures
  const itemData = useMemo<ItemData>(
    () => ({
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
    }),
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

  const itemCount = conversations.length + (hasMore ? 1 : 0);

  return (
    <List
      ref={listRef}
      height={height}
      itemCount={itemCount}
      itemSize={ITEM_HEIGHT}
      width="100%"
      overscanCount={5}
      itemData={itemData}
      itemKey={(index, data) => {
        if (index >= data.conversations.length) return "load-more";
        return data.getConversationKey(data.conversations[index]);
      }}
    >
      {Row}
    </List>
  );
}
