import React, { memo, useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, User, UserCheck, Clock, AlertCircle, Timer } from "lucide-react";
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
  unreadMode?: boolean;
  isBlocked?: boolean;
}

// Format the elapsed time waiting for a response in a compact, human-readable way (Portuguese).
// IMPORTANT: "tempo de espera" = tempo desde a ÚLTIMA mensagem do CLIENTE (inbound).
// Mensagens enviadas pelo atendente NÃO devem zerar nem alimentar este cálculo.
function formatWaitingTime(fromIso: string | null): string {
  if (!fromIso) return "—";
  const ms = Date.now() - new Date(fromIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin > 0 ? `${hours}h ${remMin}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

// Returns Tailwind classes for the waiting time badge based on severity
function getWaitingTimeSeverity(fromIso: string | null): {
  className: string;
  label: string;
} {
  if (!fromIso) return { className: "bg-muted text-muted-foreground", label: "—" };
  const ms = Date.now() - new Date(fromIso).getTime();
  const minutes = ms / 60000;
  if (minutes < 5) return { className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", label: "ok" };
  if (minutes < 30) return { className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", label: "atenção" };
  if (minutes < 120) return { className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30", label: "atraso" };
  return { className: "bg-destructive/15 text-destructive border-destructive/30", label: "crítico" };
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
  unreadMode,
  isBlocked,
}: ConversationItemProps) {
  const initials = getInitials(conversation.name);

  // Lightweight ticker so the waiting time badge updates roughly every 30s while in unread mode
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!unreadMode) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, [unreadMode]);

  const handleClick = () => {
    if (bulkMode && onBulkToggle) {
      onBulkToggle(conversation);
    } else {
      onSelect(conversation);
    }
  };

  // Unread mode metadata (waiting time + agent badge)
  // SOMENTE inbound conta como "espera". Sem inbound => sem espera (sem badge).
  const waitingFrom = conversation.lastInboundTime;
  const waitingSeverity = getWaitingTimeSeverity(waitingFrom);
  const waitingLabel = formatWaitingTime(waitingFrom);
  const hasAgent = !!conversation.assignedToName;

  return (
    <div
      className={cn(
        "w-full p-3 text-left transition-all rounded-lg hover:bg-muted/40",
        isSelected && !bulkMode && "bg-primary/10 border border-primary/20",
        !isSelected && !bulkMode && "border border-transparent",
        isRecentlyUpdated && !isSelected && "animate-pulse bg-primary/10 border-l-4 border-primary",
        bulkMode && isBulkSelected && "bg-primary/10 border border-primary/30",
        bulkMode && !isBulkSelected && "border border-transparent",
        isBlocked && "bg-destructive/20 border border-destructive/50 hover:bg-destructive/25"
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

          {unreadMode ? (
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {/* Atendente responsável */}
              {hasAgent ? (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-2 gap-1 bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 max-w-[140px]"
                  title={`Atendente: ${conversation.assignedToName}`}
                >
                  <UserCheck className="w-3 h-3 shrink-0" />
                  <span className="truncate">{conversation.assignedToName}</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-2 gap-1 bg-destructive/15 text-destructive border-destructive/30"
                  title="Sem atendente atribuído"
                >
                  <AlertCircle className="w-3 h-3" />
                  Sem atendente
                </Badge>
              )}

              {/* Tempo aguardando resposta */}
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] h-5 px-2 gap-1",
                  waitingSeverity.className
                )}
                title={`Aguardando há ${waitingLabel}`}
              >
                <Timer className="w-3 h-3" />
                {waitingLabel}
              </Badge>
            </div>
          ) : (
            conversation.assignedToName && (
              <div className="flex items-center gap-1 mb-0.5">
                <UserCheck className="w-3 h-3 text-blue-400" />
                <span className="text-[11px] text-blue-400 font-medium truncate">
                  {conversation.assignedToName}
                </span>
              </div>
            )
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
    prev.conversation.lastInboundTime === next.conversation.lastInboundTime &&
    prev.isSelected === next.isSelected &&
    prev.isRecentlyUpdated === next.isRecentlyUpdated &&
    prev.sectorName === next.sectorName &&
    prev.bulkMode === next.bulkMode &&
    prev.isBulkSelected === next.isBulkSelected &&
    prev.unreadMode === next.unreadMode &&
    prev.isBlocked === next.isBlocked
  );
});
