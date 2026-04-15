import React, { memo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, User, UserCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  isRecentlyUpdated: boolean;
  sectorName?: string;
  tagColors: Map<string, string>;
  onSelect: (conv: Conversation) => void;
  formatDate: (date: string) => string;
  bulkMode?: boolean;
  isBulkSelected?: boolean;
  onBulkToggle?: (conv: Conversation) => void;
}

function getInitials(name: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  isRecentlyUpdated,
  sectorName,
  tagColors,
  onSelect,
  formatDate,
  bulkMode,
  isBulkSelected,
  onBulkToggle,
}: ConversationItemProps) {
  const initials = getInitials(conversation.name);

  const handleClick = () => {
    if (bulkMode && onBulkToggle) {
      onBulkToggle(conversation);
    } else {
      onSelect(conversation);
    }
  };

  return (
    <div
      className={cn(
        "w-full p-3 text-left transition-all rounded-lg hover:bg-muted/40",
        isSelected && !bulkMode && "bg-primary/10 border border-primary/20",
        !isSelected && !bulkMode && "border border-transparent",
        isRecentlyUpdated && !isSelected && "animate-pulse bg-primary/10 border-l-4 border-primary",
        bulkMode && isBulkSelected && "bg-primary/10 border border-primary/30",
        bulkMode && !isBulkSelected && "border border-transparent"
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox for bulk mode */}
        {bulkMode && (
          <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isBulkSelected}
              onCheckedChange={() => onBulkToggle?.(conversation)}
            />
          </div>
        )}

        {/* Avatar with initials */}
        <div className="relative shrink-0">
          <Avatar className="w-10 h-10">
            <AvatarFallback
              className={cn(
                "text-sm font-semibold",
                initials
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {initials || <User className="w-4 h-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
            <MessageSquare className="w-2.5 h-2.5 text-white" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="font-medium text-foreground text-sm truncate flex-1 min-w-0">
              {conversation.name || conversation.phone}
            </span>
            {sectorName && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-2 bg-primary text-primary-foreground border-0 shrink-0 max-w-[90px] truncate"
              >
                {sectorName}
              </Badge>
            )}
          </div>

          {/* Tags */}
          {conversation.tags && conversation.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-0.5">
              {conversation.tags.slice(0, 3).map((tagName, idx) => {
                const tagColor = tagColors.get(tagName) || "#6366f1";
                return (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-[9px] h-4 px-1.5 border-0"
                    style={{
                      backgroundColor: tagColor + "30",
                      color: tagColor,
                    }}
                  >
                    {tagName}
                  </Badge>
                );
              })}
              {conversation.tags.length > 3 && (
                <Badge
                  variant="outline"
                  className="text-[9px] h-4 px-1.5 bg-muted text-muted-foreground border-0"
                >
                  +{conversation.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {conversation.assignedToName && (
            <div className="flex items-center gap-1 mb-0.5">
              <UserCheck className="w-3 h-3 text-blue-400" />
              <span className="text-[11px] text-blue-400 font-medium truncate">
                {conversation.assignedToName}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
              {conversation.lastMessage || "Sem histórico"}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(conversation.lastMessageTime)}
              </span>
              {conversation.unreadCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                  {conversation.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
},
// Custom comparison: only re-render if relevant data changed
(prev, next) => {
  return (
    prev.conversation.id === next.conversation.id &&
    prev.conversation.lastMessage === next.conversation.lastMessage &&
    prev.conversation.lastMessageTime === next.conversation.lastMessageTime &&
    prev.conversation.unreadCount === next.conversation.unreadCount &&
    prev.conversation.name === next.conversation.name &&
    prev.conversation.status === next.conversation.status &&
    prev.conversation.assignedTo === next.conversation.assignedTo &&
    prev.conversation.assignedToName === next.conversation.assignedToName &&
    prev.conversation.sectorId === next.conversation.sectorId &&
    prev.conversation.tags === next.conversation.tags &&
    prev.isSelected === next.isSelected &&
    prev.isRecentlyUpdated === next.isRecentlyUpdated &&
    prev.sectorName === next.sectorName &&
    prev.bulkMode === next.bulkMode &&
    prev.isBulkSelected === next.isBulkSelected
  );
});
