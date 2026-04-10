import { memo } from "react";
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
}: VirtualizedConversationListProps) {
  return (
    <div
      className="overflow-y-auto px-2"
      style={{ height, overscrollBehavior: "contain" }}
    >
      <div className="space-y-2 pb-2">
        {conversations.map((conv) => {
          const convKey = getConversationKey(conv);
          const isSelected = convKey === selectedConversationKey;
          const isRecentlyUpdated = recentlyUpdatedConversations.has(convKey);
          const sectorInfo = sectors.find((s) => s.id === conv.sectorId);

          return (
            <div
              key={convKey}
              className="cursor-pointer"
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
        })}

        {hasMore && onLoadMore ? (
          <div className="flex items-center justify-center p-3">
            <button
              onClick={onLoadMore}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Carregar mais…
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
