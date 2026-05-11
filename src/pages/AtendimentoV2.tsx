import { useState, useEffect, useRef, useCallback, useMemo, startTransition } from "react";
import { useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { useInfiniteMessages, upsertMessageIntoInfiniteCache } from "@/hooks/useInfiniteMessages";
import { usePrefetchAdjacentConversations } from "@/hooks/usePrefetchAdjacentConversations";
import { useSendMessage } from "@/hooks/useSendMessage";
import { InfiniteMessageList } from "@/components/whatsapp/InfiniteMessageList";
import { VirtualizedConversationList } from "@/components/whatsapp/VirtualizedConversationList";
import { MessageComposer, type MessageComposerHandle } from "@/components/whatsapp/MessageComposer";
import { 
  MessageSquare, 
  Send, 
  Search,
  Phone,
  MoreVertical,
  ArrowLeft,
  Bell,
  BellOff,
  Loader2,
  User,
  Check,
  CheckCheck,
  Clock,
  Paperclip,
  Archive,
  Play,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Zap,
  FileText,
  Image,
  Bot,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Ban,
  Briefcase,
  Tag,
  GitBranch,
  Video,
  Music,
  File,
  CalendarClock,
  StickyNote,
  Plus,
  Mic,
  Square,
  X,
  UserCheck,
  ZoomIn,
  History,
  Download,
  Users
} from "lucide-react";
import { TopNavLayout } from "@/components/layout/TopNavLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchConversationSummaryExternal,
  fetchAttendantConversationsExternal,
  fetchUnreadConversationsExternal,
  searchConversationsGlobalExternal,
  fetchAssignmentByPhoneExternal,
  fetchAssignmentsByChannelsExternal,
} from "@/lib/conversationsExternal";
import { assignmentsWrite, getExternalAssignments } from "@/lib/externalAssignments";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserSectors } from "@/hooks/useUserSectors";
import { cn } from "@/lib/utils";
import {
  getCanonicalPhoneThreadKey,
  phonesShareSameThread,
} from "@/lib/phoneThreadKey";
import { recordSwitchLatency, recordSelectionCacheOutcome } from "@/lib/perfMetrics";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatErrorDisplay } from "@/lib/metaErrorMessages";
import {
  fetchConversationStatsMessages,
  fetchExternalMessages,
  fetchBulkPreviews,
  getPreviewTextFromBulkResult,
} from "@/lib/externalDb";
import { createRealtimeBatcher } from "@/lib/realtimeThrottle";

import { QuickResponsesPanel } from "@/components/whatsapp/QuickResponsesPanel";
import { QuickResponsesAutocomplete } from "@/components/whatsapp/QuickResponsesAutocomplete";
import { TemplateSelector } from "@/components/whatsapp/TemplateSelector";
import { ManualSendDialog } from "@/components/whatsapp/ManualSendDialog";
import { SalesAssistant } from "@/components/whatsapp/SalesAssistant";
import { ChannelHistoryDialog } from "@/components/whatsapp/ChannelHistoryDialog";

import { AddToPortfolioDialog } from "@/components/whatsapp/AddToPortfolioDialog";
import { AssignTagsFromChatDialog } from "@/components/whatsapp/AssignTagsFromChatDialog";
import { FollowUpDialog } from "@/components/whatsapp/FollowUpDialog";
import { ChangePipelineStageDialog } from "@/components/whatsapp/ChangePipelineStageDialog";
import { ScheduleMessageDialog } from "@/components/whatsapp/ScheduleMessageDialog";
import { ConversationNotesDialog } from "@/components/whatsapp/ConversationNotesDialog";
import { LeadDetailsDialog } from "@/components/whatsapp/LeadDetailsDialog";
import { AssignAttendantDialog } from "@/components/whatsapp/AssignAttendantDialog";
import { BulkTransferDialog } from "@/components/whatsapp/BulkTransferDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SaleConfirmationDialog } from "@/components/whatsapp/SaleConfirmationDialog";
import { MediaPreviewDialog } from "@/components/whatsapp/MediaPreviewDialog";
import { AttendantFilter } from "@/components/whatsapp/AttendantFilter";
import { SectorFilter } from "@/components/whatsapp/SectorFilter";
import { useAudioRecording } from "@/hooks/useAudioRecording";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface Message {
  id: string;
  channel_id: string | null;
  message_id: string;
  sender_phone: string;
  sender_name: string | null;
  message_type: string;
  content: string | null;
  media_url: string | null;
  direction: string;
  status: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  error_message?: string | null;
}

interface ConversationNote {
  id: string;
  content: string;
  created_at: string;
  created_by: string;
}

interface Conversation {
  id?: string; // ID do conversation_assignment no banco
  phone: string;
  name: string | null;
  lastMessage: string;
  lastMessageTime: string;
  lastInboundTime: string | null;
  unreadCount: number;
  channelId: string | null;
  status: "pending" | "in_progress" | "resolved" | "archived";
  assignedTo: string | null;
  assignedToName: string | null;
  sectorId: string | null;
  tags: string[] | null;
}

interface ConversationSummaryRow {
  assignment_id: string;
  conversation_phone: string | null;
  channel_id: string | null;
  assigned_to: string | null;
  status: string | null;
  sector_id: string | null;
  lead_id: string | null;
  updated_at?: string;
  assignment_updated_at?: string;
  last_message?: string | null;
  last_message_content?: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number | null;
  sender_name: string | null;
  lead_name: string | null;
  lead_tags: string[] | null;
  assigned_to_name: string | null;
  is_bot_handling?: boolean;
  campaign_chatbot_id?: string | null;
  bot_paused_until?: string | null;
}

interface ConversationSummaryMapping {
  conversations: Conversation[];
  leadLookups: {
    byPhone: Map<string, { id?: string; name: string; tags: string[] | null }>;
    bySuffix: Map<string, { id?: string; name: string; tags: string[] | null }>;
  };
  statuses: Record<string, Conversation["status"]>;
}

const hasAssignedAgent = (conversation: Pick<Conversation, "assignedTo" | "assignedToName">) => {
  return Boolean(conversation.assignedTo || conversation.assignedToName);
};

const getConversationDataScore = (conversation: Conversation) => {
  let score = 0;

  if (conversation.channelId) score += 100;
  if (conversation.lastInboundTime) score += 40;
  if (conversation.lastMessage) score += 20;
  if (conversation.unreadCount > 0) score += 10;
  if (hasAssignedAgent(conversation)) score += 5;

  return score;
};

