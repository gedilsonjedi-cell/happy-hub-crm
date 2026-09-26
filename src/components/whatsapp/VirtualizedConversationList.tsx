import { memo, useCallback } from "react";
import { FixedSizeList, ListChildComponentProps } from "react-window";
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
  bulkMode?: boolean;
  bulkSelectedKeys?: Set<string>;
  onBulkToggle?: (conv: Conversation) => void;
  unreadMode?: boolean;
  isBlocked?: (phone: string) => boolean;
}

// react-window requires pixel values; these mirror the compact Tailwind scale.
const ITEM_HEIGHT = 94;
const ITEM_HEIGHT_UNREAD = 116;

interface RowData {
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
  bulkMode?: boolean;
  bulkSelectedKeys?: Set<string>;
  onBulkToggle?: (conv: Conversation) => void;
  unreadMode?: boolean;
  isBlocked?: (phone: string) => boolean;
}

const Row = memo(function Row({ index, style, data }: ListChildComponentProps<RowData>) {
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
    bulkMode,
    bulkSelectedKeys,
    onBulkToggle,
    unreadMode,
    isBlocked,
  } = data;

  // Last item is the "load more" button
  if (index === conversations.length) {
    return (
      <div style={style} className="flex items-center justify-center p-3">
        <button
          onClick={onLoadMore}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Carregar mais…
        </button>
      </div>
    );
  }

  const conv = conversations[index];
  if (!conv) return null;

  const convKey = getConversationKey(conv);
  const isSelected = convKey === selectedConversationKey;
  const isRecentlyUpdated = recentlyUpdatedConversations.has(convKey);
  const sectorInfo = sectors.find((s) => s.id === conv.sectorId);
  const isBulkSelected = bulkSelectedKeys?.has(convKey) ?? false;
  const blocked = isBlocked ? isBlocked(conv.phone) : false;

  return (
    <div style={style} className="px-2 pb-2.5 cursor-pointer" onClick={() => {
      if (!bulkMode) onSelect(conv);
    }}>
      <ConversationItem
        conversation={conv}
        isSelected={isSelected}
        isRecentlyUpdated={isRecentlyUpdated}
        sectorName={sectorInfo?.name}
        tagColors={tagColors}
        onSelect={onSelect}
        formatDate={formatDate}
        bulkMode={bulkMode}
        isBulkSelected={isBulkSelected}
        onBulkToggle={onBulkToggle}
        unreadMode={unreadMode}
        isBlocked={blocked}
      />
    </div>
  );
});

export const VirtualizedConversationList = memo(function VirtualizedConversationList({
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
  bulkMode,
  bulkSelectedKeys,
  onBulkToggle,
  unreadMode,
  isBlocked,
}: VirtualizedConversationListProps) {
  const itemCount = conversations.length + (hasMore && onLoadMore ? 1 : 0);

  const itemData: RowData = {
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
    bulkMode,
    bulkSelectedKeys,
    onBulkToggle,
    unreadMode,
    isBlocked,
  };

  const handleItemsRendered = useCallback(
    ({ visibleStopIndex }: { visibleStopIndex: number }) => {
      // Auto-load more when user scrolls near the end
      if (
        hasMore &&
        onLoadMore &&
        visibleStopIndex >= conversations.length - 5
      ) {
        onLoadMore();
      }
    },
    [hasMore, onLoadMore, conversations.length]
  );

  return (
    <FixedSizeList
      height={height}
      itemCount={itemCount}
      itemSize={unreadMode ? ITEM_HEIGHT_UNREAD : ITEM_HEIGHT}
      width="100%"
      itemData={itemData}
      overscanCount={5}
      onItemsRendered={handleItemsRendered}
      style={{ overscrollBehavior: "contain" }}
    >
      {Row}
    </FixedSizeList>
  );
});