const sanitizeConversationCollection = (
  items: Conversation[],
  validChannelIds: Set<string>
): Conversation[] => {
  const deduped = new Map<string, Conversation>();

  items.forEach((conversation) => {
    const normalizedPhone = conversation.phone.replace(/\D/g, "");

    if (!normalizedPhone || !conversation.channelId || !validChannelIds.has(conversation.channelId)) {
      return;
    }

    const key = `${conversation.channelId}_${getCanonicalPhoneThreadKey(normalizedPhone)}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, conversation);
      return;
    }

    const candidateScore = getConversationDataScore(conversation);
    const existingScore = getConversationDataScore(existing);
    const candidateTime = new Date(conversation.lastMessageTime || conversation.lastInboundTime || 0).getTime();
    const existingTime = new Date(existing.lastMessageTime || existing.lastInboundTime || 0).getTime();

    if (candidateScore > existingScore || (candidateScore === existingScore && candidateTime > existingTime)) {
      deduped.set(key, conversation);
    }
  });

  return Array.from(deduped.values()).sort(
    (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
  );
};

// Helper function to normalize phone numbers consistently
const normalizePhoneNumber = (phone: string): string => {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.length <= 11 && !normalized.startsWith('55')) {
    normalized = '55' + normalized;
  }
  return normalized;
};

const getConversationThreadKey = (
  channelId: string | null | undefined,
  phone: string
): string => {
  const normalizedPhone = normalizePhoneNumber(phone);
  return `${channelId || 'unknown'}_${getCanonicalPhoneThreadKey(normalizedPhone)}`;
};

const getPhoneComparisonVariants = (phone: string): string[] => {
  const normalized = normalizePhoneNumber(phone);
  const variants = new Set<string>([normalized]);

  if (normalized.startsWith('55') && normalized.length >= 12) {
    const withoutCountry = normalized.slice(2);
    const areaCode = withoutCountry.slice(0, 2);
    const localNumber = withoutCountry.slice(2);

    if (localNumber.length === 9 && localNumber.startsWith('9')) {
      variants.add(`55${areaCode}${localNumber.slice(1)}`);
    } else if (localNumber.length === 8) {
      variants.add(`55${areaCode}9${localNumber}`);
    }
  }

  return Array.from(variants);
};

const phonesMatch = (phoneA?: string | null, phoneB?: string | null): boolean => {
  if (!phoneA || !phoneB) return false;

  return normalizePhoneNumber(phoneA) === normalizePhoneNumber(phoneB);
};

const buildMessageLookupVariants = (phone: string): string[] => {
  const variants = new Set<string>();

  getPhoneComparisonVariants(phone).forEach((variant) => {
    variants.add(variant);
    variants.add(`+${variant}`);
  });

  return Array.from(variants);
};

const getMessagePreviewText = (message: {
  content?: string | null;
  message_type?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  if (message.content?.trim()) return message.content;

  if (message.message_type === "template") {
    const metadata = message.metadata as { templateName?: string } | null;
    return metadata?.templateName ? `Template: ${metadata.templateName}` : "Template enviado";
  }

  if (message.message_type === "image") return "[Imagem]";
  if (message.message_type === "video") return "[Vídeo]";
  if (message.message_type === "audio" || message.message_type === "ptt") return "[Áudio]";
  if (message.message_type === "document") return "[Documento]";
  if (message.message_type === "button") return "[Botão]";
  if (message.message_type === "sticker") return "[Sticker]";

  return message.message_type ? `[${message.message_type}]` : "[Mensagem]";
};

const getSummaryPreviewText = (
  row: Pick<
    ConversationSummaryRow,
    "last_message" | "last_message_content" | "last_message_at" | "last_inbound_at" | "unread_count"
  >
) => {
  const msg = row.last_message || row.last_message_content;
  if (msg?.trim()) {
    return msg;
  }

  // Don't use generic placeholders — leave empty so the enrichment system
  // can fetch real content from the external DB via bulk previews
  return "";
};

const hasPendingHumanReplyFromSummary = (
  row: Pick<ConversationSummaryRow, "last_message_at" | "last_inbound_at">
) => {
  if (!row.last_inbound_at) return false;
  if (!row.last_message_at) return true;
  return new Date(row.last_message_at).getTime() <= new Date(row.last_inbound_at).getTime();
};

const getEffectiveUnreadCount = (
  row: Pick<ConversationSummaryRow, "last_message_at" | "last_inbound_at" | "unread_count">
) => {
  const persistedCount = Number(row.unread_count) || 0;
  return persistedCount > 0 ? persistedCount : hasPendingHumanReplyFromSummary(row) ? 1 : 0;
};

const mapConversationSummaryRows = (
  rows: ConversationSummaryRow[]
): ConversationSummaryMapping => {
  const leadsByPhone = new Map<string, { id?: string; name: string; tags: string[] | null }>();
  const leadsBySuffix = new Map<string, { id?: string; name: string; tags: string[] | null }>();
  const statuses: Record<string, Conversation["status"]> = {};

  const upsertLeadLookup = (
    phone: string,
    leadData: { id?: string; name: string; tags: string[] | null }
  ) => {
    const normalizedPhone = phone.replace(/\D/g, "");
    if (!normalizedPhone) return;

    const phoneWithout55 = normalizedPhone.startsWith("55")
      ? normalizedPhone.slice(2)
      : normalizedPhone;
    const phoneWith55 = normalizedPhone.startsWith("55")
      ? normalizedPhone
      : `55${normalizedPhone}`;
    const variants = [normalizedPhone, phoneWithout55, phoneWith55];
    const suffixes = [normalizedPhone.slice(-9), normalizedPhone.slice(-8)].filter(Boolean);

    variants.forEach((variant) => {
      const existing = leadsByPhone.get(variant);
      if (
        !existing ||
        (!existing.name && leadData.name) ||
        (!existing.tags?.length && leadData.tags?.length)
      ) {
        leadsByPhone.set(variant, leadData);
      }
    });

    suffixes.forEach((suffix) => {
      const existing = leadsBySuffix.get(suffix);
      if (
        !existing ||
        (!existing.name && leadData.name) ||
        (!existing.tags?.length && leadData.tags?.length)
      ) {
        leadsBySuffix.set(suffix, leadData);
      }
    });
  };

  const conversations = rows
    .filter((row) => !!row.channel_id)
    .map((row) => {
      const normalizedPhone = (row.conversation_phone || "").replace(/\D/g, "");
      const displayPhone = normalizedPhone ? `+${normalizedPhone}` : "";
      const leadName = row.lead_name?.trim() || "";
      const isAutoGenerated =
        leadName.startsWith("LeadWhats-") || leadName.startsWith("WhatsApp ");
      const resolvedLeadName = isAutoGenerated ? "" : leadName;
      const resolvedTags = row.lead_tags && row.lead_tags.length > 0 ? row.lead_tags : null;
      const mappedStatus = mapConversationStatus(row.status);

      statuses[getConversationThreadKey(row.channel_id, normalizedPhone)] = mappedStatus;

      if (normalizedPhone && (resolvedLeadName || resolvedTags)) {
        upsertLeadLookup(normalizedPhone, {
          id: row.lead_id || undefined,
          name: resolvedLeadName,
          tags: resolvedTags,
        });
      }

      return {
        id: row.assignment_id,
        phone: displayPhone,
        name: resolvedLeadName || row.sender_name || null,
        lastMessage: getSummaryPreviewText(row),
        lastMessageTime: row.last_message_at || row.assignment_updated_at || row.updated_at || new Date().toISOString(),
        lastInboundTime: row.last_inbound_at || null,
        unreadCount: getEffectiveUnreadCount(row),
        channelId: row.channel_id,
        status: mappedStatus,
        assignedTo: row.assigned_to || null,
        assignedToName: row.assigned_to_name || null,
        sectorId: row.sector_id || null,
        tags: resolvedTags,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );

  return {
    conversations,
    leadLookups: { byPhone: leadsByPhone, bySuffix: leadsBySuffix },
    statuses,
  };
};

interface Channel {
  id: string;
  name: string;
  phone: string;
  provider: string;
}

interface Sector {
  id: string;
  name: string;
}

interface LeadTagInfo {
  name: string;
  color: string;
}

interface QuickResponse {
  shortcut: string | null;
  content: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/30" },
  in_progress: { label: "Em atendimento", className: "bg-primary/10 text-primary border-primary/30" },
  resolved: { label: "Resolvido", className: "bg-muted text-muted-foreground border-border" },
  archived: { label: "Arquivado", className: "bg-destructive/10 text-destructive border-destructive/30" },
  active: { label: "Ativo", className: "bg-primary/10 text-primary border-primary/30" }
};

const getStatusConfig = (status: string) => {
  return statusConfig[status] || { label: status || "Pendente", className: "bg-muted text-muted-foreground border-border" };
};

const mapConversationStatus = (
  status: string | null | undefined
): Conversation["status"] => {
  if (status === "active" || status === "in_progress") return "in_progress";
  if (status === "archived") return "archived";
  if (status === "resolved") return "resolved";
  return "pending";
};

type FilterStatus = "new" | "mine" | "others" | "unread";

// Audio notification using Web Audio API — with throttle to prevent audio stacking
const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef<number>(0);
  const THROTTLE_MS = 2000; // Max 1 sound per 2 seconds
  
  const playNotificationSound = useCallback(() => {
    const now = Date.now();
    if (now - lastPlayedRef.current < THROTTLE_MS) return; // Skip if too soon
    lastPlayedRef.current = now;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1047, ctx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (error) {
      console.log("Could not play notification sound:", error);
    }
  }, []);
  
  return playNotificationSound;
};

const AtendimentoV2 = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { effectiveOrganizationId, isImpersonating, impersonatedOrganizationId } = useEffectiveOrganizationId();
  // Quando super_admin está visualizando outra organização, todos os reads
  // diretos no banco externo precisam usar um JWT com a claim organization_id
  // do cliente impersonado — caso contrário a RLS do externo bloqueia tudo
  // e a sidebar fica vazia até um Ctrl+Shift+R.
  const externalImpersonatedOrgId = isImpersonating ? impersonatedOrganizationId ?? null : null;
  const { canInteractWithSector, sectorIds, loading: sectorsLoading } = useUserSectors();
  const { isAdmin: roleIsAdmin, isSupervisor: roleIsSupervisor, isSuperAdmin: roleIsSuperAdmin } = useUserRole();
  const canSeeAllConversations = roleIsAdmin || roleIsSupervisor || roleIsSuperAdmin;
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [conversationOffset, setConversationOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const CONVERSATIONS_PAGE_SIZE = 100;
  const AUTO_LOAD_PAGES_PER_CONTEXT = 5;
  const MIN_VISIBLE_CONVERSATIONS_BY_FILTER: Record<FilterStatus, number> = {
    new: 1,
    unread: 1,
    mine: 12,
    others: 12,
  };
  
  // Ref to track locally created conversations to prevent realtime duplicates
  const locallyCreatedConversationsRef = useRef<Set<string>>(new Set());
  const [phoneToOpen, setPhoneToOpen] = useState<string | null>(searchParams.get("phone"));
  const [channelIdToOpen] = useState<string | null>(searchParams.get("channelId"));
  const [conversationNotes, setConversationNotes] = useState<ConversationNote[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  
  // CRITICAL: Build a set of valid channel IDs for safety filtering
  const validChannelIds = useMemo(() => new Set(channels.map(c => c.id)), [channels]);
  
  // Final conversation list shown by the UI:
  // - only channel-backed threads that belong to this organization
  // - deduplicated by channel + canonical phone thread key
  // - visibility is organization-wide for active/pending conversations
  // Interaction permissions remain enforced separately via canInteractWithSector.
  const conversations = useMemo(
    () => sanitizeConversationCollection(allConversations, validChannelIds),
    [allConversations, validChannelIds]
  );
  
  // Map of user_id -> set of sector_ids they belong to (for cross-referencing filter)
  const [attendantSectorsMap, setAttendantSectorsMap] = useState<Map<string, Set<string>>>(new Map());
  
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [tagColors, setTagColors] = useState<Map<string, string>>(new Map());
  const [templates, setTemplates] = useState<Map<string, { 
    content: string; 
    variables: string[] | null;
    components: { buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }> } | null;
  }>>(new Map());
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageWindowBaseTime, setMessageWindowBaseTime] = useState<string | null>(null);
  const [selectedConversationStableKey, setSelectedConversationStableKey] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMessage] = [false]; // Kept for legacy references; replaced by isSendingMessage from useMutation
  // newMessage now lives inside <MessageComposer> so typing does NOT re-render
  // this 4800-line component. We read/write the draft via the imperative ref.
  const composerRef = useRef<MessageComposerHandle | null>(null);
  const getNewMessage = useCallback(() => composerRef.current?.getValue() ?? "", []);
  const setNewMessage = useCallback((value: string) => {
    composerRef.current?.setValue(value);
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<Conversation[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("new");
  const [showArchived, setShowArchived] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterByAttendant, setFilterByAttendant] = useState<string | null>(null);
  const [filterBySector, setFilterBySector] = useState<string | null>(null);
  // Ordenação por tempo de espera (apenas aba "Não Lidos"). null = padrão (sem reordenação extra).
  // 'desc' = maior tempo de espera primeiro · 'asc' = menor tempo de espera primeiro
  const [unreadWaitSort, setUnreadWaitSort] = useState<"desc" | "asc" | null>(null);
  
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [showQuickResponsesAutocomplete, setShowQuickResponsesAutocomplete] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showManualSendDialog, setShowManualSendDialog] = useState(false);
  const [manualPhoneInput, setManualPhoneInput] = useState("");
  const [showSalesAssistant, setShowSalesAssistant] = useState(false);
  const [showPortfolioDialog, setShowPortfolioDialog] = useState(false);
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [showPipelineStageDialog, setShowPipelineStageDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showLeadDetailsDialog, setShowLeadDetailsDialog] = useState(false);
  const [showAssignAttendantDialog, setShowAssignAttendantDialog] = useState(false);
  const [showSaleConfirmationDialog, setShowSaleConfirmationDialog] = useState(false);
  const [conversationToArchive, setConversationToArchive] = useState<Conversation | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{
    isOpen: boolean;
    url: string;
    type: "image" | "video" | "document" | "file" | "sticker";
    fileName?: string;
  }>({ isOpen: false, url: "", type: "image" });
  const [contactTags, setContactTags] = useState<string[]>([]);
  const [quickResponses, setQuickResponses] = useState<QuickResponse[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isConvertingAudio, setIsConvertingAudio] = useState(false);
  const [pastedImage, setPastedImage] = useState<{ file: File; preview: string } | null>(null);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<Set<string>>(new Set());
  const [showBulkTransferDialog, setShowBulkTransferDialog] = useState(false);
  const [conversationRefetchTrigger, setConversationRefetchTrigger] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  // Container ref + measured height for the virtualized conversation list
  const conversationListContainerRef = useRef<HTMLDivElement>(null);
  const [conversationListHeight, setConversationListHeight] = useState(600);
  
  const playNotificationSound = useNotificationSound();
  const { 
    isRecording, 
    recordingDuration, 
    startRecording, 
    stopRecording, 
    cancelRecording
  } = useAudioRecording();

  const [conversationStatuses, setConversationStatuses] = useState<Record<string, Conversation["status"]>>({});
  
  // Track conversations with recent new messages for visual highlight
  const [recentlyUpdatedConversations, setRecentlyUpdatedConversations] = useState<Set<string>>(new Set());

  // ─── Infinite message loading ──────────────────────────────────────────────
  // Replaces the old fetchMessagesAndNotes + setMessages pattern.
  // Loads 40 messages per page; scrolling up fetches older pages automatically.
  const selectedChannelPhone = useMemo(() => {
    if (!selectedConversation?.channelId) return null;
    const ch = channels.find(c => c.id === selectedConversation.channelId);
    return ch?.phone ?? null;
  }, [selectedConversation?.channelId, channels]);

  const infiniteMessages = useInfiniteMessages(
    selectedConversation?.channelId ?? null,
    selectedConversation?.phone ?? null,
    selectedChannelPhone
  );
  const messages = useMemo(
    () => infiniteMessages.messages as Message[],
    [infiniteMessages.messages]
  );
  const selectedConversationCacheKey = `${selectedConversation?.channelId ?? "no-channel"}:${selectedConversation?.phone ? getCanonicalPhoneThreadKey(selectedConversation.phone) : "no-phone"}`;

  // ─── Auto-retry: if a conversation gets stuck "loading" with no messages,
  // force-reset the direct-read circuit breaker and refetch automatically so
  // the user never has to do Ctrl+Shift+R. Triggers after 2s of empty loading
  // and again at 5s as a hard fallback.
  const autoRetryRef = useRef<{ key: string; attempts: number }>({ key: "", attempts: 0 });
  useEffect(() => {
    if (!selectedConversation?.channelId || !selectedConversation?.phone) return;
    if (autoRetryRef.current.key !== selectedConversationCacheKey) {
      autoRetryRef.current = { key: selectedConversationCacheKey, attempts: 0 };
    }

    const isStuck = () =>
      infiniteMessages.isLoading && infiniteMessages.messages.length === 0;

    if (!isStuck()) return;

    const t1 = setTimeout(async () => {
      if (!isStuck() || autoRetryRef.current.attempts >= 1) return;
      autoRetryRef.current.attempts = 1;
      const { resetDirectReadCircuit } = await import("@/lib/externalDb");
      const { clearExternalClient } = await import("@/lib/externalSupabaseClient");
      resetDirectReadCircuit();
      clearExternalClient();
      infiniteMessages.refetchLatestPage();
    }, 1200);

    const t2 = setTimeout(async () => {
      if (!isStuck() || autoRetryRef.current.attempts >= 2) return;
      autoRetryRef.current.attempts = 2;
      const { resetDirectReadCircuit } = await import("@/lib/externalDb");
      const { clearExternalClient } = await import("@/lib/externalSupabaseClient");
      resetDirectReadCircuit();
      clearExternalClient();
      infiniteMessages.invalidate();
      // Trigger a fresh fetch
      setTimeout(() => infiniteMessages.refetchLatestPage(), 50);
    }, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [
    selectedConversationCacheKey,
    selectedConversation?.channelId,
    selectedConversation?.phone,
    infiniteMessages.isLoading,
    infiniteMessages.messages.length,
    infiniteMessages.refetchLatestPage,
    infiniteMessages.invalidate,
  ]);


  // Cache cleanup is handled by gcTime (3 min) — no manual invalidation needed.
  // Previous cleanup effect caused a race condition where switching conversations
  // would invalidate the NEW conversation's query instead of the old one.

  // ─── useMutation: optimistic send with TanStack Query ─────────────────────
  const sendMessageMutation = useSendMessage((restoredText) => setNewMessage(restoredText));
  const isSendingMessage = sendMessageMutation.isPending;
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);

  // Re-send a previously failed message reusing original payload from metadata
  const handleRetryFailedMessage = useCallback((failedMessage: import("@/hooks/useInfiniteMessages").MessageRow) => {
    const conversationChannelId = selectedConversation?.channelId;
    if (!selectedConversation || !conversationChannelId) {
      toast.error("Conversa indisponível para reenvio");
      return;
    }
    const conversationChannel = channels.find(c => c.id === conversationChannelId);
    const meta = (failedMessage.metadata || {}) as Record<string, unknown>;
    const destination = (meta.destination as string) || selectedConversation.phone;
    const isTemplate = failedMessage.message_type === "template" || !!meta.templateName;
    const isMedia = !!failedMessage.media_url && !isTemplate;

    setRetryingMessageId(failedMessage.id);
    sendMessageMutation.mutate(
      {
        channelId: conversationChannelId,
        channelPhone: conversationChannel?.phone || "",
        channelProvider: conversationChannel?.provider || "meta",
        destination,
        message: isTemplate ? `Template: ${meta.templateName}` : (failedMessage.content || ""),
        messageType: isTemplate ? "template" : (isMedia ? ((meta.mediaType as string) || failedMessage.message_type || "file") : "text"),
        templateName: isTemplate ? (meta.templateName as string) : undefined,
        templateParams: isTemplate ? (meta.templateParams as string[] | undefined) : undefined,
        mediaUrl: isMedia ? (failedMessage.media_url || undefined) : undefined,
        mediaCaption: isMedia ? (failedMessage.content || undefined) : undefined,
        fileName: isMedia ? (meta.fileName as string | undefined) : undefined,
      },
      {
        onSettled: () => setRetryingMessageId(null),
        onSuccess: (data) => {
          if (data?.success) toast.success("Mensagem reenviada");
        },
      }
    );
  }, [selectedConversation, channels, sendMessageMutation]);
  
  // Track chatbot config for selected channel to show bot type indicator
  const [channelBotConfig, setChannelBotConfig] = useState<{
    bot_type: 'ai' | 'flow' | null;
    is_enabled: boolean;
  } | null>(null);

  // Fetch quick responses for shortcut detection - memoized to prevent refetches
  useEffect(() => {
    if (!user || !effectiveOrganizationId) return;
    
    const fetchQuickResponses = async () => {
      const { data } = await supabase
        .from("quick_responses")
        .select("shortcut, content")
        .or(`organization_id.eq.${effectiveOrganizationId},and(organization_id.is.null,user_id.eq.${user.id})`)
        .not("shortcut", "is", null);
      
      if (data) {
        setQuickResponses(data);
      }
    };
    
    fetchQuickResponses();
  }, [user, effectiveOrganizationId]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === "granted");
      if (permission === "granted") {
        toast.success("Notificações ativadas!");
      }
    }
  }, []);

  // Show notification for new message
  const showNotification = useCallback((message: Message) => {
    if (notificationsEnabled && document.hidden && message.direction === "inbound") {
      const notification = new Notification("Nova mensagem WhatsApp", {
        body: `${message.sender_name || message.sender_phone}: ${message.content}`,
        icon: "/favicon.ico",
        tag: message.id
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }, [notificationsEnabled]);

  // Track previous org to only reset state on actual org change
  const prevOrgIdRef = useRef<string | null>(null);

  // Fetch channels
  useEffect(() => {
    const fetchChannels = async () => {
      
      if (!effectiveOrganizationId) {
        return;
      }
      
      const { data, error } = await (supabase as any)
        .from("channels_public")
        .select("id, name, phone, provider")
        .eq("organization_id", effectiveOrganizationId)
        .in("provider", ["meta", "zapi", "gupshup"])
        .eq("connected", true);

      if (error) {
        console.error("Error fetching channels:", error);
        setChannels([]);
        setLoading(false);
        return;
      }

      if (data) {
        // Only update channels if they actually changed (prevents unnecessary re-renders and re-fetches)
        setChannels(prev => {
          const prevIds = prev.map(c => c.id).sort().join(',');
          const newIds = data.map((c: any) => c.id).sort().join(',');
          if (prevIds === newIds) return prev;
          return data;
        });

        if (data.length === 0) {
          setAllConversations([]);
          setSelectedConversation(null);
          setSelectedConversationStableKey(null);
          setLoading(false);
        }

        if (data.length > 0 && !selectedChannel) {
          setSelectedChannel(data[0]);
        }
      }
    };

    if (user && effectiveOrganizationId) {
      const orgChanged = prevOrgIdRef.current !== null && prevOrgIdRef.current !== effectiveOrganizationId;
      
      if (orgChanged) {
        setChannels([]);
        setAllConversations([]);
        setSelectedConversation(null);
        setSelectedConversationStableKey(null);
      }
      
      prevOrgIdRef.current = effectiveOrganizationId;
      fetchChannels();
    }
  }, [user, effectiveOrganizationId]);

  // Fetch sectors/departments
  useEffect(() => {
   const fetchSectors = async () => {
      if (!effectiveOrganizationId) return;
      
      // First fetch sectors for this org
      const { data: sectorsData, error: sectorsError } = await supabase
        .from("sectors")
        .select("id, name")
        .eq("organization_id", effectiveOrganizationId);

      if (!sectorsError && sectorsData) {
        setSectors(sectorsData);
        
        // Then fetch user_sectors for these sectors
        if (sectorsData.length > 0) {
          const sectorIdsList = sectorsData.map(s => s.id);
          const { data: userSectorsData, error: userSectorsError } = await supabase
            .from("user_sectors")
            .select("user_id, sector_id")
            .in("sector_id", sectorIdsList);
          
          if (!userSectorsError && userSectorsData) {
            const map = new Map<string, Set<string>>();
            userSectorsData.forEach(us => {
              if (!map.has(us.user_id)) {
                map.set(us.user_id, new Set());
              }
              map.get(us.user_id)!.add(us.sector_id);
            });
            setAttendantSectorsMap(map);
          }
        }
      }
    };

    if (user && effectiveOrganizationId) {
      fetchSectors();
    }
  }, [user, effectiveOrganizationId]);

  // Fetch lead tags with colors
  useEffect(() => {
    const fetchTagColors = async () => {
      if (!effectiveOrganizationId) return;
      
      const { data, error } = await supabase
        .from("lead_tags")
        .select("name, color")
        .eq("organization_id", effectiveOrganizationId);

      if (!error && data) {
        const colorsMap = new Map<string, string>();
        data.forEach(tag => {
          colorsMap.set(tag.name, tag.color || '#6366f1');
        });
        setTagColors(colorsMap);
      }
    };

    if (user && effectiveOrganizationId) {
      fetchTagColors();
    }
  }, [user, effectiveOrganizationId]);

  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      if (!effectiveOrganizationId) return;
      
      const { data } = await supabase
        .from("message_templates")
        .select("name, content, variables, components")
        .eq("organization_id", effectiveOrganizationId);

      if (data) {
        const templatesMap = new Map<string, { 
          content: string; 
          variables: string[] | null;
          components: { buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }> } | null;
        }>();
        data.forEach(t => {
          templatesMap.set(t.name, { 
            content: t.content, 
            variables: t.variables,
            components: t.components as { buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }> } | null
          });
        });
        setTemplates(templatesMap);
      }
    };

    if (user && effectiveOrganizationId) {
      fetchTemplates();
    }
  }, [user, effectiveOrganizationId]);

  // Ref to store leads map for realtime updates
  const leadsMapRef = useRef<{ 
    byPhone: Map<string, { id?: string; name: string; tags: string[] | null }>; 
    bySuffix: Map<string, { id?: string; name: string; tags: string[] | null }>;
  }>({ byPhone: new Map(), bySuffix: new Map() });
  const previewHydrationAttemptsRef = useRef<Map<string, number>>(new Map());
  const autoLoadAttemptsRef = useRef<Map<string, number>>(new Map());

  const fetchConversationsFallback = useCallback(async (channelIds: string[]) => {
    const assignments: Array<{
      id: string;
      conversation_phone: string;
      channel_id: string | null;
      assigned_to: string | null;
      status: string | null;
      sector_id: string | null;
      lead_id: string | null;
      updated_at: string;
    }> = [];

    {
      const data = await fetchAssignmentsByChannelsExternal({
        channelIds,
        status: "not_archived",
      });
      assignments.push(...(data as any));
    }

    if (assignments.length === 0) {
      return {
        conversations: [],
        leadLookups: { byPhone: new Map(), bySuffix: new Map() },
        statuses: {},
      } satisfies ConversationSummaryMapping;
    }

    const assignedUserIds = Array.from(
      new Set(assignments.map((assignment) => assignment.assigned_to).filter(Boolean))
    ) as string[];
    const leadIds = Array.from(
      new Set(assignments.map((assignment) => assignment.lead_id).filter(Boolean))
    ) as string[];

    const [profilesResult, leadsResult] = await Promise.all([
      assignedUserIds.length > 0
        ? supabase
            .from("profiles")
            .select("user_id, display_name, email")
            .in("user_id", assignedUserIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length > 0 && effectiveOrganizationId
        ? supabase
            .from("leads")
            .select("id, name, tags")
            .eq("organization_id", effectiveOrganizationId)
            .in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (leadsResult.error) throw leadsResult.error;

    const profileNames = new Map<string, string>();
    profilesResult.data?.forEach((profile) => {
      profileNames.set(profile.user_id, profile.display_name || profile.email || "Atendente");
    });

    const leadsById = new Map<string, { name: string | null; tags: string[] | null }>();
    leadsResult.data?.forEach((lead) => {
      leadsById.set(lead.id, { name: lead.name, tags: lead.tags });
    });

    const fallbackRows: ConversationSummaryRow[] = assignments.map((assignment) => {
      const lead = assignment.lead_id ? leadsById.get(assignment.lead_id) : null;

      return {
        assignment_id: assignment.id,
        conversation_phone: assignment.conversation_phone,
        channel_id: assignment.channel_id,
        assigned_to: assignment.assigned_to,
        status: assignment.status,
        sector_id: assignment.sector_id,
        lead_id: assignment.lead_id,
        updated_at: assignment.updated_at,
        last_message: null,
        last_message_at: null,
        last_inbound_at: null,
        unread_count: 0,
        sender_name: null,
        lead_name: lead?.name || null,
        lead_tags: lead?.tags || null,
        assigned_to_name: assignment.assigned_to
          ? profileNames.get(assignment.assigned_to) || null
          : null,
      };
    });

    return mapConversationSummaryRows(fallbackRows);
  }, [effectiveOrganizationId]);

  const getLeadFromCache = useCallback((phone: string) => {
    const candidates = getPhoneComparisonVariants(phone)
      .map((variant) => leadsMapRef.current.byPhone.get(variant))
      .filter(Boolean);

    return candidates.find(
      (candidate) =>
        candidate &&
        ((candidate.name && !candidate.name.startsWith('LeadWhats-')) ||
          (candidate.tags && candidate.tags.length > 0))
    ) || candidates[0] || null;
  }, []);

  // Fetch conversations using the precomputed summary RPC.
  // This keeps the sidebar fast and avoids scanning large message tables on load.
  useEffect(() => {
    const fetchConversations = async () => {
      if (channels.length === 0) {
        setConversationStatuses({});
        setAllConversations([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const channelIds = channels.map(c => c.id);

      try {
        // For attendants/supervisors-without-org-wide-view, use a focused RPC that
        // returns *their* assigned conversations + their visible pending queue,
        // regardless of how recent the message is in the org-wide ranking.
        // Admins/supervisors continue using the paginated org-wide RPC.
        let rows: any[] | null = null;
        let error: any = null;
        if (canSeeAllConversations) {
          try {
            rows = await fetchConversationSummaryExternal({
              channelIds,
              organizationId: effectiveOrganizationId!,
              limit: CONVERSATIONS_PAGE_SIZE,
              offset: 0,
              impersonatedOrgId: externalImpersonatedOrgId,
            });
          } catch (e) { error = e; }
        } else {
          try {
            rows = await fetchAttendantConversationsExternal({
              userId: user!.id,
              channelIds,
              organizationId: effectiveOrganizationId!,
              limit: 500,
              impersonatedOrgId: externalImpersonatedOrgId,
              // sectorIds passed via cast since helper accepts optional p_sector_ids
              ...(sectorIds?.length ? ({ sectorIds } as any) : {}),
            }) as any;
          } catch (e) { error = e; }
        }

        if (error) {
          throw error;
        }

        if (rows?.length) {
          const mappedData = mapConversationSummaryRows(rows as ConversationSummaryRow[]);
          previewHydrationAttemptsRef.current.clear();
          leadsMapRef.current = mappedData.leadLookups;
          setConversationStatuses(mappedData.statuses);
          setAllConversations(mappedData.conversations);
          setHasMoreConversations(canSeeAllConversations && rows.length >= CONVERSATIONS_PAGE_SIZE);
          setConversationOffset(rows.length);
        } else {
          // Try legacy fallback
          const fallbackData = await fetchConversationsFallback(channelIds);
          previewHydrationAttemptsRef.current.clear();
          leadsMapRef.current = fallbackData.leadLookups;
          setConversationStatuses(fallbackData.statuses);
          setAllConversations(fallbackData.conversations);
          setHasMoreConversations(false);
          setConversationOffset(0);
        }
      } catch (error) {
        console.error("Error fetching conversations summary:", error);

        try {
          const fallbackData = await fetchConversationsFallback(channelIds);
          previewHydrationAttemptsRef.current.clear();
          leadsMapRef.current = fallbackData.leadLookups;
          setConversationStatuses(fallbackData.statuses);
          setAllConversations(fallbackData.conversations);
          setHasMoreConversations(false);
        } catch (fallbackError) {
          console.error("Error fetching conversations fallback:", fallbackError);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [channels, effectiveOrganizationId, externalImpersonatedOrgId, fetchConversationsFallback, user?.id, conversationRefetchTrigger, canSeeAllConversations]);

  // OPTIMIZATION: Realtime-driven assignment sync replaces polling
  // The useChatRealtime hook below handles all assignment changes via Realtime,
  // eliminating the need for the 30-second polling interval (was ~200 queries/min at 100 users)
  // Keeping a single initial sync + one 3s debounce for race condition safety
  useEffect(() => {
    if (channels.length === 0) return;
    
    const syncAssignmentsOnce = async () => {
      const channelIds = channels.map(c => c.id);
      
      const assignments = await fetchAssignmentsByChannelsExternal({
        channelIds,
        status: "not_archived",
        limit: 500,
        impersonatedOrgId: externalImpersonatedOrgId,
      }).catch(() => null);
      
      if (!assignments) return;
      
      const assignmentMap = new Map<string, typeof assignments[0]>();
      assignments.forEach(a => {
        const normalizedPhone = a.conversation_phone.replace(/\D/g, '');
        const key = getConversationThreadKey(a.channel_id, normalizedPhone);
        assignmentMap.set(key, a);
      });
      
      setAllConversations(prev => {
        let hasChanges = false;
        const updated = prev.map(conv => {
          const key = getConversationKey(conv);
          const dbAssignment = assignmentMap.get(key);
          
          if (dbAssignment) {
            const needsUpdate = 
              conv.assignedTo !== dbAssignment.assigned_to ||
              conv.sectorId !== dbAssignment.sector_id ||
              (dbAssignment.status === 'active' && conv.status !== 'in_progress') ||
              (dbAssignment.status === 'in_progress' && conv.status !== 'in_progress');
            
            if (needsUpdate) {
              hasChanges = true;
              let mappedStatus = conv.status;
              if (dbAssignment.status === 'active' || dbAssignment.status === 'in_progress') {
                mappedStatus = 'in_progress';
              } else if (dbAssignment.status === 'pending') {
                mappedStatus = 'pending';
              }
              
              return {
                ...conv,
                assignedTo: dbAssignment.assigned_to,
                sectorId: dbAssignment.sector_id,
                status: mappedStatus
              };
            }
          }
          return conv;
        });
        
        return hasChanges ? updated : prev;
      });
    };
    
    // One immediate sync + one short debounced for race conditions
    syncAssignmentsOnce();
    const timer = setTimeout(syncAssignmentsOnce, 1000);
    return () => clearTimeout(timer);
    // No interval - Realtime handles ongoing updates
  }, [channels]);

  // Background enrichment: fetch last message for conversations missing preview
  const conversationsMissingPreview = useMemo(
    () => allConversations.filter((conversation) => !conversation.lastMessage && conversation.channelId),
    [allConversations]
  );

  const conversationsMissingPreviewSignature = useMemo(
    () =>
      conversationsMissingPreview
        .map((conversation) => getConversationThreadKey(conversation.channelId, conversation.phone))
        .sort()
        .join("|"),
    [conversationsMissingPreview]
  );

  useEffect(() => {
    if (channels.length === 0 || loading) return;

    if (conversationsMissingPreview.length === 0) return;

    let cancelled = false;

    const enrichMissingPreviews = async () => {
      const pendingConversations = conversationsMissingPreview.filter((conversation) => {
        const key = getConversationThreadKey(conversation.channelId, conversation.phone);
        return (previewHydrationAttemptsRef.current.get(key) ?? 0) < 2;
      });

      if (pendingConversations.length === 0) return;

      // Mark all as attempted
      pendingConversations.forEach((conversation) => {
        const key = getConversationThreadKey(conversation.channelId, conversation.phone);
        previewHydrationAttemptsRef.current.set(
          key,
          (previewHydrationAttemptsRef.current.get(key) ?? 0) + 1
        );
      });

      // Build bulk request — up to 50 conversations at a time
      const bulkRequest = pendingConversations.slice(0, 50).map((conversation) => ({
        channelId: conversation.channelId!,
        phoneVariants: buildMessageLookupVariants(conversation.phone.replace(/\D/g, "")),
      }));

      try {
        const results = await fetchBulkPreviews(bulkRequest, effectiveOrganizationId);

        if (cancelled) return;

        if (results.length === 0) {
          console.warn("[enrichMissingPreviews] External preview query returned no rows", {
            conversations: bulkRequest,
          });
          return;
        }

        // Map results back to conversation keys
        const updateMap = new Map<string, { lastMessage: string; lastMessageTime: string; lastInboundTime: string | null }>();

        results.forEach((result, index) => {
          if (!result.createdAt) return;
          const conversation = pendingConversations[index];
          if (!conversation) return;

          const key = getConversationThreadKey(conversation.channelId, conversation.phone);
          const previewText = getPreviewTextFromBulkResult(result);

          if (previewText) {
            updateMap.set(key, {
              lastMessage: previewText,
              lastMessageTime: result.createdAt,
              lastInboundTime: result.lastInboundAt || null,
            });
          }
        });

        if (updateMap.size > 0) {
          setAllConversations((prev) => {
            let changed = false;
            const nextConversations = prev.map((conversation) => {
              const update = updateMap.get(getConversationThreadKey(conversation.channelId, conversation.phone));
              if (!update || conversation.lastMessage) return conversation;

              changed = true;
              return {
                ...conversation,
                lastMessage: update.lastMessage,
                lastMessageTime: update.lastMessageTime,
                lastInboundTime: conversation.lastInboundTime || update.lastInboundTime,
              };
            });
            return changed ? nextConversations : prev;
          });
        } else {
          console.warn("[enrichMissingPreviews] External preview query returned empty content", {
            conversations: pendingConversations.map((conversation) => ({
              channelId: conversation.channelId,
              phone: conversation.phone,
            })),
          });
        }
      } catch (error) {
        console.error("[enrichMissingPreviews] External preview query failed:", error);
      }
    };

    const timer = setTimeout(enrichMissingPreviews, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [channels.length, conversationsMissingPreview, conversationsMissingPreviewSignature, loading]);
  useEffect(() => {
    if (!showArchived || channels.length === 0) return;
    
    const fetchArchivedConversations = async () => {
      const channelIds = channels.map(c => c.id);
      
      // Fetch archived assignments
      let archivedAssignments: any[] = [];
      try {
        archivedAssignments = await fetchAssignmentsByChannelsExternal({
          channelIds,
          status: "archived",
          limit: 159,
          impersonatedOrgId: externalImpersonatedOrgId,
        });
      } catch (e) { console.warn("archived fetch failed", e); return; }
      if (!archivedAssignments?.length) return;
      
      // Fetch profiles for names
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");
      
      const profilesMap = new Map<string, string>();
      profiles?.forEach(p => profilesMap.set(p.user_id, p.display_name || p.email || 'Atendente'));
      
      // Build archived conversations
      // Batch-fetch lead info for archived assignments that have lead_id
      const archivedLeadIds = archivedAssignments
        .filter(a => a.lead_id)
        .map(a => a.lead_id!);
      
      let archivedLeadsMap = new Map<string, { name: string | null; tags: string[] | null }>();
      if (archivedLeadIds.length > 0) {
        const { data: archivedLeads } = await supabase
          .from("leads")
          .select("id, name, tags")
          .in("id", archivedLeadIds.slice(0, 100))
          .eq("organization_id", effectiveOrganizationId);
        
        (archivedLeads || []).forEach(l => {
          archivedLeadsMap.set(l.id, { name: l.name, tags: l.tags });
        });
      }

      const archivedConvs: Conversation[] = archivedAssignments.map(assignment => {
        const normalizedPhone = assignment.conversation_phone.replace(/\D/g, '');
        const displayPhone = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone;
        
        // Use lead_id for exact match first, then fall back to phone cache
        let leadName: string | null = null;
        let leadTags: string[] | null = null;
        
        if (assignment.lead_id && archivedLeadsMap.has(assignment.lead_id)) {
          const leadInfo = archivedLeadsMap.get(assignment.lead_id)!;
          leadName = leadInfo.name;
          leadTags = leadInfo.tags;
        } else {
          const cachedMatch = getLeadFromCache(normalizedPhone);
          if (cachedMatch) {
            leadName = cachedMatch.name || null;
            leadTags = cachedMatch.tags || null;
          }
        }
        
        return {
          id: assignment.id,
          phone: displayPhone,
          name: leadName,
          lastMessage: "",
          lastMessageTime: assignment.updated_at,
          lastInboundTime: null,
          unreadCount: 0,
          channelId: assignment.channel_id,
          status: "archived" as Conversation["status"],
          assignedTo: assignment.assigned_to,
          assignedToName: assignment.assigned_to ? profilesMap.get(assignment.assigned_to) || null : null,
          sectorId: assignment.sector_id,
          tags: leadTags,
          leadId: assignment.lead_id,
        };
      });
      
      // Merge archived into allConversations (avoid duplicates)
      setAllConversations(prev => {
        const existingKeys = new Set(prev.map((c) => getConversationKey(c)));
        const newArchived = archivedConvs.filter(c => {
          const key = getConversationKey(c);
          return !existingKeys.has(key);
        });
        if (newArchived.length === 0) return prev;
        return [...prev, ...newArchived];
      });
    };
    
    fetchArchivedConversations();
  }, [showArchived, channels]);

  // Helper function to get conversation key
  const getConversationKey = (conv: Conversation) => {
    return getConversationThreadKey(conv.channelId, conv.phone);
  };

  // Keep a stable key to recover selection after async list refreshes/re-renders
  useEffect(() => {
    if (selectedConversation) {
      setSelectedConversationStableKey(getConversationKey(selectedConversation));
    }
  }, [selectedConversation?.channelId, selectedConversation?.phone]);

  // Recover selected conversation when state is temporarily reset by async updates
  useEffect(() => {
    if (!selectedConversationStableKey) return;

    const currentKey = selectedConversation ? getConversationKey(selectedConversation) : null;
    if (currentKey === selectedConversationStableKey) return;

    const recovered = [...conversations, ...globalSearchResults].find(
      (conv) => getConversationKey(conv) === selectedConversationStableKey
    );

    if (recovered) {
      setSelectedConversation(recovered);
      const matchingChannel = channels.find((channel) => channel.id === recovered.channelId) || null;
      setSelectedChannel(matchingChannel);
    }
  }, [allConversations, globalSearchResults, channels, selectedConversation, selectedConversationStableKey]);

  const markConversationAsRead = useCallback((conversation: { channelId: string | null; phone: string }) => {
    const conversationKey = getConversationThreadKey(conversation.channelId, conversation.phone);

    setAllConversations(prev => prev.map(c => (
      getConversationKey(c) === conversationKey ? { ...c, unreadCount: 0 } : c
    )));

    setSelectedConversation(prev => {
      if (!prev) return prev;
      const isSameConversation = prev.channelId === conversation.channelId && phonesMatch(prev.phone, conversation.phone);
      return isSameConversation ? { ...prev, unreadCount: 0 } : prev;
    });

    if (!conversation.channelId) return;

    const normalizedPhone = conversation.phone.replace(/\D/g, '');
    const phoneVariants = new Set<string>(getPhoneComparisonVariants(normalizedPhone));
    Array.from(phoneVariants).forEach(variant => phoneVariants.add(`+${variant}`));
    const phoneFilter = Array.from(phoneVariants)
      .map(phone => `sender_phone.eq.${phone}`)
      .join(',');

    // Reset unread count via external-assignments-write (external DB SSoT)
    const statsPhoneVariants = Array.from(phoneVariants);
    supabase.functions.invoke('external-assignments-write', {
      body: {
        action: 'reset_unread',
        channel_id: conversation.channelId,
        phone: normalizedPhone,
        phone_variants: statsPhoneVariants,
        impersonatedOrgId: externalImpersonatedOrgId,
      },
    }).then(() => {});

    supabase
      .from("whatsapp_messages")
      .update({ is_read: true })
      .eq("channel_id", conversation.channelId)
      .eq("direction", "inbound")
      .eq("is_read", false)
      .or(phoneFilter)
      .then(() => {});
  }, [externalImpersonatedOrgId]);

  const markConversationAsResponded = useCallback((conversation: {
    channelId: string | null;
    phone: string;
    assignedTo?: string | null;
    assignedToName?: string | null;
  }) => {
    markConversationAsRead(conversation);

    // Bump lastMessageTime locally so the conversation immediately leaves the
    // "Não Lidos" / "Novos" tabs without waiting for the realtime echo of the
    // outbound message. Without this, isTrulyUnread keeps returning true while
    // lastMessageTime <= lastInboundTime, and the conversation stays visible
    // in those tabs even after the agent replied.
    const conversationKey = getConversationThreadKey(conversation.channelId, conversation.phone);
    const applyRespondedState = (c: Conversation): Conversation => {
      const inboundT = c.lastInboundTime ? new Date(c.lastInboundTime).getTime() : 0;
      const lastT = c.lastMessageTime ? new Date(c.lastMessageTime).getTime() : 0;
      const baseT = Math.max(inboundT, lastT) + 1; // strictly > lastInboundTime
      const bumped = new Date(Math.max(baseT, Date.now())).toISOString();

      return {
        ...c,
        lastMessageTime: bumped,
        unreadCount: 0,
        ...(conversation.assignedTo !== undefined
          ? {
              assignedTo: conversation.assignedTo,
              assignedToName: conversation.assignedToName ?? c.assignedToName,
              status: conversation.assignedTo ? ("in_progress" as const) : c.status,
            }
          : {}),
      };
    };

    setAllConversations(prev => prev.map(c => {
      if (getConversationKey(c) !== conversationKey) return c;
      return applyRespondedState(c);
    }));

    setSelectedConversation(prev => {
      if (!prev || getConversationKey(prev) !== conversationKey) return prev;
      return applyRespondedState(prev);
    });
  }, [markConversationAsRead, getConversationKey, externalImpersonatedOrgId]);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    const startedAt = performance.now();
    // Cache hit detection: if the messages query for this conversation already
    // has data (populated by the predictive prefetcher), the switch will paint
    // instantly without a network round-trip.
    try {
      const threadKey = getCanonicalPhoneThreadKey(conversation.phone);
      const queryKey = ["messages", effectiveOrganizationId, conversation.channelId, threadKey];
      const existing = queryClient.getQueryState(queryKey);
      recordSelectionCacheOutcome(!!existing?.data);
    } catch {
      /* noop */
    }

    setSelectedConversation(conversation);
    setSelectedConversationStableKey(getConversationKey(conversation));

    const matchingChannel = channels.find((channel) => channel.id === conversation.channelId) || null;
    setSelectedChannel(matchingChannel);

    // Measure end-to-end perceived latency (commit + first paint).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        recordSwitchLatency(performance.now() - startedAt);
      });
    });
  }, [channels, queryClient, effectiveOrganizationId]);

  // Update conversation status in DB
  const updateConversationStatus = async (conversationKey: string, newStatus: Conversation["status"]) => {
    setConversationStatuses(prev => ({ ...prev, [conversationKey]: newStatus }));
    setAllConversations(prev => prev.map(c => {
      const key = getConversationKey(c);
      return key === conversationKey ? { ...c, status: newStatus } : c;
    }));
    
    // Parse key to get channel and phone
    const parts = conversationKey.split('_');
    const channelId = parts[0];
    const phone = parts.slice(1).join('_');
    
    if (channelId && channelId !== 'unknown') {
      await assignmentsWrite("update_by_phone", {
        channel_id: channelId,
        phone,
        status: newStatus,
      });
    }
  };

  // Load more conversations (pagination)
  const loadMoreConversations = useCallback(async () => {
    if (isLoadingMore || !hasMoreConversations || channels.length === 0) return;
    setIsLoadingMore(true);
    
    const channelIds = channels.map(c => c.id);
    try {
      const rows = await fetchConversationSummaryExternal({
        channelIds,
        organizationId: effectiveOrganizationId!,
        limit: CONVERSATIONS_PAGE_SIZE,
        offset: conversationOffset,
        impersonatedOrgId: externalImpersonatedOrgId,
      });
      const error: any = null;
      if (error) throw error;
      
      if (rows?.length) {
        const mappedData = mapConversationSummaryRows(rows as ConversationSummaryRow[]);
        setConversationStatuses(prev => ({ ...prev, ...mappedData.statuses }));

        mappedData.leadLookups.byPhone.forEach((value, key) => {
          const existing = leadsMapRef.current.byPhone.get(key);
          if (!existing || (!existing.name && value.name) || (!existing.tags?.length && value.tags?.length)) {
            leadsMapRef.current.byPhone.set(key, value);
          }
        });

        mappedData.leadLookups.bySuffix.forEach((value, key) => {
          const existing = leadsMapRef.current.bySuffix.get(key);
          if (!existing || (!existing.name && value.name) || (!existing.tags?.length && value.tags?.length)) {
            leadsMapRef.current.bySuffix.set(key, value);
          }
        });

        // Merge new conversations avoiding duplicates
        setAllConversations(prev => {
          const existingKeys = new Set(prev.map(c => getConversationKey(c)));
          const newConvs = mappedData.conversations.filter(c => !existingKeys.has(getConversationKey(c)));
          return [...prev, ...newConvs];
        });
        setConversationOffset(prev => prev + rows.length);
        setHasMoreConversations(rows.length >= CONVERSATIONS_PAGE_SIZE);
      } else {
        setHasMoreConversations(false);
      }
    } catch (error) {
      console.error("Error loading more conversations:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreConversations, channels, effectiveOrganizationId, externalImpersonatedOrgId, conversationOffset]);

  // Load ALL unread conversations (no pagination, no time limit).
  // Usado exclusivamente pela aba "Não Lidos" para garantir que mensagens
  // não lidas de qualquer idade (horas, dias, semanas) sejam carregadas
  // independentemente da posição no ranking de "última mensagem".
  const isLoadingAllUnreadRef = useRef(false);
  const lastUnreadLoadAtRef = useRef<number>(0);
  const loadAllUnreadConversations = useCallback(async (force = false) => {
    if (channels.length === 0 || !effectiveOrganizationId) return;
    if (isLoadingAllUnreadRef.current) return;
    // Throttle: no máximo 1 carga completa a cada 30s (a menos que force=true)
    const now = Date.now();
    if (!force && now - lastUnreadLoadAtRef.current < 30_000) return;

    isLoadingAllUnreadRef.current = true;
    const channelIds = channels.map(c => c.id);
    try {
      const rows = await fetchUnreadConversationsExternal({
        channelIds,
        organizationId: effectiveOrganizationId,
        impersonatedOrgId: externalImpersonatedOrgId,
      });

      if (rows?.length) {
        const mappedData = mapConversationSummaryRows(rows as ConversationSummaryRow[]);
        setConversationStatuses(prev => ({ ...prev, ...mappedData.statuses }));

        mappedData.leadLookups.byPhone.forEach((value, key) => {
          const existing = leadsMapRef.current.byPhone.get(key);
          if (!existing || (!existing.name && value.name) || (!existing.tags?.length && value.tags?.length)) {
            leadsMapRef.current.byPhone.set(key, value);
          }
        });

        mappedData.leadLookups.bySuffix.forEach((value, key) => {
          const existing = leadsMapRef.current.bySuffix.get(key);
          if (!existing || (!existing.name && value.name) || (!existing.tags?.length && value.tags?.length)) {
            leadsMapRef.current.bySuffix.set(key, value);
          }
        });

        // Merge: para conversas já presentes, mantém a versão existente
        // (que pode ter dados mais recentes via realtime).
        // Para novas, adiciona ao final.
        setAllConversations(prev => {
          const existingKeys = new Set(prev.map(c => getConversationKey(c)));
          const newConvs = mappedData.conversations.filter(c => !existingKeys.has(getConversationKey(c)));
          if (newConvs.length === 0) return prev;
          return [...prev, ...newConvs];
        });
      }
      lastUnreadLoadAtRef.current = Date.now();
    } catch (error) {
      console.error("Error loading all unread conversations:", error);
    } finally {
      isLoadingAllUnreadRef.current = false;
    }
  }, [channels, effectiveOrganizationId, externalImpersonatedOrgId]);

  // Global search function - uses RPC for efficient server-side search
  const searchConversationsGlobal = useCallback(async (term: string) => {
    if (!term.trim() || term.length < 3 || channels.length === 0 || !effectiveOrganizationId) {
      setGlobalSearchResults([]);
      setIsSearchingGlobal(false);
      return;
    }

    setIsSearchingGlobal(true);
    const channelIds = channels.map(c => c.id);

    try {
      // Use the dedicated search RPC — single query instead of 3-5
      const rows = await searchConversationsGlobalExternal({
        channelIds,
        organizationId: effectiveOrganizationId,
        searchTerm: term,
        limit: 50,
        impersonatedOrgId: externalImpersonatedOrgId,
      });

      const results: Conversation[] = (rows || []).map((row: any) => {
        const normalizedPhone = (row.conversation_phone || "").replace(/\D/g, "");
        const displayPhone = normalizedPhone ? `+${normalizedPhone}` : "";
        const leadName = row.lead_name?.trim() || "";
        const isAutoGenerated = leadName.startsWith("LeadWhats-") || leadName.startsWith("WhatsApp ");
        const resolvedLeadName = isAutoGenerated ? "" : leadName;

        let mappedStatus: Conversation["status"] = "pending";
        if (row.status === "active" || row.status === "in_progress") mappedStatus = "in_progress";
        else if (row.status === "archived") mappedStatus = "archived";
        else if (row.status === "resolved") mappedStatus = "resolved";

        return {
          id: row.assignment_id,
          phone: displayPhone,
          name: resolvedLeadName || row.sender_name || null,
          lastMessage: row.last_message_content || "",
          lastMessageTime: row.last_message_at || row.assignment_updated_at || new Date().toISOString(),
          lastInboundTime: row.last_inbound_at || null,
          unreadCount: Number(row.unread_count) || 0,
          channelId: row.channel_id,
          status: mappedStatus,
          assignedTo: row.assigned_to || null,
          assignedToName: row.assigned_to_name || null,
          sectorId: row.sector_id || null,
          tags: row.lead_tags || null,
          leadId: row.lead_id,
        };
      });

      setGlobalSearchResults(results);
      setIsSearchingGlobal(false);
    } catch (error) {
      console.error("Error searching conversations:", error);
      setGlobalSearchResults([]);
      setIsSearchingGlobal(false);
    }
  }, [channels, effectiveOrganizationId, externalImpersonatedOrgId]);

  // Debounced global search — local-first, then DB fallback
  const [localSearchResults, setLocalSearchResults] = useState<Conversation[]>([]);
  
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setGlobalSearchResults([]);
      setLocalSearchResults([]);
      return;
    }

    // ── Step 1: Instant local filter (no DB hit) ──
    const lowerTerm = searchTerm.toLowerCase();
    const normalizedSearchDigits = searchTerm.replace(/\D/g, '');
    
    const localMatches = conversations.filter(conv => {
      if (conv.name?.toLowerCase().includes(lowerTerm)) return true;
      if (normalizedSearchDigits && conv.phone.replace(/\D/g, '').includes(normalizedSearchDigits)) return true;
      if (conv.tags?.some(t => t.toLowerCase().includes(lowerTerm))) return true;
      return false;
    });
    
    setLocalSearchResults(localMatches);

    // ── Step 2: If local results < 5, also query DB (debounced) ──
    if (searchTerm.length >= 3 && localMatches.length < 5) {
      const debounceTimer = setTimeout(() => {
        searchConversationsGlobal(searchTerm);
      }, 400);
      return () => clearTimeout(debounceTimer);
    } else {
      setGlobalSearchResults([]);
    }
  }, [searchTerm, conversations, searchConversationsGlobal]);

  // Fetch notes and handle side-effects when conversation changes.
  // Messages are now managed by useInfiniteMessages above.
  const fetchNotesAndSideEffects = useCallback(async () => {
    if (!selectedConversation) {
      setConversationNotes([]);
      return;
    }

    const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');
    const conversationChannelId = selectedConversation.channelId;
    if (!conversationChannelId) return;

    const notesResult = await supabase
      .from("conversation_notes")
      .select("id, content, created_at, created_by")
      .eq("channel_id", conversationChannelId)
      .eq("contact_phone", normalizedPhone)
      .order("created_at", { ascending: true });

    if (!notesResult.error && notesResult.data) {
      setConversationNotes(notesResult.data as ConversationNote[]);
    } else {
      setConversationNotes([]);
    }

    // Query external history directly for the latest real message and use it as
    // the source of truth for the 24h window + sidebar/chat freshness.
    const phoneVariants = buildMessageLookupVariants(normalizedPhone);
    // Janela de 24h: SÓ reabre com mensagem INBOUND. Nunca usar lastMessageTime (saída nossa).
    const fallbackWindowBase = selectedConversation.lastInboundTime || null;

    try {
      const latestExternalPage = await fetchExternalMessages({
        channelId: String(conversationChannelId),
        phoneVariants,
        cursor: null,
        pageSize: 1,
        impersonatedOrgId: effectiveOrganizationId,
      });

      const latestExternalMessage = latestExternalPage.messages[0] ?? null;

      if (!latestExternalMessage?.created_at) {
        console.warn("[fetchNotesAndSideEffects] External history returned empty for active conversation", {
          channelId: conversationChannelId,
          phone: normalizedPhone,
          phoneVariants,
        });
        setMessageWindowBaseTime(fallbackWindowBase);
      } else {
        const latestMessageTime = new Date(latestExternalMessage.created_at).getTime();
        const conversationKey = getConversationKey(selectedConversation);
        const latestPreview = getMessagePreviewText(latestExternalMessage);
        const threadKey = getCanonicalPhoneThreadKey(normalizedPhone);

        upsertMessageIntoInfiniteCache(
          queryClient,
          ["messages", effectiveOrganizationId, conversationChannelId, threadKey],
          latestExternalMessage
        );

        // Só atualiza a base da janela se for INBOUND — outbound não reabre janela na Meta.
        if (latestExternalMessage.direction === "inbound") {
          setMessageWindowBaseTime(latestExternalMessage.created_at);
        } else {
          setMessageWindowBaseTime(fallbackWindowBase);
        }

        setSelectedConversation((prev) =>
          prev
            ? {
                ...prev,
                lastMessage: prev.lastMessage || latestPreview,
                lastMessageTime:
                  !prev.lastMessageTime || latestMessageTime > new Date(prev.lastMessageTime).getTime()
                    ? latestExternalMessage.created_at
                    : prev.lastMessageTime,
                lastInboundTime:
                  latestExternalMessage.direction === "inbound" &&
                  (!prev.lastInboundTime || latestMessageTime > new Date(prev.lastInboundTime).getTime())
                    ? latestExternalMessage.created_at
                    : prev.lastInboundTime,
              }
            : null
        );

        setAllConversations((prev) =>
          prev.map((conversation) => {
            const key = getConversationKey(conversation);
            if (key !== conversationKey) return conversation;

            const currentLastMessageTime = new Date(conversation.lastMessageTime || 0).getTime();
            const currentLastInboundTime = new Date(conversation.lastInboundTime || 0).getTime();

            return {
              ...conversation,
              lastMessage: conversation.lastMessage || latestPreview,
              lastMessageTime:
                !conversation.lastMessageTime || latestMessageTime > currentLastMessageTime
                  ? latestExternalMessage.created_at
                  : conversation.lastMessageTime,
              lastInboundTime:
                latestExternalMessage.direction === "inbound" &&
                (!conversation.lastInboundTime || latestMessageTime > currentLastInboundTime)
                  ? latestExternalMessage.created_at
                  : conversation.lastInboundTime,
            };
          })
        );
      }
    } catch (error) {
      console.error("[fetchNotesAndSideEffects] Failed to fetch latest external history for active conversation:", {
        channelId: conversationChannelId,
        phone: normalizedPhone,
        phoneVariants,
        error,
      });
      setMessageWindowBaseTime(fallbackWindowBase);
    }

    // NOTE: Do NOT auto-change status to in_progress just because the user clicked
    // on the conversation, and do NOT clear unread on open. A customer message
    // remains unread until the attendant actually responds (handled by send flow).
  }, [selectedConversation, infiniteMessages.messages]);

  useEffect(() => {
    fetchNotesAndSideEffects();
  }, [selectedConversation?.channelId, selectedConversation?.phone]);



  // Auto-select conversation when phone parameter is present in URL
  useEffect(() => {
    if (!phoneToOpen || allConversations.length === 0 || selectedConversation) return;
    
    const normalizedPhoneToOpen = phoneToOpen.replace(/\D/g, '');
    const phoneEnd = normalizedPhoneToOpen.slice(-8);
    
    // First, try to find in existing conversations (any status including archived)
    let matchingConversation = allConversations.find(c => {
      const conversationPhoneNormalized = c.phone.replace(/\D/g, '');
      return conversationPhoneNormalized.endsWith(phoneEnd) || 
             normalizedPhoneToOpen.endsWith(conversationPhoneNormalized.slice(-8));
    });
    
    if (matchingConversation) {
      // If archived, show archived view
      if (matchingConversation.status === "archived") {
        setShowArchived(true);
      }
      
      // Select the conversation
      setSelectedConversation(matchingConversation);
      
      // Find and set the channel
      const channel = channels.find(ch => ch.id === matchingConversation?.channelId);
      if (channel) {
        setSelectedChannel(channel);
      }
      
      // Clear the phone param
      setPhoneToOpen(null);
      setSearchParams({}, { replace: true });
    } else if (channels.length > 0) {
      // Create a temporary conversation to display messages
      // Use channelId from URL if available, otherwise fallback to first channel
      const targetChannel = channelIdToOpen 
        ? channels.find(ch => ch.id === channelIdToOpen) || channels[0]
        : channels[0];
      
      const tempConversation: Conversation = {
        phone: normalizedPhoneToOpen,
        name: null,
        lastMessage: "",
        lastMessageTime: new Date().toISOString(),
        lastInboundTime: null,
        unreadCount: 0,
        channelId: targetChannel.id,
        status: "in_progress",
        assignedTo: null,
        assignedToName: null,
        sectorId: null,
        tags: null
      };
      
      setSelectedConversation(tempConversation);
      setSelectedChannel(targetChannel);
      setPhoneToOpen(null);
      setSearchParams({}, { replace: true });
    }
  }, [phoneToOpen, allConversations, channels, selectedConversation]);

  // Fetch contact tags
  useEffect(() => {
    const fetchContactTags = async () => {
      if (!selectedConversation) {
        setContactTags([]);
        return;
      }

      const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');
      const { data } = await supabase
        .from("leads")
        .select("tags")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      if (data?.tags) {
        setContactTags(data.tags);
      } else {
        setContactTags([]);
      }
    };

    fetchContactTags();
  }, [selectedConversation?.phone]);

  // Fetch bot config for the selected conversation's channel
  useEffect(() => {
    const fetchBotConfig = async () => {
      if (!selectedConversation?.channelId) {
        setChannelBotConfig(null);
        return;
      }
      
      const { data } = await supabase
        .from("chatbot_config")
        .select("bot_type, is_enabled")
        .eq("channel_id", selectedConversation.channelId)
        .maybeSingle();
      
      console.log("[BotConfig] Channel:", selectedConversation.channelId, "Data:", data);
      if (data) {
        setChannelBotConfig({
          bot_type: data.bot_type as 'ai' | 'flow' | null,
          is_enabled: data.is_enabled ?? false
        });
      } else {
        setChannelBotConfig(null);
      }
    };
    
    fetchBotConfig();
  }, [selectedConversation?.channelId]);

  // Refs for realtime updates
  const selectedConversationRef = useRef<Conversation | null>(null);
  const effectiveOrganizationIdRef = useRef<string | null>(effectiveOrganizationId ?? null);
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
    effectiveOrganizationIdRef.current = effectiveOrganizationId ?? null;
  }, [selectedConversation, effectiveOrganizationId]);

  const showNotificationRef = useRef(showNotification);
  const soundEnabledRef = useRef(soundEnabled);
  const playNotificationSoundRef = useRef(playNotificationSound);
  const refetchLatestPageRef = useRef(infiniteMessages.refetchLatestPage);
  
  useEffect(() => {
    showNotificationRef.current = showNotification;
    soundEnabledRef.current = soundEnabled;
    playNotificationSoundRef.current = playNotificationSound;
    refetchLatestPageRef.current = infiniteMessages.refetchLatestPage;
  }, [showNotification, soundEnabled, playNotificationSound, infiniteMessages.refetchLatestPage]);

  // Measure the conversation list container so the virtualized list fills it exactly
  useEffect(() => {
    const el = conversationListContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setConversationListHeight(el.clientHeight);
    });
    ro.observe(el);
    setConversationListHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // OPTIMIZATION: Single consolidated Realtime subscription via useChatRealtime
  // Replaces: N per-channel subscriptions + 1 global assignment subscription
  // Reduces from ~12 subscriptions/user to 2 (saving ~83% of Realtime connections)
  const channelIds = useMemo(() => channels.map(c => c.id), [channels]);
  const channelIdSet = useMemo(() => new Set(channelIds), [channelIds]);

  const handleNewMessageRealtime = useCallback((msg: {
    channelId: string;
    messageId: string;
    senderPhone: string;
    content: string;
    direction: string;
    createdAt: string;
    isRead: boolean;
    senderName?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    let contactPhone: string;
    let contactName: string | null = null;

    if (msg.direction === "inbound") {
      contactPhone = msg.senderPhone;
      contactName = msg.senderName || null;
    } else {
      const metadata = msg.metadata as { destination?: string } | null;
      contactPhone = metadata?.destination || '';
      if (!contactPhone) return;
    }

    const normalizedContactPhone = normalizePhoneNumber(contactPhone);
    const currentSelectedConv = selectedConversationRef.current;
    const msgConversationKey = getConversationThreadKey(msg.channelId, normalizedContactPhone);
    const isConversationMatch = (conv: Conversation) =>
      conv.channelId === msg.channelId && phonesMatch(conv.phone, normalizedContactPhone);
    const isActiveConversation =
      !!currentSelectedConv &&
      currentSelectedConv.channelId === msg.channelId &&
      phonesShareSameThread(currentSelectedConv.phone, normalizedContactPhone);

    // Build a full Message-like object for compatibility
    const newMsg = {
      id: msg.messageId,
      channel_id: msg.channelId,
      message_id: msg.messageId,
      sender_phone: msg.senderPhone,
      sender_name: msg.senderName || null,
      message_type: 'text',
      content: msg.content,
      media_url: null,
      direction: msg.direction,
      status: null,
      created_at: msg.createdAt,
      metadata: msg.metadata || null,
    } as Message;

    const messageMetadata = msg.metadata as { synthetic?: boolean; source?: string; sent_by_human?: boolean } | null;
    const isSyntheticStatsEcho = messageMetadata?.synthetic === true && messageMetadata?.source === "conversation_stats";

    if (msg.direction === "inbound") {
      setRecentlyUpdatedConversations(prev => {
        const newSet = new Set(prev);
        newSet.add(msgConversationKey);
        return newSet;
      });
      setTimeout(() => {
        setRecentlyUpdatedConversations(prev => {
          const newSet = new Set(prev);
          newSet.delete(msgConversationKey);
          return newSet;
        });
      }, 5000);

      // Only show notification/sound if the conversation is assigned to the current user
      // or is unassigned (new/queue). This prevents attendants from being notified about
      // conversations handled by other attendants.
      setAllConversations(convs => {
        const matchingConv = convs.find(isConversationMatch);
        const isAssignedToMe = !matchingConv?.assignedTo || matchingConv.assignedTo === user?.id;

        if (isAssignedToMe) {
          showNotificationRef.current(newMsg);

          if (soundEnabledRef.current) {
            playNotificationSoundRef.current();
            toast.info(`Nova mensagem de ${contactName || contactPhone}`, {
              description: (msg.content || "").substring(0, 50) + ((msg.content?.length || 0) > 50 ? "..." : ""),
              action: {
                label: "Ver",
                onClick: () => {
                  setAllConversations(innerConvs => {
                    const targetConv = innerConvs.find(isConversationMatch);
                    if (targetConv) setSelectedConversation(targetConv);
                    return innerConvs;
                  });
                }
              }
            });
          }
        }
        return convs; // no mutation
      });
    }

    // Write directly to this conversation's query cache. This works even if the
    // query has not mounted yet, so a message received while the panel was not
    // open is already visible on click without needing F5 or another selection.
    const threadKey = getCanonicalPhoneThreadKey(normalizedContactPhone);
    const messageQueryKey = ["messages", effectiveOrganizationIdRef.current, msg.channelId, threadKey];
    upsertMessageIntoInfiniteCache(queryClient, messageQueryKey, newMsg);

    // Update messages panel side effects if this is the active conversation
    if (isActiveConversation) {

      // For outbound messages we already have an optimistic green bubble in the
      // cache; cache upsert will dedupe/merge against it. We deliberately skip
      // the auto-refetch here to avoid the "gray bubble first, then green" flicker
      // and the duplicated bubble the user reported. Inbound still refetches to
      // pull the full message body from the external DB.
      if (msg.direction === "inbound" && !isSyntheticStatsEcho) {
        setTimeout(() => refetchLatestPageRef.current(), 80);
      }
    }

    // Update conversation list
    if (msg.direction === "outbound") {
      const metadata = msg.metadata as { sent_by_human?: boolean } | null;
      const isSentByHuman = metadata?.sent_by_human === true;

      setAllConversations(prev => {
        const existing = prev.find(isConversationMatch);
        if (existing) {
          const updated = { ...existing, lastMessage: msg.content || existing.lastMessage, lastMessageTime: msg.createdAt, unreadCount: 0 };
          const rest = prev.filter(c => !isConversationMatch(c));
          return [updated, ...rest];
        } else if (isSentByHuman) {
          const displayPhone = contactPhone.startsWith('+') ? contactPhone : '+' + normalizedContactPhone;
          const cachedLeadMatch = getLeadFromCache(normalizedContactPhone);
          const newMatches = cachedLeadMatch ? [cachedLeadMatch] : [];

          let leadNameFromSystem: string | undefined;
          let leadTagsFromSystem: string[] | null = null;
          for (const m of newMatches) {
            if (!m) continue;
            if (!leadNameFromSystem && m.name) leadNameFromSystem = m.name;
            if ((!leadTagsFromSystem || leadTagsFromSystem.length === 0) && m.tags && m.tags.length > 0) leadTagsFromSystem = m.tags;
            if (leadNameFromSystem && leadTagsFromSystem && leadTagsFromSystem.length > 0) break;
          }

          fetchAssignmentByPhoneExternal({
            channelId: msg.channelId,
            phone: normalizedContactPhone,
          impersonatedOrgId: externalImpersonatedOrgId,
          })
            .then(async (assignment) => {
              let assignedToName: string | null = null;
              if (assignment?.assigned_to) {
                const { data: profile } = await supabase
                  .from('profiles').select('display_name, email').eq('user_id', assignment.assigned_to).single();
                assignedToName = profile?.display_name || profile?.email || 'Atendente';
              }
              setAllConversations(currentPrev => {
                const alreadyExists = currentPrev.some(isConversationMatch);
                if (alreadyExists) {
                  let mappedStatus: Conversation["status"] | undefined;
                  if (assignment?.status === "active") mappedStatus = "in_progress";
                  else if (assignment?.status === "archived") mappedStatus = "archived";
                  else if (assignment?.status === "resolved") mappedStatus = "resolved";
                  else if (assignment?.status === "pending") mappedStatus = "pending";
                  else if (assignment?.status === "in_progress") mappedStatus = "in_progress";
                  return currentPrev.map(c =>
                    isConversationMatch(c)
                      ? { ...c, sectorId: assignment?.sector_id || null, assignedTo: assignment?.assigned_to || null, assignedToName, status: mappedStatus || c.status }
                      : c
                  );
                }
                let convStatus: Conversation["status"] = "in_progress";
                if (assignment?.status === "archived") convStatus = "archived";
                else if (assignment?.status === "resolved") convStatus = "resolved";
                else if (assignment?.status === "pending") convStatus = "pending";
                const newConv: Conversation = {
                  phone: displayPhone, name: leadNameFromSystem || null,
                  lastMessage: msg.content || "", lastMessageTime: msg.createdAt,
                  lastInboundTime: null, unreadCount: 0, channelId: msg.channelId,
                  status: convStatus, assignedTo: assignment?.assigned_to || null,
                  assignedToName, sectorId: assignment?.sector_id || null, tags: leadTagsFromSystem || null
                };
                return [newConv, ...currentPrev];
              });
            });
          return prev;
        }
        return prev;
      });
    }

    if (msg.direction === "inbound") {
      const cachedLeadMatch = getLeadFromCache(normalizedContactPhone);
      let leadNameFromSystem = cachedLeadMatch?.name || undefined;
      let leadTagsFromSystem = cachedLeadMatch?.tags || null;

      // OPTIMIZATION: Try to update from local state first (skip DB query for existing conversations)
      setAllConversations(prev => {
        const existing = prev.find(isConversationMatch);
        if (existing) {
          // Conversation exists in local state — update it directly without DB query
          // If conversation is archived, don't reactivate from the frontend.
          // The webhook handler will reactivate it server-side and send a
          // realtime event via onAssignmentChange, which updates the UI.
          if (existing.status === "archived") {
            return prev; // skip — let server handle reactivation
          }
          const currentSelectedConvLocal = selectedConversationRef.current;
          const isCurrentConversation =
            !!currentSelectedConvLocal && isConversationMatch(currentSelectedConvLocal);
          const updated = prev.map(c =>
            isConversationMatch(c)
              ? {
                  ...c,
                  lastMessage: msg.content || "", lastMessageTime: msg.createdAt,
                  lastInboundTime: msg.createdAt,
                  unreadCount: c.unreadCount + 1,
                  status: existing.status,
                  name: leadNameFromSystem || c.name || contactName,
                  tags: leadTagsFromSystem || c.tags
                }
              : c
          );
          const rest = updated.filter(c => !isConversationMatch(c));
          const movedConv = updated.find(isConversationMatch);
          return movedConv ? [movedConv, ...rest] : updated;
        }
        return prev;
      });

      // Only query DB for truly NEW conversations not in the list
      setAllConversations(prev => {
        const existing = prev.find(isConversationMatch);
        if (!existing) {
          // New conversation — need to fetch from DB (async, out of setState)
          const displayPhone = contactPhone.startsWith('+') ? contactPhone : '+' + normalizedContactPhone;
          fetchAssignmentByPhoneExternal({
            channelId: msg.channelId,
            phone: normalizedContactPhone,
          impersonatedOrgId: externalImpersonatedOrgId,
          })
            .then(async (newAssignment) => {
              let newAssignedToName: string | null = null;
              if (newAssignment?.assigned_to) {
                const { data: profile } = await supabase
                  .from('profiles').select('display_name, email').eq('user_id', newAssignment.assigned_to).single();
                newAssignedToName = profile?.display_name || profile?.email || 'Atendente';
              }
              let mappedStatus: Conversation["status"] = "pending";
              if (newAssignment?.status === "active" || newAssignment?.status === "in_progress") mappedStatus = "in_progress";
              else if (newAssignment?.status === "archived") mappedStatus = "archived";
              else if (newAssignment?.status === "resolved") mappedStatus = "resolved";

              // If no lead name from cache, try DB lookup
              let resolvedName = leadNameFromSystem || contactName;
              let resolvedTags = leadTagsFromSystem;
              if (!resolvedName || resolvedName === contactPhone || resolvedName.startsWith('+')) {
                const phoneSuffix = normalizedContactPhone.slice(-8);
                const { data: leadMatch } = await supabase
                  .from('leads')
                  .select('name, tags')
                  .eq('organization_id', effectiveOrganizationId)
                  .or(`phone.ilike.%${phoneSuffix}`)
                  .limit(1)
                  .maybeSingle();
                if (leadMatch?.name) {
                  resolvedName = leadMatch.name;
                  resolvedTags = leadMatch.tags || resolvedTags;
                  // Update cache for future lookups
                  leadsMapRef.current.byPhone.set(normalizedContactPhone, { name: leadMatch.name, tags: leadMatch.tags });
                  leadsMapRef.current.bySuffix.set(phoneSuffix, { name: leadMatch.name, tags: leadMatch.tags });
                }
              }

              setAllConversations(currentPrev => {
                const alreadyExists = currentPrev.some(isConversationMatch);
                if (alreadyExists) {
                  return currentPrev.map(c =>
                    isConversationMatch(c)
                      ? { ...c, id: newAssignment?.id || c.id, sectorId: newAssignment?.sector_id || null, assignedTo: newAssignment?.assigned_to || null, assignedToName: newAssignedToName, status: mappedStatus, name: resolvedName || c.name }
                      : c
                  );
                }
                const newConv: Conversation = {
                  id: newAssignment?.id, phone: displayPhone,
                  name: resolvedName, lastMessage: msg.content || "",
                  lastMessageTime: msg.createdAt, lastInboundTime: msg.createdAt, unreadCount: 1,
                  channelId: msg.channelId, status: mappedStatus,
                  assignedTo: newAssignment?.assigned_to || null, assignedToName: newAssignedToName,
                  sectorId: newAssignment?.sector_id || null, tags: resolvedTags || null
                };
                return [newConv, ...currentPrev];
              });
            });
      }
      return prev; // no mutation in this pass
      });
    }
  }, []);

  const handleAssignmentChangeRealtime = useCallback((assignment: {
    id: string;
    conversationPhone: string;
    channelId: string | null;
    assignedTo: string | null;
    status: string | null;
    sectorId: string | null;
    leadId: string | null;
    updatedAt: string;
  }) => {
    if (!assignment?.conversationPhone) return;
    // Atendimento V2 only supports live threads backed by a real channel.
    // Legacy assignments without channel_id must never mutate the visible queues.
    if (!assignment.channelId || !channelIdSet.has(assignment.channelId)) return;

    const normalizedPhone = assignment.conversationPhone.replace(/\D/g, '');

    const fetchAndApply = async () => {
      let assignedToName: string | null = null;
      if (assignment.assignedTo) {
        const { data: profile } = await supabase
          .from('profiles').select('display_name, email').eq('user_id', assignment.assignedTo).single();
        assignedToName = profile?.display_name || profile?.email || 'Atendente';
      }

      let mappedStatus: Conversation["status"] = "in_progress";
      if (assignment.status === "active") mappedStatus = "in_progress";
      else if (assignment.status === "archived") mappedStatus = "archived";
      else if (assignment.status === "resolved") mappedStatus = "resolved";
      else if (assignment.status === "pending") mappedStatus = "pending";
      else if (assignment.status === "in_progress") mappedStatus = "in_progress";

      const convKey = `${assignment.channelId}_${normalizePhoneNumber(normalizedPhone)}`;
      if (locallyCreatedConversationsRef.current.has(convKey)) {
        setAllConversations(prev => prev.map(c => {
          const cKey = `${c.channelId}_${normalizePhoneNumber(c.phone)}`;
          if (cKey === convKey) {
            return { ...c, id: assignment.id, assignedTo: assignment.assignedTo, assignedToName, sectorId: assignment.sectorId || c.sectorId, status: mappedStatus };
          }
          return c;
        }));
        return;
      }

      // Pre-fetch lead name if not in cache
      const cachedLeadMatch = getLeadFromCache(normalizedPhone);
      let prefetchedLeadName: string | null = cachedLeadMatch?.name || null;
      let prefetchedLeadTags: string[] | null = cachedLeadMatch?.tags || null;

      if (!prefetchedLeadName) {
        const phoneSuffix = normalizedPhone.slice(-8);
        const { data: leadMatch } = await supabase
          .from('leads')
          .select('name, tags')
          .eq('organization_id', effectiveOrganizationId)
          .or(`phone.ilike.%${phoneSuffix}`)
          .limit(1)
          .maybeSingle();
        if (leadMatch?.name) {
          prefetchedLeadName = leadMatch.name;
          prefetchedLeadTags = leadMatch.tags || prefetchedLeadTags;
          leadsMapRef.current.byPhone.set(normalizedPhone, { name: leadMatch.name, tags: leadMatch.tags });
          leadsMapRef.current.bySuffix.set(phoneSuffix, { name: leadMatch.name, tags: leadMatch.tags });
        }
      }

      setAllConversations(prev => {
        let existing = assignment.id ? prev.find(c => c.id === assignment.id) : null;
        if (!existing) {
          existing = prev.find(c => {
            const cNormalized = normalizePhoneNumber(c.phone);
            const assignmentNormalized = normalizePhoneNumber(normalizedPhone);
            return cNormalized === assignmentNormalized && (c.channelId === assignment.channelId || !assignment.channelId);
          });
        }

        if (existing) {
          return prev.map(c => {
            const isMatch = c.id === assignment.id ||
              (normalizePhoneNumber(c.phone) === normalizePhoneNumber(normalizedPhone) && (c.channelId === assignment.channelId || !assignment.channelId));
            if (isMatch) {
              return { ...c, id: assignment.id, assignedTo: assignment.assignedTo, assignedToName, sectorId: assignment.sectorId || c.sectorId, status: mappedStatus, name: prefetchedLeadName || c.name };
            }
            return c;
          });
        } else if (assignment.assignedTo && assignment.channelId) {
          const displayPhone = '+' + normalizePhoneNumber(normalizedPhone);
          const newConv: Conversation = {
            id: assignment.id, phone: displayPhone, name: prefetchedLeadName,
            lastMessage: "Template enviado", lastMessageTime: new Date().toISOString(),
            lastInboundTime: null, unreadCount: 0, channelId: assignment.channelId,
            status: mappedStatus, assignedTo: assignment.assignedTo, assignedToName,
            sectorId: assignment.sectorId || null, tags: prefetchedLeadTags
          };
          return [newConv, ...prev];
        }
        return prev;
      });

      setSelectedConversation(prev => {
        if (!prev) return null;
        const prevNormalized = prev.phone.replace(/\D/g, '');
        if (prevNormalized === normalizedPhone && prev.channelId === assignment.channelId) {
          return { ...prev, assignedTo: assignment.assignedTo, assignedToName, sectorId: assignment.sectorId || prev.sectorId, status: mappedStatus };
        }
        return prev;
      });
    };

    fetchAndApply();
  }, [channelIdSet]);

  // ─── Throttled Realtime: batch rapid messages into single render cycle ────
  const messageBatcherRef = useRef<ReturnType<typeof createRealtimeBatcher<Parameters<typeof handleNewMessageRealtime>[0]>> | null>(null);
  const assignmentBatcherRef = useRef<ReturnType<typeof createRealtimeBatcher<Parameters<typeof handleAssignmentChangeRealtime>[0]>> | null>(null);

  useEffect(() => {
    messageBatcherRef.current = createRealtimeBatcher<Parameters<typeof handleNewMessageRealtime>[0]>(
      (items) => {
        // Process all batched messages in a single React render cycle
        startTransition(() => {
          items.forEach(msg => handleNewMessageRealtime(msg));
        });
      },
      80 // 80ms — janela curta para sensação realtime, ainda agrupa rajadas
    );

    assignmentBatcherRef.current = createRealtimeBatcher<Parameters<typeof handleAssignmentChangeRealtime>[0]>(
      (items) => {
        startTransition(() => {
          items.forEach(assignment => handleAssignmentChangeRealtime(assignment));
        });
      },
      100 // 100ms — atribuições refletem quase instantaneamente
    );

    return () => {
      messageBatcherRef.current?.destroy();
      assignmentBatcherRef.current?.destroy();
    };
  }, [handleNewMessageRealtime, handleAssignmentChangeRealtime]);

  const throttledRealtimeCallbacks = useMemo(() => ({
    onNewMessage: (msg: Parameters<typeof handleNewMessageRealtime>[0]) => {
      messageBatcherRef.current?.push(msg);
    },
    onAssignmentChange: (assignment: Parameters<typeof handleAssignmentChangeRealtime>[0]) => {
      assignmentBatcherRef.current?.push(assignment);
    },
  }), []);

  useChatRealtime(channelIds, throttledRealtimeCallbacks, effectiveOrganizationId, externalImpersonatedOrgId);

  // ─── Pre-fetch adjacent conversations (3 below active) ────────────────────
  // Warms TanStack Query cache so switching chat feels instant
  const prefetchQueryClient = useQueryClient();
  useEffect(() => {
    if (!selectedConversation || conversations.length === 0) return;

    const selectedKey = getConversationKey(selectedConversation);
    const idx = conversations.findIndex(c => getConversationKey(c) === selectedKey);
    if (idx < 0) return;

    const adjacentConvs = conversations.slice(idx + 1, idx + 4);
    if (adjacentConvs.length === 0) return;

    const timer = setTimeout(() => {
      adjacentConvs.forEach(conv => {
        if (!conv.channelId || !conv.phone) return;
        const threadKey = getCanonicalPhoneThreadKey(conv.phone);
        const qk = ["messages", effectiveOrganizationId, conv.channelId, threadKey];
        // Only prefetch if not already cached
        if (!prefetchQueryClient.getQueryData(qk)) {
          const phoneVariants = buildMessageLookupVariants(conv.phone.replace(/\D/g, ''));
          prefetchQueryClient.prefetchInfiniteQuery({
            queryKey: qk,
            queryFn: async () => {
              return await fetchExternalMessages({ channelId: conv.channelId!, phoneVariants, cursor: null, pageSize: 25, impersonatedOrgId: effectiveOrganizationId });
            },
            initialPageParam: null as string | null,
            staleTime: 0,
            gcTime: 60_000,
          });
        }
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedConversation?.channelId, selectedConversation?.phone, conversations, prefetchQueryClient]);

  // Archive handlers
  const handleArchive = (conversation: Conversation) => {
    setConversationToArchive(conversation);
    setShowSaleConfirmationDialog(true);
  };

  const handleConfirmArchive = async (saleCompleted: boolean) => {
    if (!conversationToArchive) return;
    
    const key = getConversationKey(conversationToArchive);
    updateConversationStatus(key, "archived");
    
    if (saleCompleted) {
      toast.success("Venda registrada!");
    }
    
    toast.success("Conversa arquivada");
    setShowSaleConfirmationDialog(false);
    setConversationToArchive(null);
    
    if (selectedConversation && getConversationKey(selectedConversation) === key) {
      setSelectedConversation(null);
      setSelectedConversationStableKey(null);
    }
  };

  const handleRestore = async (conversation: Conversation) => {
    const key = getConversationKey(conversation);
    updateConversationStatus(key, "pending");
    toast.success("Conversa restaurada");
  };

  // Accept conversation handler
  const handleAcceptConversation = async (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error("Erro ao identificar usuário");
      return;
    }

    // Verificar se o usuário pode interagir com este setor
    if (!canInteractWithSector(conversation.sectorId)) {
      // Get sector name for better error message
      const sectorName = sectors.find(s => s.id === conversation.sectorId)?.name || "outro departamento";
      toast.error(`Você não tem permissão para atender conversas do departamento "${sectorName}"`);
      return;
    }

    const normalizedPhone = conversation.phone.replace(/\D/g, '');

    // CRÍTICO: Verificar no banco se a conversa já está atribuída a outro atendente
    const currentAssignment = await fetchAssignmentByPhoneExternal({
      channelId: conversation.channelId,
      phone: normalizedPhone,
    impersonatedOrgId: externalImpersonatedOrgId,
          });

    // CRITICAL: Re-check sector permission using the actual sector_id from DB
    // This prevents race conditions where frontend state is stale
    const actualSectorId = currentAssignment?.sector_id || conversation.sectorId;
    if (!canInteractWithSector(actualSectorId)) {
      const sectorName = sectors.find(s => s.id === actualSectorId)?.name || "outro departamento";
      toast.error(`Você não tem permissão para atender conversas do departamento "${sectorName}"`);
      return;
    }

    // Se já está atribuída a outro atendente e está ativa
    const isAssignedToOther = !!(currentAssignment?.assigned_to &&
      currentAssignment.assigned_to !== user.id &&
      currentAssignment.status !== 'archived');

    let isPrivilegedIntervention = false;
    if (isAssignedToOther) {
      // Atendentes não podem assumir conversas de outros atendentes
      // Apenas supervisors e admins podem intervir (sem reatribuir)
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      const canTakeOver = userRole?.role === 'super_admin' || userRole?.role === 'admin' || userRole?.role === 'supervisor';

      if (!canTakeOver) {
        toast.error("Esta conversa já está em atendimento por outro colaborador. Somente supervisores podem transferir.");
        return;
      }
      // Privileged intervention: admin/supervisor abre o atendimento mas
      // a conversa CONTINUA pertencendo ao atendente original.
      isPrivilegedIntervention = true;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, display_name, email")
      .eq("user_id", user.id)
      .single();

    if (!profile?.organization_id) {
      toast.error("Erro ao identificar organização");
      return;
    }

    // Se é uma intervenção privilegiada, não tocamos na atribuição:
    // apenas abrimos a conversa para o admin/supervisor poder responder.
    if (isPrivilegedIntervention) {
      const ownerName = conversation.assignedToName || 'atendente responsável';
      toast.info(`Atendimento de ${ownerName} aberto para intervenção. A conversa continua vinculada a ele.`);
      setSelectedConversation(conversation);
      return;
    }

    // Get user's first sector to assign to the conversation if it doesn't have one
    let sectorToAssign = actualSectorId;
    if (!sectorToAssign && sectorIds.length > 0) {
      // Inherit sector from the user accepting the conversation
      sectorToAssign = sectorIds[0];
    }

    try {
      const { error } = await assignmentsWrite("upsert_assignment", {
        payload: {
          conversation_phone: normalizedPhone,
          channel_id: conversation.channelId,
          assigned_to: user.id,
          status: "active",
          sector_id: sectorToAssign,
        },
      });

      if (error) {
        // Check if it's a RLS error
        if (error.message?.includes('row-level security')) {
          const sectorName = sectors.find(s => s.id === actualSectorId)?.name || "este departamento";
          toast.error(`Você não tem permissão para atender conversas do departamento "${sectorName}"`);
        } else {
          toast.error("Erro ao aceitar atendimento: " + error.message);
        }
        return;
      }

      const userName = profile.display_name || profile.email || 'Você';
      setAllConversations(prev => prev.map(c => {
        const key = getConversationKey(c);
        const convKey = getConversationKey(conversation);
        return key === convKey 
          ? { ...c, assignedTo: user.id, assignedToName: userName, status: "in_progress" as const, sectorId: sectorToAssign }
          : c;
      }));

      updateConversationStatus(getConversationKey(conversation), "in_progress");
      toast.success("Atendimento aceito!");
      setSelectedConversation({ ...conversation, assignedTo: user.id, assignedToName: userName, status: "in_progress", sectorId: sectorToAssign });
    } catch (error: any) {
      console.error("Erro ao aceitar atendimento:", error);
      // Better error message for RLS violations
      if (error?.message?.includes('row-level security') || error?.code === '42501') {
        const sectorName = sectors.find(s => s.id === actualSectorId)?.name || "este departamento";
        toast.error(`Você não tem permissão para atender conversas do departamento "${sectorName}"`);
      } else {
        toast.error("Erro ao aceitar atendimento");
      }
    }
  };

  // Export conversation as text file
  const handleExportConversation = async (conversation: Conversation) => {
    if (!conversation) return;

    try {
      toast.info("Exportando conversa...");

      const channelId = conversation.channelId;
      if (!channelId) {
        toast.error("Conversa sem canal vinculado");
        return;
      }
      const phone = conversation.phone.replace(/\D/g, "");
      const phoneVariants = buildMessageLookupVariants(phone);

      type ExportMsg = {
        sender_phone: string;
        sender_name: string | null;
        content: string | null;
        message_type: string;
        direction: string;
        created_at: string;
        media_url: string | null;
      };

      let allMessages: ExportMsg[] = [];

      // 1) Try external DB (SSoT) with cursor pagination
      try {
        let cursor: string | null = null;
        let safetyCounter = 0;
        const seen = new Set<string>();
        while (safetyCounter < 200) {
          safetyCounter += 1;
          const page = await fetchExternalMessages({
            channelId: String(channelId),
            phoneVariants,
            cursor,
            pageSize: 200,
            impersonatedOrgId: effectiveOrganizationId,
          });

          for (const m of page.messages) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            allMessages.push({
              sender_phone: m.sender_phone,
              sender_name: m.sender_name,
              content: m.content,
              message_type: m.message_type,
              direction: m.direction,
              created_at: m.created_at,
              media_url: m.media_url,
            });
          }

          if (!page.hasMore || !page.nextCursor) break;
          cursor = page.nextCursor;
        }
      } catch (extErr) {
        console.warn("[Export] External fetch failed, falling back to internal:", extErr);
      }

      // 2) Fallback to internal table if external returned nothing
      if (allMessages.length === 0) {
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from("whatsapp_messages")
            .select("sender_phone, sender_name, content, message_type, direction, created_at, media_url")
            .eq("channel_id", channelId)
            .or(`sender_phone.ilike.%${phone.slice(-8)}%,metadata->>destination.ilike.%${phone.slice(-8)}%`)
            .order("created_at", { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allMessages = [...allMessages, ...data];
            offset += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      }

      if (allMessages.length === 0) {
        toast.warning("Nenhuma mensagem encontrada para exportar");
        return;
      }

      // Sort chronologically (external returns desc; internal asc — normalize)
      allMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Build text content
      const contactName = conversation.name || conversation.phone;
      let textContent = `=== Exportação de Conversa ===\n`;
      textContent += `Contato: ${contactName} (${conversation.phone})\n`;
      textContent += `Data da exportação: ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}\n`;
      textContent += `Total de mensagens: ${allMessages.length}\n`;
      textContent += `${"=".repeat(40)}\n\n`;

      let lastDate = "";

      for (const msg of allMessages) {
        const msgDate = format(new Date(msg.created_at), "dd/MM/yyyy");
        const msgTime = format(new Date(msg.created_at), "HH:mm:ss");

        if (msgDate !== lastDate) {
          textContent += `\n--- ${msgDate} ---\n\n`;
          lastDate = msgDate;
        }

        const sender = msg.direction === "inbound"
          ? (msg.sender_name || contactName)
          : "Atendente";

        let messageContent = msg.content || "";

        if (msg.message_type === "image") {
          messageContent = `[Imagem]${msg.media_url ? ` ${msg.media_url}` : ""}${messageContent ? ` - ${messageContent}` : ""}`;
        } else if (msg.message_type === "video") {
          messageContent = `[Vídeo]${msg.media_url ? ` ${msg.media_url}` : ""}${messageContent ? ` - ${messageContent}` : ""}`;
        } else if (msg.message_type === "audio" || msg.message_type === "ptt") {
          messageContent = `[Áudio]${msg.media_url ? ` ${msg.media_url}` : ""}`;
        } else if (msg.message_type === "document") {
          messageContent = `[Documento]${msg.media_url ? ` ${msg.media_url}` : ""}${messageContent ? ` - ${messageContent}` : ""}`;
        } else if (msg.message_type === "sticker") {
          messageContent = `[Sticker]`;
        } else if (msg.message_type === "location") {
          messageContent = `[Localização]${messageContent ? ` - ${messageContent}` : ""}`;
        } else if (msg.message_type === "template") {
          messageContent = `[Template] ${messageContent}`;
        }

        textContent += `[${msgTime}] ${sender}: ${messageContent}\n`;
      }

      // Download as .txt file
      const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversa_${contactName.replace(/[^a-zA-Z0-9]/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Conversa exportada com ${allMessages.length} mensagens`);
    } catch (error) {
      console.error("Error exporting conversation:", error);
      toast.error("Erro ao exportar conversa");
    }
  };

  // Add to blacklist
  const handleAddToBlacklist = async (conversation: Conversation) => {
    if (!user) {
      toast.error("Erro ao identificar usuário");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.organization_id) {
      toast.error("Erro ao identificar organização");
      return;
    }

    try {
      const { error } = await supabase
        .from("blacklist")
        .insert({
          organization_id: profile.organization_id,
          phone: conversation.phone.replace(/\D/g, ''),
          name: conversation.name,
          reason: "Adicionado do WhatsApp Chat",
          blocked_by: user.id
        });

      if (error) {
        if (error.code === '23505') {
          toast.error("Este contato já está na lista negra");
        } else {
          throw error;
        }
      } else {
        toast.success(`${conversation.name || conversation.phone} adicionado à lista negra`);
      }
    } catch (error) {
      console.error("Erro ao adicionar à lista negra:", error);
      toast.error("Erro ao adicionar à lista negra");
    }
  };

  // Get channel for selected conversation
  const selectedConversationChannel = useMemo(() => {
    if (!selectedConversation?.channelId) return null;
    return channels.find(c => c.id === selectedConversation.channelId) || null;
  }, [selectedConversation?.channelId, channels]);

  // Send message — now delegates to useSendMessage (useMutation + optimistic cache update).
  // Accepts an optional pre-trimmed text from <MessageComposer>; falls back to reading
  // the live draft via the composer ref so legacy callers (e.g. send-on-Enter elsewhere)
  // keep working.
  const handleSendMessage = async (textOverride?: string) => {
    const conversationChannelId = selectedConversation?.channelId;
    const draft = textOverride ?? getNewMessage();
    if (!draft.trim() || !selectedConversation || !conversationChannelId || isSendingMessage) return;

    const conversationChannel = channels.find(c => c.id === conversationChannelId);
    const messageToSend = draft.trim();

    // CRÍTICO: Verificar no banco se outro atendente já pegou esta conversa.
    // Não bloquear o envio se a checagem falhar (rede, RLS, etc.) — apenas seguir.
    const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');
    let currentAssignment: { assigned_to: string | null; sector_id: string | null } | null = null;
    try {
      currentAssignment = await fetchAssignmentByPhoneExternal({
        channelId: conversationChannelId,
        phone: normalizedPhone,
      impersonatedOrgId: externalImpersonatedOrgId,
          });
    } catch (err) {
      console.warn('[handleSendMessage] assignment check failed, proceeding anyway:', err);
    }

    // Verificar acesso ao setor
    const assignmentSectorId = currentAssignment?.sector_id || selectedConversation.sectorId;
    if (!canInteractWithSector(assignmentSectorId)) {
      toast.error('Você não tem permissão para enviar mensagens para este departamento');
      return;
    }

    // Se já atribuída a outro atendente:
    // - Atendentes comuns: bloqueia o envio
    // - Admin/supervisor/super_admin: PERMITE intervenção (sem reatribuir o dono)
    if (currentAssignment?.assigned_to && currentAssignment.assigned_to !== user?.id) {
      const canIntervene = isAdmin || isSupervisor || isSuperAdmin;
      if (!canIntervene) {
        toast.error('Esta conversa já foi assumida por outro atendente');
        const { data: assignedProfile } = await supabase
          .from('profiles')
          .select('display_name, email')
          .eq('user_id', currentAssignment.assigned_to)
          .single();
        const assignedName = assignedProfile?.display_name || assignedProfile?.email || 'Outro atendente';
        setAllConversations(prev => prev.map(c => {
          const cNormalized = c.phone.replace(/\D/g, '');
          return cNormalized === normalizedPhone && c.channelId === conversationChannelId
            ? { ...c, assignedTo: currentAssignment.assigned_to, assignedToName: assignedName }
            : c;
        }));
        setSelectedConversation(prev => prev
          ? { ...prev, assignedTo: currentAssignment.assigned_to, assignedToName: assignedName }
          : null
        );
        return;
      }
      // Privileged intervention: admin/supervisor envia mensagem mantendo o dono original.
    }

    // Clear input immediately (optimistic UX) — restored by useSendMessage.onError if needed
    setNewMessage("");

    // Fire mutation — onMutate injects optimistic bubble into infinite cache instantly
    sendMessageMutation.mutate(
      {
        channelId: conversationChannelId,
        channelPhone: conversationChannel?.phone || "",
        channelProvider: conversationChannel?.provider || "meta",
        destination: selectedConversation.phone,
        message: messageToSend,
        messageType: "text",
      },
      {
        onSuccess: async (data) => {
          if (!data.success) return; // onSuccess in hook already handles error state

          const ownerAfterSend = currentAssignment?.assigned_to || selectedConversation.assignedTo || user?.id || null;
          markConversationAsResponded({
            channelId: conversationChannelId,
            phone: selectedConversation.phone,
            assignedTo: ownerAfterSend,
            assignedToName: ownerAfterSend === user?.id ? 'Você' : selectedConversation.assignedToName,
          });

          // Auto-assign when sending first message
          if (!currentAssignment?.assigned_to && !selectedConversation.assignedTo && user?.id) {
            const { error: assignError } = await assignmentsWrite("upsert_assignment", {
              payload: {
                conversation_phone: normalizedPhone,
                channel_id: conversationChannelId,
                assigned_to: user.id,
                status: 'in_progress',
                sector_id: currentAssignment?.sector_id || selectedConversation.sectorId,
              },
            });

            if (!assignError) {
              setAllConversations(prev => prev.map(c => {
                const normalizedCPhone = c.phone.replace(/\D/g, '');
                return normalizedCPhone === normalizedPhone && c.channelId === conversationChannelId
                  ? { ...c, assignedTo: user.id, assignedToName: 'Você', status: 'in_progress' as const }
                  : c;
              }));
              setSelectedConversation(prev => prev ? { ...prev, assignedTo: user.id, assignedToName: 'Você', status: 'in_progress' } : null);
            }
          }
        },
      }
    );
  };

  // Send media — delegates to useSendMessage (optimistic updates via infinite cache)
  const handleSendMedia = async (mediaData: {
    mediaType: string;
    mediaUrl: string;
    mediaCaption?: string;
    fileName?: string;
  }) => {
    const conversationChannelId = selectedConversation?.channelId;
    if (!selectedConversation || !conversationChannelId) return;

    const conversationChannel = channels.find(c => c.id === conversationChannelId);
    const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');

    // CRÍTICO: Verificar no banco se outro atendente já pegou esta conversa
    const currentAssignment = await fetchAssignmentByPhoneExternal({
      channelId: conversationChannelId,
      phone: normalizedPhone,
    impersonatedOrgId: externalImpersonatedOrgId,
          });

    if (currentAssignment?.assigned_to && currentAssignment.assigned_to !== user?.id) {
      const canIntervene = isAdmin || isSupervisor || isSuperAdmin;
      if (!canIntervene) {
        toast.error('Esta conversa já foi assumida por outro atendente');
        const { data: assignedProfile } = await supabase
          .from('profiles')
          .select('display_name, email')
          .eq('user_id', currentAssignment.assigned_to)
          .single();
        const assignedName = assignedProfile?.display_name || assignedProfile?.email || 'Outro atendente';
        setAllConversations(prev => prev.map(c => {
          const cNormalized = c.phone.replace(/\D/g, '');
          return cNormalized === normalizedPhone && c.channelId === conversationChannelId
            ? { ...c, assignedTo: currentAssignment.assigned_to, assignedToName: assignedName }
            : c;
        }));
        setSelectedConversation(prev => prev
          ? { ...prev, assignedTo: currentAssignment.assigned_to, assignedToName: assignedName }
          : null
        );
        return;
      }
      // Privileged intervention: admin/supervisor envia mídia mantendo o dono original.
    }

    sendMessageMutation.mutate(
      {
        channelId: conversationChannelId,
        channelPhone: conversationChannel?.phone || "",
        channelProvider: conversationChannel?.provider || "meta",
        destination: selectedConversation.phone,
        message: mediaData.mediaCaption || `[${mediaData.mediaType}]`,
        messageType: mediaData.mediaType,
        mediaUrl: mediaData.mediaUrl,
        mediaCaption: mediaData.mediaCaption,
        fileName: mediaData.fileName,
      },
      {
        onSuccess: async (data) => {
          if (!data.success) return;
          const ownerAfterSend = currentAssignment?.assigned_to || selectedConversation.assignedTo || user?.id || null;
          markConversationAsResponded({
            channelId: conversationChannelId,
            phone: selectedConversation.phone,
            assignedTo: ownerAfterSend,
            assignedToName: ownerAfterSend === user?.id ? 'Você' : selectedConversation.assignedToName,
          });
          if (mediaData.mediaType === 'ptt') {
            toast.success("Áudio enviado!");
          } else {
            toast.success("Mídia enviada!");
          }
          // Auto-assign
          if (!currentAssignment?.assigned_to && !selectedConversation.assignedTo && user?.id) {
            const { error: assignError } = await assignmentsWrite("upsert_assignment", {
              payload: {
                conversation_phone: normalizedPhone,
                channel_id: conversationChannelId,
                assigned_to: user.id,
                status: 'in_progress',
                sector_id: currentAssignment?.sector_id || selectedConversation.sectorId,
              },
            });
            if (!assignError) {
              setAllConversations(prev => prev.map(c => {
                const normalizedCPhone = c.phone.replace(/\D/g, '');
                return normalizedCPhone === normalizedPhone && c.channelId === conversationChannelId
                  ? { ...c, assignedTo: user.id, assignedToName: 'Você', status: 'in_progress' as const }
                  : c;
              }));
              setSelectedConversation(prev => prev ? { ...prev, assignedTo: user.id, assignedToName: 'Você', status: 'in_progress' } : null);
            }
          }
        },
      }
    );
  };

  // File upload handler
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: "image" | "video" | "audio" | "document") => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!selectedConversation) {
      toast.error("Selecione uma conversa primeiro");
      return;
    }

    setUploadingMedia(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get a signed upload URL on the EXTERNAL bucket
      const { data: signed, error: signErr } = await supabase.functions.invoke(
        'external-storage-sign-upload',
        { body: { fileName: file.name } },
      );
      if (signErr || !signed?.signedUrl) {
        toast.error('Erro ao preparar upload');
        setUploadingMedia(false);
        return;
      }

      // PUT directly to the external bucket
      const putResp = await fetch(signed.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
        body: file,
      });
      if (!putResp.ok) {
        toast.error('Erro ao fazer upload do arquivo');
        setUploadingMedia(false);
        return;
      }

      await handleSendMedia({
        mediaType,
        mediaUrl: signed.publicUrl,
        fileName: file.name
      });

    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Erro ao enviar arquivo');
    }

    setUploadingMedia(false);
  };

  // Voice recording
  const formatRecordingDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartVoiceRecording = async () => {
    if (!selectedConversation) {
      toast.error("Selecione uma conversa primeiro");
      return;
    }

    try {
      await startRecording();
    } catch (error) {
      console.error('Recording error:', error);
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const handleSendVoiceRecording = async () => {
    const audioBlob = await stopRecording();
    if (!audioBlob) {
      toast.error("Erro ao gravar áudio");
      return;
    }

    if (!selectedConversation) {
      toast.error("Selecione uma conversa primeiro");
      return;
    }

    setUploadingMedia(true);
    setIsConvertingAudio(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (audioBlob.size === 0) {
        toast.error('Erro: gravação vazia');
        setIsConvertingAudio(false);
        setUploadingMedia(false);
        return;
      }

      const actualMimeType = audioBlob.type || 'audio/ogg';
      const isNativeOgg = actualMimeType.includes('ogg');
      
      console.log('[AtendimentoV2] Processing audio:', { type: actualMimeType, size: audioBlob.size, isNativeOgg });
      
      // Converter para base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let base64 = '';
      const chunkSize = 32768;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        base64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      base64 = btoa(base64);
      
      // Chamar Edge Function para conversão no servidor
      toast.loading('Processando áudio...', { id: 'audio-conversion' });
      
      const { data: convData, error: convError } = await supabase.functions.invoke('convert-audio', {
        body: {
          audioData: base64,
          mimeType: actualMimeType,
          organizationId: effectiveOrganizationId
        }
      });
      
      toast.dismiss('audio-conversion');
      
      if (convError || !convData?.success) {
        console.error('[AtendimentoV2] Audio conversion error:', convError || convData?.error);
        toast.error(convData?.error || 'Erro ao processar áudio');
        setIsConvertingAudio(false);
        setUploadingMedia(false);
        return;
      }
      
      const publicUrl = convData.convertedUrl;
      console.log('[AtendimentoV2] Audio processed:', { url: publicUrl, converted: convData.converted });
      
      // Enviar usando o mesmo método do upload manual de mídia
      await handleSendMedia({
        mediaType: 'audio',
        mediaUrl: publicUrl,
        fileName: `gravacao.opus`
      });

    } catch (error) {
      console.error('Voice recording error:', error);
      toast.dismiss('audio-conversion');
      const msg = error instanceof Error ? error.message : 'Erro ao enviar áudio';
      toast.error(msg);
    }

    setIsConvertingAudio(false);
    setUploadingMedia(false);
  };

  const handleCancelVoiceRecording = () => {
    cancelRecording();
    toast.info("Gravação cancelada");
  };

  // Send template — delegates to useSendMessage (optimistic updates via infinite cache)
  const handleSendTemplate = async (templateName: string, templateParams: string[]) => {
    const conversationChannelId = selectedConversation?.channelId;
    if (!selectedConversation || !conversationChannelId) return;

    const conversationChannel = channels.find(c => c.id === conversationChannelId);

    if (conversationChannel?.provider === 'zapi') {
      toast.error('Templates não são suportados em canais Z-API. Use mensagens de texto.');
      return;
    }

    const tplData = templates.get(templateName);

    sendMessageMutation.mutate(
      {
        channelId: conversationChannelId,
        channelPhone: conversationChannel?.phone || "",
        channelProvider: conversationChannel?.provider || "meta",
        destination: selectedConversation.phone,
        message: `Template: ${templateName}`,
        messageType: "template",
        templateName,
        templateParams,
        templateContent: tplData?.content,
        templateButtons: tplData?.components?.buttons,
      },
      {
        onSuccess: (data) => {
          if (data.success) {
            markConversationAsResponded({ channelId: conversationChannelId, phone: selectedConversation.phone });
            toast.success("Template enviado!");
          }
        },
      }
    );
  };

  // Handler for when template is sent manually via ManualSendDialog
  // This creates the conversation immediately in the UI so it appears in "Meus"
  const handleManualTemplateSent = async (data: { 
    phone: string; 
    channelId: string; 
    templateName: string;
    templateContent: string;
  }) => {
    const normalizedPhone = normalizePhoneNumber(data.phone);
    const displayPhone = '+' + normalizedPhone;
    
    // Mark this conversation as locally created to prevent realtime duplicates
    const convKey = `${data.channelId}_${normalizedPhone}`;
    locallyCreatedConversationsRef.current.add(convKey);
    
    // Remove from set after 5 seconds to allow future realtime updates
    setTimeout(() => {
      locallyCreatedConversationsRef.current.delete(convKey);
    }, 5000);
    
    // CRITICAL: Persist conversation assignment to database FIRST
    // This ensures the conversation persists even after page refresh
    // Note: organization isolation is handled via channel_id (each channel belongs to one org)
    let assignmentId: string | null = null;
    
    if (user?.id) {
      const now = new Date().toISOString();
      const botPausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      const { data: assignmentData, error: assignmentError } = await assignmentsWrite("upsert_assignment", {
        payload: {
          channel_id: data.channelId,
          conversation_phone: normalizedPhone,
          assigned_to: user.id,
          status: 'in_progress',
          is_bot_handling: false,
          bot_paused_until: botPausedUntil,
        },
      });
      
      if (assignmentError) {
        console.error('Error persisting conversation assignment:', assignmentError);
        // Continue anyway - at least try to show in UI
      } else {
        assignmentId = (assignmentData?.assignment?.id) || null;
        console.log('Persisted conversation assignment to database:', normalizedPhone, 'ID:', assignmentId);
      }
    }
    
    // Check if conversation already exists in local state
    const existingConv = allConversations.find(c => {
      const cKey = `${c.channelId}_${normalizePhoneNumber(c.phone)}`;
      return cKey === convKey;
    });
    
    if (existingConv) {
      // Update existing conversation and assign to current user
      setAllConversations(prev => prev.map(c => {
        const cKey = `${c.channelId}_${normalizePhoneNumber(c.phone)}`;
        if (cKey === convKey) {
          return {
            ...c,
            id: assignmentId || c.id,
            lastMessage: `Template: ${data.templateName}`,
            lastMessageTime: new Date().toISOString(),
            status: "in_progress" as const,
            assignedTo: user?.id || null,
            assignedToName: null // Will be updated by realtime
          };
        }
        return c;
      }));
      
      // Select and navigate to this conversation
      const updatedConv: Conversation = {
        ...existingConv,
        id: assignmentId || existingConv.id,
        lastMessage: `Template: ${data.templateName}`,
        lastMessageTime: new Date().toISOString(),
        status: "in_progress" as const,
        assignedTo: user?.id || null
      };
      setSelectedConversation(updatedConv);
      setFilterStatus("mine");
      return;
    }
    
    // Get lead info from local cache first
    const phoneSuffix8 = normalizedPhone.slice(-8);
    
    let leadName: string | null = null;
    let leadTags: string[] | null = null;
    let leadId: string | null = null;
    
    const cachedLeadMatch = getLeadFromCache(normalizedPhone);
    const matches = cachedLeadMatch ? [cachedLeadMatch] : [];
    
    for (const m of matches) {
      if (!m) continue;
      if (!leadId && m.id) leadId = m.id;
      if (!leadName && m.name && !m.name.startsWith('LeadWhats-')) leadName = m.name;
      if ((!leadTags || leadTags.length === 0) && m.tags && m.tags.length > 0) {
        leadTags = m.tags;
      }
      if (leadId && leadName && leadTags && leadTags.length > 0) break;
    }
    
    // If not found in cache, search database directly
    if (!leadName || leadName.startsWith('LeadWhats-')) {
      const { data: leadData } = await supabase
        .from('leads')
        .select('id, name, tags')
        .eq('organization_id', effectiveOrganizationId)
        .or(`phone.ilike.%${phoneSuffix8}%`)
        .limit(1)
        .maybeSingle();
      
      if (leadData) {
        if (leadData.name && !leadData.name.startsWith('LeadWhats-')) {
          leadName = leadData.name;
        }
        if (leadData.tags && leadData.tags.length > 0) {
          leadTags = leadData.tags;
        }
        if (leadData.id) {
          leadId = leadData.id;
        }
      }
    }
    
    // Update assignment with lead_id if found
    if (leadId && user?.id) {
      await assignmentsWrite("update_by_phone", {
        channel_id: data.channelId,
        phone: normalizedPhone,
        lead_id: leadId,
      });
    }
    
    // Create new conversation in local state with ID
    const newConv: Conversation = {
      id: assignmentId || undefined,
      phone: displayPhone,
      name: leadName,
      lastMessage: `Template: ${data.templateName}`,
      lastMessageTime: new Date().toISOString(),
      lastInboundTime: null,
      unreadCount: 0,
      channelId: data.channelId,
      status: "in_progress",
      assignedTo: user?.id || null,
      assignedToName: null, // Will be updated by realtime
      sectorId: null,
      tags: leadTags
    };
    
    // Add or update in conversations list - AVOID DUPLICATES using normalized key
    setAllConversations(prev => {
      // Check if conversation already exists for this channel+phone using normalized comparison
      const existingIdx = prev.findIndex(c => {
        const cKey = `${c.channelId}_${normalizePhoneNumber(c.phone)}`;
        return cKey === convKey;
      });
      
      if (existingIdx >= 0) {
        // Update existing conversation in place
        const updated = [...prev];
        updated[existingIdx] = { 
          ...updated[existingIdx], 
          ...newConv,
          id: assignmentId || updated[existingIdx].id // Preserve ID if we have one
        };
        return updated;
      }
      
      // Add new conversation at the beginning
      return [newConv, ...prev];
    });
    
    // Select the new conversation and switch to "Meus" tab
    setSelectedConversation(newConv);
    setFilterStatus("mine");
  };

  // Format helpers
  const formatMessageTime = (dateStr: string) => format(new Date(dateStr), "HH:mm");

  const formatConversationDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return "Ontem";
    return format(date, "dd/MM", { locale: ptBR });
  };

  // Render message content
  const renderMessageContent = (message: Message) => {
    const isMedia = ["image", "video", "audio", "document", "file", "sticker"].includes(message.message_type);
    
    if (isMedia && message.media_url) {
      switch (message.message_type) {
        case "image":
        case "sticker":
          return (
            <div className="space-y-1">
              <div 
                className="cursor-pointer group relative"
                onClick={() => setMediaPreview({
                  isOpen: true,
                  url: message.media_url!,
                  type: message.message_type as "image" | "sticker",
                })}
              >
                <img 
                  src={message.media_url} 
                  alt="Media" 
                  className="max-w-full rounded-lg max-h-60 object-cover transition-opacity group-hover:opacity-90"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                  <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
                </div>
              </div>
              {message.content && message.content !== `[${message.message_type}]` && (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>
          );
        case "video":
          return (
            <div className="space-y-1">
              <div 
                className="cursor-pointer group relative"
                onClick={() => setMediaPreview({
                  isOpen: true,
                  url: message.media_url!,
                  type: "video",
                })}
              >
                <video src={message.media_url} className="max-w-full rounded-lg max-h-60" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg group-hover:bg-black/40 transition-colors">
                  <Play className="w-12 h-12 text-white drop-shadow-lg" />
                </div>
              </div>
              {message.content && message.content !== "[video]" && (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>
          );
        case "audio":
          return <audio src={message.media_url} controls className="max-w-full" />;
        case "document":
        case "file":
          return (
            <div 
              className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
              onClick={() => setMediaPreview({
                isOpen: true,
                url: message.media_url!,
                type: message.message_type as "document" | "file",
                fileName: message.content || "Documento",
              })}
            >
              <FileText className="w-5 h-5 text-primary" />
              <span className="flex-1 truncate">{message.content || "Documento"}</span>
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </div>
          );
        default:
          return <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>;
      }
    }

    // Template messages
    if (message.message_type === "template" || message.content?.startsWith("Template:")) {
      const metadata = message.metadata as { 
        templateName?: string; 
        templateParams?: string[]; 
        templateContent?: string;
        templateButtons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
      } | null;
      
      let templateName = metadata?.templateName || "";
      const templateParams = metadata?.templateParams || [];
      
      if (!templateName && message.content?.startsWith("Template:")) {
        templateName = message.content.replace("Template:", "").trim();
      }

      const templateData = templates.get(templateName);
      let displayContent = metadata?.templateContent || templateData?.content || "";
      const buttons = metadata?.templateButtons || templateData?.components?.buttons || [];
      
      if (displayContent) {
        templateParams.forEach((param, index) => {
          displayContent = displayContent.replace(`{{${index + 1}}}`, param);
        });

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/80 mb-1">
              <FileText className="w-3 h-3" />
              <span className="font-medium">{templateName}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{displayContent}</p>
            
            {buttons.length > 0 && (
              <div className="flex flex-col gap-1 pt-2 border-t border-border/30">
                {buttons.map((button, idx) => (
                  <div key={idx} className="flex items-center justify-center gap-2 py-1.5 px-3 rounded bg-background/20 text-xs font-medium text-center">
                    {button.type === "URL" && <><span className="text-primary">🔗</span><span>{button.text}</span></>}
                    {button.type === "PHONE_NUMBER" && <><Phone className="w-3 h-3 text-primary" /><span>{button.text}</span></>}
                    {button.type === "QUICK_REPLY" && <span>{button.text}</span>}
                    {!["URL", "PHONE_NUMBER", "QUICK_REPLY"].includes(button.type) && <span>{button.text}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
            <FileText className="w-3 h-3" />
            <span className="font-medium">{templateName || "Template"}</span>
          </div>
          <p className="text-sm text-muted-foreground italic">Conteúdo do template indisponível</p>
        </div>
      );
    }

    return <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>;
  };

  const hasClientResponse = useCallback((conv: Conversation) => conv.lastInboundTime !== null, []);

  const hasOutgoingResponseAfterClient = useCallback((conv: Conversation) => {
    if (!conv.lastInboundTime || !conv.lastMessageTime) return false;

    return new Date(conv.lastMessageTime).getTime() > new Date(conv.lastInboundTime).getTime();
  }, []);

  // "Não Lido" REAL: conversa é considerada não-lida sempre que a última mensagem
  // veio do cliente (inbound) e ainda não houve resposta posterior do atendente —
  // independentemente do contador persistido `unread_count`. Isso garante que
  // QUALQUER conversa aguardando resposta humana apareça em "Não Lidos", inclusive
  // as que estão em atendimento ("Meus") e as da fila ("Novos").
  const isTrulyUnread = useCallback(
    (conv: Conversation) =>
      hasClientResponse(conv) &&
      !hasOutgoingResponseAfterClient(conv),
    [hasClientResponse, hasOutgoingResponseAfterClient]
  );

  const isHandledWithoutOwnerConversation = useCallback(
    (conv: Conversation) =>
      hasClientResponse(conv) &&
      !hasAssignedAgent(conv) &&
      conv.status === "pending" &&
      hasOutgoingResponseAfterClient(conv),
    [hasClientResponse, hasOutgoingResponseAfterClient]
  );

  const isWaitingQueueConversation = useCallback(
    (conv: Conversation) =>
      hasClientResponse(conv) &&
      !hasAssignedAgent(conv) &&
      conv.status === "pending" &&
      !hasOutgoingResponseAfterClient(conv),
    [hasClientResponse, hasOutgoingResponseAfterClient]
  );
  
  const isArchivedLikeConversation = useCallback(
    (conv: Conversation) => conv.status === "archived" || (!hasClientResponse(conv) && !conv.assignedTo),
    [hasClientResponse]
  );

  // Computed values - active tabs only show replied conversations or manual/owned attendances
  const activeConversations = conversations
    .filter(conv => !isArchivedLikeConversation(conv))
    .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  const archivedConversations = conversations.filter(isArchivedLikeConversation);

  const { isAdmin, isSupervisor, isSuperAdmin } = useUserRole();
  const canSeeOthers = isAdmin || isSupervisor || isSuperAdmin;
  
  // CRITICAL FIX: For attendants, strict visibility rules:
  // 1. ONLY see conversations assigned to them (their "Meus")
  // 2. ONLY see unassigned conversations without sector (true orphans)
  // Conversations with sectors should ALWAYS be auto-distributed, so attendants
  // should NEVER see them in "Novos" - they go directly to the assigned attendant's "Meus"
  const visibleConversations = canSeeOthers 
    ? activeConversations 
    : activeConversations.filter(conv => {
        // ABSOLUTE RULE 1: If conversation has an assignee that is NOT this user, HIDE IT
        // This is the MOST IMPORTANT rule - attendants MUST NEVER see other people's conversations
        if (conv.assignedTo && conv.assignedTo !== user?.id) {
          return false;
        }
        
        // ABSOLUTE RULE 2: If conversation belongs to a sector the user is NOT part of, HIDE IT
        // This ensures Adriele (Valadares) never sees Helmara's (BH) conversations
        if (conv.sectorId && !sectorIds.includes(conv.sectorId)) {
          return false;
        }
        
        // RULE 3: Show conversations assigned to this user
        if (conv.assignedTo === user?.id) {
          return true;
        }
        
        // RULE 4: Only show truly orphan conversations (no assignee AND no sector)
        if (!conv.assignedTo && !conv.sectorId) {
          return true;
        }
        
        // RULE 5: Conversation has user's sector but no assignee
        // This should be rare - normally auto-distributed immediately
        if (!conv.assignedTo && conv.sectorId && sectorIds.includes(conv.sectorId)) {
          return true;
        }
        
        // Default: hide
        return false;
      });
  
  // Helper: check if conversation matches sector filter
  // CRITICAL: Also cross-references the attendant's actual sector membership
  // to prevent conversations from showing under wrong department
  const matchesSectorFilter = useCallback((conv: Conversation): boolean => {
    if (!filterBySector) return true;
    if (filterBySector === "none") return !conv.sectorId;
    
    // Check conversation's sector matches
    const convSectorMatches = conv.sectorId === filterBySector;
    
    // Additionally, if conversation has an assignee, verify the attendant 
    // actually belongs to the filtered sector
    if (convSectorMatches && conv.assignedTo && attendantSectorsMap.size > 0) {
      const attendantSectors = attendantSectorsMap.get(conv.assignedTo);
      // If we have sector data for this attendant and they DON'T belong to
      // the filtered sector, hide this conversation from this filter view
      if (attendantSectors && !attendantSectors.has(filterBySector)) {
        return false;
      }
    }
    
    return convSectorMatches;
  }, [filterBySector, attendantSectorsMap]);

  // Merge local + global search results, deduplicated
  const combinedSearchResults = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return [];
    const seen = new Set<string>();
    const results: Conversation[] = [];
    // Local results first (instant)
    for (const c of localSearchResults) {
      const key = getConversationKey(c);
      if (!seen.has(key)) { seen.add(key); results.push(c); }
    }
    // Global results from DB (may arrive later)
    for (const c of globalSearchResults) {
      const key = getConversationKey(c);
      if (!seen.has(key)) { seen.add(key); results.push(c); }
    }
    return results;
  }, [localSearchResults, globalSearchResults, searchTerm]);

  const hasSearchResults = combinedSearchResults.length > 0 && searchTerm.length >= 2;
  
  let filteredConversations = hasSearchResults 
    ? combinedSearchResults.filter(conv => {
        // Apply filter status to global results too
        let matchesFilter = false;
        if (filterStatus === "unread") {
          // "Não Lidos" - admins/supervisores veem TODAS as conversas não lidas da organização
          // (para acompanhar performance dos atendentes). Atendentes veem só as suas + órfãs do setor.
          // IMPORTANTE: só conta como não-lida se a última mensagem veio do cliente
          // (atendente ainda não respondeu depois). isTrulyUnread garante isso.
          if (canSeeOthers) {
            matchesFilter = isTrulyUnread(conv) && !isArchivedLikeConversation(conv);
          } else {
            const isMyConversation = conv.assignedTo === user?.id;
            const isOrphanVisibleToMe = !conv.assignedTo && conv.status !== "in_progress" && (!conv.sectorId || sectorIds.includes(conv.sectorId));
            matchesFilter = isTrulyUnread(conv) && (isMyConversation || isOrphanVisibleToMe) && !isArchivedLikeConversation(conv);
          }
        }
        else if (filterStatus === "new") {
          // "Novos" = waiting queue only: replied conversations still pending and without owner
          // Anything already in progress must leave this queue immediately
          matchesFilter = isWaitingQueueConversation(conv) && (canSeeOthers || !conv.sectorId);
        }
        else if (filterStatus === "mine") matchesFilter = conv.assignedTo === user?.id && conv.status !== "archived";
        else if (filterStatus === "others") {
          matchesFilter = canSeeOthers && (
            (conv.assignedTo !== null && conv.assignedTo !== user?.id) ||
            isHandledWithoutOwnerConversation(conv)
          ) && conv.status !== "archived";
        }
        
        // Apply attendant filter (only for admins/supervisors).
        // Filter is scoped to the current tab — never auto-switches the active tab.
        // "none" = sem atendente (assignedTo nulo)
        const matchesAttendant = !filterByAttendant
          ? true
          : filterByAttendant === "none"
            ? !conv.assignedTo
            : conv.assignedTo === filterByAttendant;
        
        // Apply sector filter with attendant cross-reference
        const matchesSector = matchesSectorFilter(conv);
        
        return matchesFilter && matchesAttendant && matchesSector && conv.status !== "archived";
      })
    : visibleConversations.filter(conv => {
        const matchesSearch = !searchTerm || conv.phone.includes(searchTerm) || conv.name?.toLowerCase().includes(searchTerm.toLowerCase());
        
        let matchesFilter = false;
        if (filterStatus === "unread") {
          // "Não Lidos" - admins/supervisores veem TODAS as conversas não lidas da organização
          // Só conta como não-lida se o cliente é quem mandou a última mensagem.
          if (canSeeOthers) {
            matchesFilter = isTrulyUnread(conv) && !isArchivedLikeConversation(conv);
          } else {
            const isMyConversation = conv.assignedTo === user?.id;
            const isOrphanVisibleToMe = !conv.assignedTo && conv.status !== "in_progress" && (!conv.sectorId || sectorIds.includes(conv.sectorId));
            matchesFilter = isTrulyUnread(conv) && (isMyConversation || isOrphanVisibleToMe) && !isArchivedLikeConversation(conv);
          }
        }
        else if (filterStatus === "new") {
          // "Novos" = waiting queue only: replied conversations still pending and without owner
          matchesFilter = isWaitingQueueConversation(conv) && (canSeeOthers || !conv.sectorId);
        }
        else if (filterStatus === "mine") matchesFilter = conv.assignedTo === user?.id && conv.status !== "archived";
        else if (filterStatus === "others") {
          matchesFilter = canSeeOthers && (
            (conv.assignedTo !== null && conv.assignedTo !== user?.id) ||
            isHandledWithoutOwnerConversation(conv)
          ) && conv.status !== "archived";
        }
        
        // Apply attendant filter (only for admins/supervisors).
        // Filter is scoped to the current tab — never auto-switches the active tab.
        // "none" = sem atendente (assignedTo nulo)
        const matchesAttendant = !filterByAttendant
          ? true
          : filterByAttendant === "none"
            ? !conv.assignedTo
            : conv.assignedTo === filterByAttendant;
        
        // Apply sector filter with attendant cross-reference
        const matchesSector = matchesSectorFilter(conv);
        
        return matchesSearch && matchesFilter && matchesAttendant && matchesSector;
      });

  // Reordenação por tempo de espera — exclusiva da aba "Não Lidos".
  // REFERÊNCIA ÚNICA: lastInboundTime (última mensagem do cliente).
  // Mesma referência usada no badge de tempo em ConversationItem para garantir consistência.
  // Conversas sem inbound vão para o final independentemente do sentido de ordenação.
  if (filterStatus === "unread" && !showArchived && unreadWaitSort) {
    const getWaitReference = (conv: Conversation) => {
      if (!conv.lastInboundTime) return null;
      const t = new Date(conv.lastInboundTime).getTime();
      return Number.isNaN(t) ? null : t;
    };
    filteredConversations = [...filteredConversations].sort((a, b) => {
      const ta = getWaitReference(a);
      const tb = getWaitReference(b);
      // Sem inbound => sempre por último (sem "espera" definida)
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      // 'desc' = maior espera primeiro = timestamp MAIS ANTIGO no topo
      // 'asc'  = menor espera primeiro = timestamp MAIS RECENTE no topo
      return unreadWaitSort === "desc" ? ta - tb : tb - ta;
    });
  }

  // Garante que o badge "bolinha vermelha" reflita TODA conversa aguardando
  // resposta humana (cliente mandou mensagem e atendente ainda não respondeu),
  // independentemente do contador persistido `unread_count` no banco.
  filteredConversations = filteredConversations.map(conv => {
    if (conv.unreadCount > 0) return conv;
    if (isTrulyUnread(conv)) return { ...conv, unreadCount: 1 };
    return conv;
  });

  const visibleArchivedConversations = canSeeOthers
    ? archivedConversations 

    : archivedConversations.filter(conv => {
        // Attendants can see archived conversations that were:
        // 1. Assigned to them
        // 2. Unassigned but in their sector or without sector
        if (conv.assignedTo === user?.id) return true;
        if (!conv.assignedTo) {
          if (!conv.sectorId) return true;
          return sectorIds.includes(conv.sectorId);
        }
        return false;
      });
    
  // Include global search results in archived if they are archived
  const archivedFromGlobalSearch = hasSearchResults 
    ? combinedSearchResults.filter(conv => isArchivedLikeConversation(conv))
    : [];
    
  const filteredArchived = hasSearchResults
    ? archivedFromGlobalSearch
        .filter(conv => {
          const matchesAttendant = !filterByAttendant
            ? true
            : filterByAttendant === "none"
              ? !conv.assignedTo
              : conv.assignedTo === filterByAttendant;
          const matchesSector = matchesSectorFilter(conv);
          return matchesAttendant && matchesSector;
        })
        .sort((a, b) => {
          const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
          const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
          return timeB - timeA;
        })
    : visibleArchivedConversations
        .filter(conv => {
          const matchesSearch = !searchTerm || conv.phone.includes(searchTerm) || conv.name?.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesAttendant = !filterByAttendant
            ? true
            : filterByAttendant === "none"
              ? !conv.assignedTo
              : conv.assignedTo === filterByAttendant;
          const matchesSector = matchesSectorFilter(conv);
          return matchesSearch && matchesAttendant && matchesSector;
        })
        .sort((a, b) => {
          const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
          const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
          return timeB - timeA;
        });

  // Counts - "Novos" = waiting queue only
  const newCount = visibleConversations.filter(c => isWaitingQueueConversation(c) && (canSeeOthers || !c.sectorId)).length;
  const mineCount = visibleConversations.filter(c => c.assignedTo === user?.id).length;
  const othersCount = canSeeOthers
    ? visibleConversations.filter(c => (c.assignedTo && c.assignedTo !== user?.id) || isHandledWithoutOwnerConversation(c)).length
    : 0;
  const unreadCount = visibleConversations.filter(c => {
    // Conta apenas conversas onde o cliente é quem mandou a última mensagem (não-lida real)
    if (!isTrulyUnread(c)) return false;
    if (canSeeOthers) return true; // Admins/supervisores: contam todas as não lidas da org
    const isMyConversation = c.assignedTo === user?.id;
    const isOrphanVisibleToMe = !c.assignedTo && c.status !== "in_progress" && (!c.sectorId || sectorIds.includes(c.sectorId));
    return isMyConversation || isOrphanVisibleToMe;
  }).length;

  const autoLoadContextKey = useMemo(
    () =>
      [
        effectiveOrganizationId ?? "no-org",
        user?.id ?? "no-user",
        filterStatus,
        filterByAttendant ?? "all-attendants",
        filterBySector ?? "all-sectors",
        showArchived ? "archived" : "active",
      ].join("|"),
    [effectiveOrganizationId, user?.id, filterStatus, filterByAttendant, filterBySector, showArchived]
  );

  useEffect(() => {
    autoLoadAttemptsRef.current.delete(autoLoadContextKey);
  }, [autoLoadContextKey]);

  useEffect(() => {
    if (showArchived || searchTerm.trim().length > 0) return;
    if (loading || isLoadingMore || !hasMoreConversations || channels.length === 0) return;

    const minimumVisibleConversations = MIN_VISIBLE_CONVERSATIONS_BY_FILTER[filterStatus];
    if (filteredConversations.length >= minimumVisibleConversations) return;

    const attempts = autoLoadAttemptsRef.current.get(autoLoadContextKey) ?? 0;
    if (attempts >= AUTO_LOAD_PAGES_PER_CONTEXT) return;

    autoLoadAttemptsRef.current.set(autoLoadContextKey, attempts + 1);
    loadMoreConversations();
  }, [
    autoLoadContextKey,
    channels.length,
    filteredConversations.length,
    filterStatus,
    hasMoreConversations,
    isLoadingMore,
    loadMoreConversations,
    loading,
    searchTerm,
    showArchived,
  ]);

  // ─── Predictive prefetch ───────────────────────────────────────────────────
  // Pré-carrega o histórico das conversas vizinhas (acima/abaixo) à selecionada
  // no banco externo, populando o cache do React Query antes do clique. Quando
  // o usuário troca de cliente, a renderização é instantânea (cache hit) sem
  // round-trip de rede. Roda em requestIdleCallback para não competir com o UI.
  const channelPhoneByIdRef = useRef<Map<string, string | null>>(new Map());
  useEffect(() => {
    const map = new Map<string, string | null>();
    for (const ch of channels) map.set(ch.id, ch.phone ?? null);
    channelPhoneByIdRef.current = map;
  }, [channels]);
  const resolveChannelPhoneForPrefetch = useCallback(
    (channelId: string | null) =>
      channelId ? channelPhoneByIdRef.current.get(channelId) ?? null : null,
    []
  );
  usePrefetchAdjacentConversations(
    filteredConversations,
    selectedConversation ? getConversationKey(selectedConversation) : null,
    effectiveOrganizationId,
    resolveChannelPhoneForPrefetch,
    getConversationKey,
    // Tetos de segurança — o budget adaptativo (CPU/RAM/rede) decide os
    // valores reais e nunca passa destes limites.
    { maxRadius: 5, maxConcurrency: 3 }
  );

  // Aba "Não Lidos" — sem limite de visualização: carrega TODAS as não lidas
  // (incluindo de dias/semanas atrás) ao entrar na aba e periodicamente.
  useEffect(() => {
    if (filterStatus !== "unread" || showArchived) return;
    if (loading || channels.length === 0) return;
    // Carga inicial ao entrar na aba
    loadAllUnreadConversations(true);
    // Recarga periódica para capturar novas não lidas que possam surgir
    const interval = setInterval(() => {
      loadAllUnreadConversations(false);
    }, 20_000);
    return () => clearInterval(interval);
  }, [filterStatus, showArchived, loading, channels.length, loadAllUnreadConversations]);

  // 24-hour window — always based on the latest real external message timestamp.
  const toLocalDate = (timestamp: string | null) => {
    if (!timestamp) return null;
    const utcDate = new Date(timestamp);
    if (Number.isNaN(utcDate.getTime())) return null;

    return new Date(
      utcDate.toLocaleString("en-US", {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    );
  };

  const is24HourWindowExpired = (baseTime: string | null) => {
    const localBase = toLocalDate(baseTime);
    if (!localBase) return true;
    const now = new Date();
    const hoursDiff = (now.getTime() - localBase.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 24;
  };

  const getWindowTimeRemaining = (baseTime: string | null) => {
    const localBase = toLocalDate(baseTime);
    if (!localBase) return null;
    const expireTime = new Date(localBase.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const remainingMs = expireTime.getTime() - now.getTime();
    if (remainingMs <= 0) return null;
    
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}min`;
  };

  // IMPORTANT: A janela de 24h da Meta SÓ reabre com mensagem INBOUND do cliente.
  // Nunca usar lastMessageTime (pode ser saída nossa) como base — isso mantinha a janela
  // falsamente aberta e o atendente mandava texto livre que a Meta bloqueava (#131047).
  const windowBaseTime = messageWindowBaseTime || selectedConversation?.lastInboundTime || null;
  const isWindowExpired = selectedConversation ? is24HourWindowExpired(windowBaseTime) : false;
  const windowTimeRemaining = selectedConversation ? getWindowTimeRemaining(windowBaseTime) : null;
  const isMyConversation = !selectedConversation?.assignedTo || selectedConversation?.assignedTo === user?.id || isAdmin || isSupervisor || isSuperAdmin;

  // Handle paste event for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!selectedConversation || isWindowExpired || !isMyConversation) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const preview = URL.createObjectURL(file);
          setPastedImage({ file, preview });
        }
        return;
      }
    }
  }, [selectedConversation, isWindowExpired, isMyConversation]);

  // Send pasted image
  const handleSendPastedImage = async () => {
    if (!pastedImage || !selectedConversation) return;

    setUploadingMedia(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const fileExt = pastedImage.file.type.split('/')[1] || 'png';
      const pastedName = `imagem_colada.${fileExt}`;

      const { data: signed, error: signErr } = await supabase.functions.invoke(
        'external-storage-sign-upload',
        { body: { fileName: pastedName } },
      );
      if (signErr || !signed?.signedUrl) {
        toast.error('Erro ao preparar upload');
        setUploadingMedia(false);
        return;
      }

      const putResp = await fetch(signed.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': pastedImage.file.type || 'image/png', 'x-upsert': 'false' },
        body: pastedImage.file,
      });
      if (!putResp.ok) {
        toast.error('Erro ao fazer upload da imagem');
        setUploadingMedia(false);
        return;
      }

      await handleSendMedia({
        mediaType: 'image',
        mediaUrl: signed.publicUrl,
        fileName: pastedName
      });

      // Clean up
      URL.revokeObjectURL(pastedImage.preview);
      setPastedImage(null);

    } catch (error) {
      console.error('Paste image upload error:', error);
      toast.error('Erro ao enviar imagem');
    }

    setUploadingMedia(false);
  };

  // Cancel pasted image
  const handleCancelPastedImage = () => {
    if (pastedImage) {
      URL.revokeObjectURL(pastedImage.preview);
      setPastedImage(null);
    }
  };

  return (
    <TopNavLayout noPadding>
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        {/* Sidebar */}
        <div className={cn(
          "w-full bg-card border-r border-border flex flex-col min-h-0 min-w-0",
          selectedConversation ? "hidden lg:flex" : "flex flex-1 lg:flex-none"
        )}>
          {/* Notification banner */}
          {!notificationsEnabled && (
            <button 
              onClick={requestNotificationPermission}
              className="w-full px-4 py-2 bg-primary text-primary-foreground text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span>Ative as notificações na web</span>
            </button>
          )}

          {/* Tabs header */}
          <div className="p-3 border-b border-border space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => { setFilterStatus("new"); setShowArchived(false); }} 
                  className={cn(
                    "text-sm font-medium flex items-center gap-1.5 transition-colors",
                    filterStatus === "new" && !showArchived ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Novos
                  {newCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold min-w-5 text-center">
                      {newCount}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => { setFilterStatus("unread"); setShowArchived(false); }} 
                  className={cn(
                    "text-sm font-medium flex items-center gap-1.5 transition-colors",
                    filterStatus === "unread" && !showArchived ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Não Lidos
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold min-w-5 text-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => { setFilterStatus("mine"); setShowArchived(false); }} 
                  className={cn(
                    "text-sm font-medium transition-colors",
                    filterStatus === "mine" && !showArchived ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Meus
                </button>
                {canSeeOthers && (
                  <button 
                    onClick={() => { setFilterStatus("others"); setShowArchived(false); }} 
                    className={cn(
                      "text-sm font-medium transition-colors",
                      filterStatus === "others" && !showArchived ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Outros
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-popover">
                    <DropdownMenuItem onClick={() => setSoundEnabled(!soundEnabled)}>
                      {soundEnabled ? <Volume2 className="w-4 h-4 mr-2" /> : <VolumeX className="w-4 h-4 mr-2" />}
                      {soundEnabled ? "Desativar som" : "Ativar som"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowArchived(!showArchived)}>
                      <Archive className="w-4 h-4 mr-2" />
                      {showArchived ? "Ocultar arquivados" : "Ver arquivados"}
                    </DropdownMenuItem>
                    {canSeeOthers && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => {
                          setBulkSelectMode(!bulkSelectMode);
                          setBulkSelectedKeys(new Set());
                        }}>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          {bulkSelectMode ? "Sair da seleção em lote" : "Selecionar em lote"}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nome ou telefone (mín. 3 caracteres)" 
                className="pl-10 bg-muted/30 border-border h-9 text-sm w-full" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
              {isSearchingGlobal && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
              )}
            </div>
              
            {/* Filters for admins/supervisors */}
            {canSeeOthers && (
              <div className="flex flex-col gap-2">
                <AttendantFilter 
                  value={filterByAttendant} 
                  onChange={setFilterByAttendant}
                  selectedSectorId={filterBySector}
                />
                <SectorFilter 
                  value={filterBySector} 
                  onChange={setFilterBySector}
                />
              </div>
            )}

            {/* Wait time sort — available for all roles on the "Unread" tab.
                Atendentes only see their own conversations (default visibility rules). */}
            {filterStatus === "unread" && !showArchived && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-between bg-muted/30 border-border font-normal",
                      unreadWaitSort && "border-primary text-primary"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {unreadWaitSort === "desc"
                        ? "Maior tempo de espera"
                        : unreadWaitSort === "asc"
                          ? "Menor tempo de espera"
                          : "Tempo"}
                    </span>
                    <ChevronDown className="w-4 h-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] bg-popover">
                  <DropdownMenuItem onClick={() => setUnreadWaitSort("desc")}>
                    <Clock className="w-4 h-4 mr-2" />
                    Maior tempo de espera
                    {unreadWaitSort === "desc" && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setUnreadWaitSort("asc")}>
                    <Clock className="w-4 h-4 mr-2" />
                    Menor tempo de espera
                    {unreadWaitSort === "asc" && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </DropdownMenuItem>
                  {unreadWaitSort && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setUnreadWaitSort(null)}>
                        <X className="w-4 h-4 mr-2" />
                        Limpar ordenação
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Archived section (collapsible panel - full list when showing) */}
          {showArchived && (
            <div className="flex-1 flex flex-col min-h-0 bg-muted/20">
              <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  Conversas Arquivadas ({archivedConversations.length})
                </span>
                <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setShowArchived(false)}>
                  <X className="w-4 h-4" />
                  Fechar
                </Button>
              </div>
              
              {archivedConversations.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center text-muted-foreground">
                    <Archive className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma conversa arquivada</p>
                  </div>
                </div>
              ) : (
                <ScrollArea className="flex-1">
                  <div className="divide-y divide-border">
                    {filteredArchived.map((conv) => {
                      const convKey = getConversationKey(conv);
                      const sectorInfo = sectors.find(s => s.id === conv.sectorId);
                      const isSelected = selectedConversation && getConversationKey(selectedConversation) === convKey;
                      
                      return (
                        <div 
                          key={convKey} 
                          className={cn(
                            "group relative p-3 hover:bg-muted/50 transition-all cursor-pointer",
                            isSelected && "bg-primary/5",
                            recentlyUpdatedConversations.has(convKey) && !isSelected && "animate-pulse bg-primary/10 border-l-4 border-primary"
                          )}
                          onClick={() => {
                            setSelectedConversation(conv);
                            setSelectedConversationStableKey(getConversationKey(conv));
                          }}
                        >
                          <div className="flex items-start gap-3">
                            {/* Avatar with status */}
                            <div className="relative shrink-0">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
                                  {conv.name ? conv.name.split(" ").map(n => n[0]).join("").slice(0, 2) : <User className="w-4 h-4" />}
                                </AvatarFallback>
                              </Avatar>
                              <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 bg-muted-foreground rounded-full flex items-center justify-center">
                                <Archive className="w-2.5 h-2.5 text-white" />
                              </div>
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <span className="font-medium text-foreground text-sm truncate flex-1 min-w-0">
                                  {conv.name || conv.phone}
                                </span>
                                {sectorInfo && (
                                  <Badge variant="outline" className="text-[10px] h-5 px-2 bg-muted text-muted-foreground border-0 shrink-0 max-w-[90px] truncate">
                                    {sectorInfo.name}
                                  </Badge>
                                )}
                              </div>
                              
                              {/* Tags */}
                              {conv.tags && conv.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-0.5">
                                  {conv.tags.slice(0, 2).map((tagName, idx) => {
                                    const tagColor = tagColors.get(tagName) || '#6366f1';
                                    return (
                                      <Badge 
                                        key={idx}
                                        variant="outline" 
                                        className="text-[9px] h-4 px-1.5 border-0"
                                        style={{
                                          backgroundColor: tagColor + "30",
                                          color: tagColor
                                        }}
                                      >
                                        {tagName}
                                      </Badge>
                                    );
                                  })}
                                  {conv.tags.length > 2 && (
                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-muted text-muted-foreground border-0">
                                      +{conv.tags.length - 2}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              
                              {/* Awaiting response indicator for campaign dispatches */}
                              {conv.status === 'archived' && !conv.lastInboundTime && (
                                <div className="flex items-center gap-1 mb-0.5">
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  <span className="text-[10px] text-amber-600 font-medium">
                                    Aguardando resposta
                                  </span>
                                </div>
                              )}
                              
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                                  {conv.lastMessage || "Sem histórico"}
                                </p>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatConversationDate(conv.lastMessageTime)}
                                </span>
                              </div>
                            </div>
                            
                            {/* Restore button */}
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="h-7 px-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestore(conv);
                              }}
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span className="hidden sm:inline text-xs">Restaurar</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {!showArchived && (
            <div ref={conversationListContainerRef} className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {/* Bulk selection bar */}
              {bulkSelectMode && (
                <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={bulkSelectedKeys.size > 0 && bulkSelectedKeys.size === filteredConversations.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const allKeys = new Set(filteredConversations.map(c => getConversationKey(c)));
                          setBulkSelectedKeys(allKeys);
                        } else {
                          setBulkSelectedKeys(new Set());
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {bulkSelectedKeys.size > 0 
                        ? `${bulkSelectedKeys.size} selecionada${bulkSelectedKeys.size > 1 ? "s" : ""}`
                        : "Selecionar todos"
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={bulkSelectedKeys.size === 0}
                      onClick={() => setShowBulkTransferDialog(true)}
                    >
                      <Users className="w-3 h-3" />
                      Transferir ({bulkSelectedKeys.size})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setBulkSelectMode(false);
                        setBulkSelectedKeys(new Set());
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="p-4 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma conversa encontrada</p>
                </div>
              ) : (
                <VirtualizedConversationList
                  conversations={filteredConversations}
                  selectedConversationKey={selectedConversation ? getConversationKey(selectedConversation) : null}
                  recentlyUpdatedConversations={recentlyUpdatedConversations}
                  sectors={sectors}
                  tagColors={tagColors}
                  onSelect={handleSelectConversation}
                  onLoadMore={!searchTerm ? loadMoreConversations : undefined}
                  hasMore={!searchTerm && hasMoreConversations}
                  formatDate={formatConversationDate}
                  getConversationKey={getConversationKey}
                  height={conversationListHeight - (bulkSelectMode ? 44 : 0)}
                  bulkMode={bulkSelectMode}
                  bulkSelectedKeys={bulkSelectedKeys}
                  unreadMode={filterStatus === "unread" && !showArchived}
                  onBulkToggle={(conv: any) => {
                    const key = getConversationKey(conv as Conversation);
                    setBulkSelectedKeys(prev => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}
                />
              )}
            </div>
          )}

          {/* Manual send footer */}
          <div className="border-t border-border p-3 shrink-0">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 px-3 gap-1 shrink-0">
                    +55
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-popover">
                  <DropdownMenuItem>+55 (Brasil)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Input 
                placeholder="(00) 0000-0000" 
                className="flex-1 h-9 text-sm" 
                value={manualPhoneInput} 
                onChange={(e) => setManualPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 11))} 
              />
              <Button 
                onClick={() => setShowManualSendDialog(true)} 
                variant="outline"
                className="h-9 px-4 shrink-0" 
                disabled={!manualPhoneInput.trim()}
              >
                Conversar
              </Button>
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className={cn("flex-1 min-h-0 min-w-0 bg-card flex flex-col overflow-hidden", !selectedConversation ? "hidden lg:flex" : "flex")}>
          {selectedConversation ? (
            <>
              {/* Chat header */}
              <div className="p-3 border-b border-border shrink-0">
                {selectedConversationChannel && (
                  <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="text-xs font-medium text-primary truncate">{selectedConversationChannel.name}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">({selectedConversationChannel.phone})</span>
                    {channelBotConfig?.is_enabled && (
                      <Badge variant="secondary" className="ml-auto text-[10px] h-5 gap-1">
                        {channelBotConfig.bot_type === 'flow' ? (
                          <><GitBranch className="w-3 h-3" /> Fluxo</>
                        ) : channelBotConfig.bot_type === 'ai' ? (
                          <><Bot className="w-3 h-3" /> IA Bot</>
                        ) : (
                          <><Bot className="w-3 h-3" /> Bot</>
                        )}
                      </Badge>
                    )}
                  </div>
                )}
                
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 shrink-0" onClick={() => {
                      setSelectedConversation(null);
                      setSelectedConversationStableKey(null);
                    }}>
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <button onClick={() => setShowLeadDetailsDialog(true)} className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer flex-1 min-w-0">
                      <Avatar className="w-10 h-10 shrink-0">
                        <AvatarFallback className="bg-pink-100 text-pink-600 font-semibold text-sm">
                          {selectedConversation.name ? selectedConversation.name.split(" ").map(n => n[0]).join("").slice(0, 2) : <User className="w-4 h-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <h3 className="font-semibold text-foreground truncate">{selectedConversation.name || selectedConversation.phone}</h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <Phone className="w-3 h-3 shrink-0" /><span className="truncate">{selectedConversation.phone}</span>
                        </p>
                        {contactTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1 hidden sm:flex">
                            {contactTags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px] h-4 px-1.5 bg-muted/50">{tag}</Badge>
                            ))}
                            {contactTags.length > 2 && <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-muted/50">+{contactTags.length - 2}</Badge>}
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ChannelHistoryDialog
                      contactPhone={selectedConversation?.phone || ""}
                      currentChannelId={selectedConversation?.channelId || null}
                      organizationId={effectiveOrganizationId || null}
                      trigger={
                        <Button variant="outline" size="sm" className="gap-1 h-8 px-2" title="Histórico em outros números">
                          <History className="w-3 h-3" /><span className="hidden sm:inline">Histórico</span>
                        </Button>
                      }
                    />
                    <Button variant={showSalesAssistant ? "default" : "outline"} size="sm" onClick={() => setShowSalesAssistant(!showSalesAssistant)} className="gap-1 h-8 px-2" title="Assistente de vendas IA">
                      <Sparkles className="w-3 h-3" /><span className="hidden sm:inline">Assistente</span>
                    </Button>
                    {(isSuperAdmin || isAdmin || isSupervisor || selectedConversation?.assignedTo === user?.id) && (
                      <Button variant="outline" size="sm" onClick={() => setShowAssignAttendantDialog(true)} className="gap-1 h-8 px-2" title="Transferir atendimento">
                        <UserCheck className="w-3 h-3" /><span className="hidden sm:inline">Transferir</span>
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 bg-popover">
                        <DropdownMenuItem onClick={() => setShowQuickResponses(true)}><Zap className="w-4 h-4 mr-2" />Respostas rápidas</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowPortfolioDialog(true)}><Briefcase className="w-4 h-4 mr-2" />Adicionar à carteira</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowTagsDialog(true)}><Tag className="w-4 h-4 mr-2" />Gerenciar tags</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowPipelineStageDialog(true)}><GitBranch className="w-4 h-4 mr-2" />Mover no pipeline</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowFollowUpDialog(true)}><CalendarClock className="w-4 h-4 mr-2" />Iniciar follow-up</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowAssignAttendantDialog(true)}><UserCheck className="w-4 h-4 mr-2" />Atribuir atendente</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportConversation(selectedConversation)}><Download className="w-4 h-4 mr-2" />Exportar conversa</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleAddToBlacklist(selectedConversation)} className="text-destructive">
                          <Ban className="w-4 h-4 mr-2" />Bloquear contato
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleArchive(selectedConversation)} className="text-destructive">
                          <Archive className="w-4 h-4 mr-2" />Arquivar conversa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              {/* Messages — Infinite scroll with memoized bubbles */}
              <InfiniteMessageList
                key={selectedConversationCacheKey}
                conversationKey={selectedConversationCacheKey}
                messages={messages}
                isLoading={infiniteMessages.isLoading}
                isFetchingNextPage={infiniteMessages.isFetchingNextPage}
                hasNextPage={infiniteMessages.hasNextPage ?? false}
                fetchNextPage={infiniteMessages.fetchNextPage}
                onMediaPreview={(url, type, fileName) => setMediaPreview({
                  isOpen: true,
                  url,
                  type: type as "image" | "video" | "document" | "file" | "sticker",
                  fileName,
                })}
                templates={templates}
                onRetry={handleRetryFailedMessage}
                retryingMessageId={retryingMessageId}
              />

              {/* Message input */}
              <div className="p-3 border-t border-border space-y-2 shrink-0">
                {isWindowExpired ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30 text-warning">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p className="text-xs">Janela de 24h expirada. Use um <button onClick={() => setShowTemplateSelector(true)} className="font-semibold underline hover:no-underline">template aprovado</button>.</p>
                  </div>
                ) : windowTimeRemaining && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" /><span>Expira em {windowTimeRemaining}</span>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10"><Plus className="w-5 h-5 text-muted-foreground" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 bg-popover">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Enviar mídia</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => imageInputRef.current?.click()} disabled={isWindowExpired || uploadingMedia}><Image className="w-4 h-4 mr-2 text-emerald-500" />Imagem</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => videoInputRef.current?.click()} disabled={isWindowExpired || uploadingMedia}><Video className="w-4 h-4 mr-2 text-blue-500" />Vídeo</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => audioInputRef.current?.click()} disabled={isWindowExpired || uploadingMedia}><Music className="w-4 h-4 mr-2 text-purple-500" />Áudio</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => documentInputRef.current?.click()} disabled={isWindowExpired || uploadingMedia}><File className="w-4 h-4 mr-2 text-orange-500" />Documento</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Mensagens</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setShowTemplateSelector(true)}><FileText className="w-4 h-4 mr-2 text-primary" />Modelo de mensagem</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowScheduleDialog(true)} disabled={isWindowExpired}><CalendarClock className="w-4 h-4 mr-2 text-warning" />Agendar mensagem</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Conversa</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setShowNotesDialog(true)}><StickyNote className="w-4 h-4 mr-2 text-yellow-500" />Adicionar nota</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  {isRecording ? (
                    <div className="flex items-center gap-3 flex-1 bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-2 border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shrink-0" />
                        <span className="text-red-600 dark:text-red-400 font-medium text-sm">{formatRecordingDuration(recordingDuration)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={handleCancelVoiceRecording} className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-100"><X className="w-5 h-5" /></Button>
                        <Button onClick={handleSendVoiceRecording} disabled={uploadingMedia || isConvertingAudio} className="h-9 px-4 bg-green-600 hover:bg-green-700">
                          {(uploadingMedia || isConvertingAudio) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </Button>
                      </div>
                    </div>
                  ) : isConvertingAudio ? (
                    <div className="flex items-center gap-3 flex-1 bg-primary/10 rounded-lg px-4 py-2 border border-primary/30">
                      <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                      <span className="text-primary font-medium text-sm">Convertendo áudio...</span>
                    </div>
                  ) : pastedImage ? (
                    <div className="flex items-center gap-3 flex-1 bg-muted/30 rounded-lg p-2 border border-border">
                      <div className="relative shrink-0">
                        <img 
                          src={pastedImage.preview} 
                          alt="Imagem colada" 
                          className="w-16 h-16 object-cover rounded-md border border-border"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                          onClick={handleCancelPastedImage}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">Imagem pronta para enviar</p>
                        <p className="text-xs text-muted-foreground">Clique para enviar ou X para cancelar</p>
                      </div>
                      <Button 
                        onClick={handleSendPastedImage} 
                        disabled={uploadingMedia}
                        className="h-11 px-4 shrink-0"
                      >
                        {uploadingMedia ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      </Button>
                    </div>
                  ) : (
                    <MessageComposer
                      ref={composerRef}
                      conversationKey={selectedConversationStableKey}
                      isWindowExpired={isWindowExpired}
                      isMyConversation={isMyConversation}
                      isSendingMessage={isSendingMessage}
                      uploadingMedia={uploadingMedia}
                      onSend={(text) => handleSendMessage(text)}
                      onStartVoiceRecording={handleStartVoiceRecording}
                      onOpenTemplateSelector={() => setShowTemplateSelector(true)}
                      onPaste={handlePaste}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/10">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="w-20 h-20 mx-auto mb-4 opacity-20 stroke-1" />
                <p className="text-base text-muted-foreground/70">Escolha um atendimento para iniciar a conversa</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <QuickResponsesPanel isOpen={showQuickResponses} onClose={() => setShowQuickResponses(false)} onSelectResponse={(content) => setNewMessage(content)} />

      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => handleFileSelect(e, "image")} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/3gpp,video/quicktime" className="hidden" onChange={(e) => handleFileSelect(e, "video")} />
      <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/aac" className="hidden" onChange={(e) => handleFileSelect(e, "audio")} />
      <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" className="hidden" onChange={(e) => handleFileSelect(e, "document")} />

      <TemplateSelector isOpen={showTemplateSelector} onClose={() => setShowTemplateSelector(false)} onSend={handleSendTemplate} channelId={selectedConversation?.channelId || null} />

      <SalesAssistant isOpen={showSalesAssistant} onClose={() => setShowSalesAssistant(false)} customerName={selectedConversation?.name || selectedConversation?.phone} conversationContext={messages.map(m => `${m.direction === 'inbound' ? (m.sender_name || 'Cliente') : 'Atendente'}: ${m.content || '[mídia]'}`).join('\n')} />

      {selectedConversation && <AddToPortfolioDialog open={showPortfolioDialog} onOpenChange={setShowPortfolioDialog} contactPhone={selectedConversation.phone} contactName={selectedConversation.name} />}

      {selectedConversation && (
        <AssignTagsFromChatDialog
          open={showTagsDialog}
          onOpenChange={setShowTagsDialog}
          contactPhone={selectedConversation.phone}
          contactName={selectedConversation.name}
          onSuccess={() => {
            const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');
            supabase.from("leads").select("tags").eq("phone", normalizedPhone).single().then(({ data }) => {
              if (data?.tags) setContactTags(data.tags);
            });
          }}
        />
      )}

      <ManualSendDialog isOpen={showManualSendDialog} onClose={() => { setShowManualSendDialog(false); setManualPhoneInput(""); }} channels={channels} selectedChannel={selectedChannel} onChannelChange={setSelectedChannel} initialPhone={manualPhoneInput} onPhoneUsed={() => setManualPhoneInput("")} onTemplateSent={handleManualTemplateSent} />

      {selectedConversation && <FollowUpDialog isOpen={showFollowUpDialog} onClose={() => setShowFollowUpDialog(false)} leadId={null} leadName={selectedConversation?.name || selectedConversation?.phone || ""} leadPhone={selectedConversation?.phone || ""} channelId={selectedConversation?.channelId || null} />}

      {selectedConversation && <ChangePipelineStageDialog isOpen={showPipelineStageDialog} onClose={() => setShowPipelineStageDialog(false)} leadId={null} leadName={selectedConversation?.name || selectedConversation?.phone || ""} currentStageId={null} />}

      {selectedConversation && <ScheduleMessageDialog isOpen={showScheduleDialog} onClose={() => setShowScheduleDialog(false)} contactPhone={selectedConversation.phone} contactName={selectedConversation?.name} channelId={selectedConversation?.channelId || null} leadId={null} />}

      {selectedConversation && <ConversationNotesDialog isOpen={showNotesDialog} onClose={() => setShowNotesDialog(false)} contactPhone={selectedConversation.phone} contactName={selectedConversation?.name} channelId={selectedConversation?.channelId} onNoteAdded={fetchNotesAndSideEffects} />}

      {selectedConversation && <LeadDetailsDialog open={showLeadDetailsDialog} onOpenChange={setShowLeadDetailsDialog} phone={selectedConversation.phone} name={selectedConversation.name} />}

      {selectedConversation && (
        <AssignAttendantDialog
          open={showAssignAttendantDialog}
          onOpenChange={setShowAssignAttendantDialog}
          conversationPhone={selectedConversation.phone}
          channelId={selectedConversation.channelId}
          currentAssignedTo={selectedConversation.assignedTo}
          currentAssignedToName={selectedConversation.assignedToName}
          conversationSectorId={selectedConversation.sectorId}
          onAssigned={(assignedTo, assignedToName) => {
            setSelectedConversation(prev => prev ? { ...prev, assignedTo, assignedToName } : null);
            setAllConversations(prev => prev.map(c => 
              c.channelId === selectedConversation.channelId && c.phone.replace(/\D/g, '') === selectedConversation.phone.replace(/\D/g, '')
                ? { ...c, assignedTo, assignedToName } : c
            ));
          }}
        />
      )}

      <SaleConfirmationDialog
        open={showSaleConfirmationDialog}
        onOpenChange={(open) => { setShowSaleConfirmationDialog(open); if (!open) setConversationToArchive(null); }}
        contactPhone={conversationToArchive?.phone || ""}
        contactName={conversationToArchive?.name || null}
        onConfirm={handleConfirmArchive}
      />

      <MediaPreviewDialog isOpen={mediaPreview.isOpen} onClose={() => setMediaPreview(prev => ({ ...prev, isOpen: false }))} mediaUrl={mediaPreview.url} mediaType={mediaPreview.type} fileName={mediaPreview.fileName} />

      <BulkTransferDialog
        open={showBulkTransferDialog}
        onOpenChange={setShowBulkTransferDialog}
        selectedConversations={
          filteredConversations
            .filter(c => bulkSelectedKeys.has(getConversationKey(c)))
            .map(c => ({
              id: c.id,
              phone: c.phone,
              channelId: c.channelId,
              assignedTo: c.assignedTo,
              sectorId: c.sectorId,
            }))
        }
        onTransferred={() => {
          setBulkSelectMode(false);
          setBulkSelectedKeys(new Set());
          setConversationRefetchTrigger(prev => prev + 1);
        }}
      />
    </TopNavLayout>
  );
};

export default AtendimentoV2;
