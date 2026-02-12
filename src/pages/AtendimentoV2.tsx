import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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
  History
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
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserSectors } from "@/hooks/useUserSectors";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatErrorDisplay } from "@/lib/metaErrorMessages";

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

// Helper function to normalize phone numbers consistently
const normalizePhoneNumber = (phone: string): string => {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.length <= 11 && !normalized.startsWith('55')) {
    normalized = '55' + normalized;
  }
  return normalized;
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

type FilterStatus = "new" | "mine" | "others";

// Audio notification using Web Audio API
const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const playNotificationSound = useCallback(() => {
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const { canSeeSector, canInteractWithSector, sectorIds, loading: sectorsLoading } = useUserSectors();
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  
  // Ref to track locally created conversations to prevent realtime duplicates
  const locallyCreatedConversationsRef = useRef<Set<string>>(new Set());
  const [phoneToOpen, setPhoneToOpen] = useState<string | null>(searchParams.get("phone"));
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationNotes, setConversationNotes] = useState<ConversationNote[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  
  // CRITICAL: Build a set of valid channel IDs for safety filtering
  const validChannelIds = useMemo(() => new Set(channels.map(c => c.id)), [channels]);
  
  // Filter conversations based on user's sector access AND valid channel ownership
  // This is the FINAL defense against cross-org data leaks
  const conversations = allConversations.filter(c => 
    canSeeSector(c.sectorId) && 
    (c.channelId ? validChannelIds.has(c.channelId) : true)
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
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<Conversation[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("new");
  const [showArchived, setShowArchived] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterByAttendant, setFilterByAttendant] = useState<string | null>(null);
  const [filterBySector, setFilterBySector] = useState<string | null>(null);
  
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  
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

  // Fetch channels
  useEffect(() => {
    const fetchChannels = async () => {
      console.log("[AtendimentoV2] fetchChannels called", { 
        effectiveOrganizationId, 
        userId: user?.id,
        email: user?.email 
      });
      
      if (!effectiveOrganizationId) {
        console.log("[AtendimentoV2] No effectiveOrganizationId, skipping fetch");
        return;
      }
      
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, phone, provider")
        .eq("organization_id", effectiveOrganizationId)
        .in("provider", ["meta", "zapi"])
        .eq("connected", true);

      console.log("[AtendimentoV2] Channels fetched", { 
        count: data?.length, 
        error: error?.message,
        channels: data 
      });

      if (!error && data) {
        setChannels(data);
        if (data.length > 0) {
          setSelectedChannel(data[0]);
        }
      }
    };

    if (user && effectiveOrganizationId) {
      // CRITICAL: Clear conversations and channels IMMEDIATELY when org changes
      // This prevents stale data from previous org being visible during transition
      setChannels([]);
      setAllConversations([]);
      setSelectedConversation(null);
      fetchChannels();
    } else {
      console.log("[AtendimentoV2] Waiting for user or org", { 
        hasUser: !!user, 
        effectiveOrganizationId 
      });
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

  // Fetch conversations using conversation_assignments as PRIMARY source
  // This ensures ALL conversations are visible, not just the last 5000 messages
  useEffect(() => {
    const fetchConversations = async () => {
      if (channels.length === 0) return;

      setLoading(true);
      const channelIds = channels.map(c => c.id);

      // CRITICAL FIX: Use conversation_assignments as PRIMARY source
      // This prevents conversations from "disappearing" due to message limits
      // CRITICAL: Fetch ALL leads using pagination to support high-scale orgs (10k+ leads)
      const fetchAllLeads = async () => {
        const allLeads: Array<{ id: string; phone: string; name: string | null; tags: string[] | null }> = [];
        const PAGE_SIZE = 1000;
        let from = 0;
        let hasMore = true;
        
        while (hasMore) {
          const { data, error } = await supabase
            .from("leads")
            .select("id, phone, name, tags")
            .eq("organization_id", effectiveOrganizationId)
            .range(from, from + PAGE_SIZE - 1);
          
          if (error || !data || data.length === 0) {
            hasMore = false;
          } else {
            allLeads.push(...data);
            from += PAGE_SIZE;
            hasMore = data.length === PAGE_SIZE;
          }
        }
        
        console.log(`[AtendimentoV2] Fetched ${allLeads.length} leads total (paginated)`);
        return { data: allLeads, error: null };
      };

      // UNLIMITED: Paginated fetch for assignments
      const fetchAllAssignments = async () => {
        const all: Array<{ id: string; conversation_phone: string; channel_id: string | null; assigned_to: string | null; status: string | null; sector_id: string | null; lead_id: string | null; updated_at: string }> = [];
        const PAGE_SIZE = 1000;
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("conversation_assignments")
            .select("id, conversation_phone, channel_id, assigned_to, status, sector_id, lead_id, updated_at")
            .in("channel_id", channelIds)
            .neq("status", "archived")
            .order("updated_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);
          if (error || !data || data.length === 0) { hasMore = false; } 
          else { all.push(...data); from += PAGE_SIZE; hasMore = data.length === PAGE_SIZE; }
        }
        console.log(`[AtendimentoV2] Fetched ${all.length} assignments total (paginated)`);
        return { data: all, error: null };
      };

      // UNLIMITED: Paginated fetch for profiles
      const fetchAllProfiles = async () => {
        const all: Array<{ user_id: string; display_name: string | null; email: string | null }> = [];
        const PAGE_SIZE = 1000;
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("profiles")
            .select("user_id, display_name, email")
            .range(from, from + PAGE_SIZE - 1);
          if (error || !data || data.length === 0) { hasMore = false; }
          else { all.push(...data); from += PAGE_SIZE; hasMore = data.length === PAGE_SIZE; }
        }
        return { data: all, error: null };
      };

      const [assignmentsResult, profilesResult, leadsResult] = await Promise.all([
        fetchAllAssignments(),
        fetchAllProfiles(),
        fetchAllLeads()
      ]);

      if (assignmentsResult.error) {
        console.error("Error fetching assignments:", assignmentsResult.error);
        setLoading(false);
        return;
      }

      // Build leads map - prioritize system names and leads with tags over WhatsApp names
      const leadsMap = new Map<string, { id?: string; name: string; tags: string[] | null }>();
      const leadsBySuffix = new Map<string, { id?: string; name: string; tags: string[] | null }>();
      const leadsById = new Map<string, { name: string; tags: string[] | null; phone: string }>();
      
      leadsResult.data?.forEach((lead) => {
        const normalizedPhone = lead.phone.replace(/\D/g, '');
        const isAutoGenerated = lead.name?.startsWith('LeadWhats-') || lead.name?.startsWith('WhatsApp ');
        
        const phoneWithout55 = normalizedPhone.startsWith('55') ? normalizedPhone.slice(2) : normalizedPhone;
        const phoneWith55 = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
        const phoneSuffix8 = normalizedPhone.slice(-8);
        const phoneSuffix9 = normalizedPhone.slice(-9);
        
        const leadData = {
          id: lead.id,
          name: isAutoGenerated ? '' : (lead.name || ''),
          tags: lead.tags && lead.tags.length > 0 ? lead.tags : null
        };

        // Store by ID for direct lookup
        leadsById.set(lead.id, { ...leadData, phone: normalizedPhone });
        
        // CRITICAL: Always store leads in the map, not just those with names
        // This ensures we can find leads by phone regardless of name status
        const updateMap = (key: string) => {
          const existing = leadsMap.get(key);
          
          // If we have a real name (not auto-generated), always prefer it
          if (!isAutoGenerated && leadData.name) {
            const mergedTags = leadData.tags && leadData.tags.length > 0 ? leadData.tags : existing?.tags || null;
            leadsMap.set(key, { 
              id: lead.id,
              name: leadData.name, 
              tags: mergedTags
            });
          } else if (existing && existing.name && !existing.name.startsWith('LeadWhats-')) {
            // Keep existing real name, but update tags if we have more
            if (leadData.tags && leadData.tags.length > (existing.tags?.length || 0)) {
              leadsMap.set(key, { ...existing, tags: leadData.tags });
            }
          } else if (leadData.tags && leadData.tags.length > 0) {
            // No real name but we have tags - store it
            leadsMap.set(key, { 
              id: lead.id,
              name: existing?.name || '', 
              tags: leadData.tags 
            });
          } else if (!existing) {
            // Store even empty entries for completeness
            leadsMap.set(key, leadData);
          }
        };
        
        updateMap(normalizedPhone);
        updateMap(phoneWithout55);
        updateMap(phoneWith55);
        
        // Store by suffix - prioritize leads with real names
        const updateSuffixMap = (suffix: string) => {
          const existingSuffix = leadsBySuffix.get(suffix);
          const hasRealName = leadData.name && !isAutoGenerated;
          const existingHasRealName = existingSuffix?.name && !existingSuffix.name.startsWith('LeadWhats-');
          
          // Always prefer real names over auto-generated
          if (hasRealName && !existingHasRealName) {
            leadsBySuffix.set(suffix, { 
              id: lead.id,
              name: leadData.name, 
              tags: leadData.tags || existingSuffix?.tags || null 
            });
          } else if (!existingSuffix) {
            leadsBySuffix.set(suffix, leadData);
          } else if (!existingHasRealName && leadData.tags && leadData.tags.length > (existingSuffix.tags?.length || 0)) {
            // Update tags if we have more
            leadsBySuffix.set(suffix, { 
              ...existingSuffix, 
              tags: leadData.tags 
            });
          }
        };
        
        updateSuffixMap(phoneSuffix8);
        updateSuffixMap(phoneSuffix9);
      });
      
      leadsMapRef.current = { byPhone: leadsMap, bySuffix: leadsBySuffix };

      // Build profiles map
      const profilesMap = new Map<string, string>();
      profilesResult.data?.forEach((profile) => {
        profilesMap.set(profile.user_id, profile.display_name || profile.email || 'Atendente');
      });

      // Large batch for messages - background recovery handles any misses
      const lastMessagesPromises = channelIds.map(channelId => 
        supabase
          .from("whatsapp_messages")
          .select("channel_id, sender_phone, sender_name, content, created_at, direction, metadata, is_read")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: false })
          .limit(5000)
      );

      const lastMessagesResults = await Promise.all(lastMessagesPromises);
      
      // Build messages map by conversation key
      const lastMessagesByConv = new Map<string, {
        content: string;
        createdAt: string;
        lastInboundTime: string | null;
        unreadCount: number;
        senderName: string | null;
      }>();

      lastMessagesResults.forEach(result => {
        if (result.error || !result.data) return;
        
        result.data.forEach((msg) => {
          const msgData = msg as {
            channel_id: string;
            sender_phone: string;
            sender_name?: string | null;
            content: string | null;
            created_at: string;
            direction: string;
            metadata: Record<string, unknown> | null;
            is_read?: boolean;
          };
          let contactPhone: string;
          
          if (msgData.direction === "inbound") {
            contactPhone = msgData.sender_phone.replace(/\D/g, '');
          } else {
            const metadata = msgData.metadata as { destination?: string } | null;
            contactPhone = (metadata?.destination || '').replace(/\D/g, '');
            if (!contactPhone) return;
          }

          const key = `${msgData.channel_id}_${contactPhone}`;
          const existing = lastMessagesByConv.get(key);

          if (!existing) {
            lastMessagesByConv.set(key, {
              content: msgData.content || '',
              createdAt: msgData.created_at,
              lastInboundTime: msgData.direction === 'inbound' ? msgData.created_at : null,
              unreadCount: msgData.direction === 'inbound' && !msgData.is_read ? 1 : 0,
              senderName: msgData.direction === 'inbound' ? (msgData.sender_name || null) : null
            });
          } else {
            if (msgData.direction === 'inbound') {
              if (!existing.lastInboundTime || new Date(msgData.created_at) > new Date(existing.lastInboundTime)) {
                existing.lastInboundTime = msgData.created_at;
              }
              if (!msgData.is_read) {
                existing.unreadCount++;
              }
              if (msgData.sender_name && !existing.senderName) {
                existing.senderName = msgData.sender_name;
              }
            }
          }
        });
      });

      // Build statuses map from assignments
      const dbStatuses: Record<string, string> = {};
      assignmentsResult.data?.forEach((assignment) => {
        const normalizedPhone = assignment.conversation_phone.replace(/\D/g, '');
        const key = `${assignment.channel_id}_${normalizedPhone}`;
        if (assignment.status) {
          dbStatuses[key] = assignment.status;
        }
      });
      setConversationStatuses(dbStatuses as Record<string, Conversation["status"]>);

      // Build conversations from assignments (PRIMARY SOURCE)
      const conversationsFromAssignments: Conversation[] = (assignmentsResult.data || []).map(assignment => {
        const normalizedPhone = assignment.conversation_phone.replace(/\D/g, '');
        const conversationKey = `${assignment.channel_id}_${normalizedPhone}`;
        const displayPhone = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone;

        // Get lead info - first try by lead_id
        let leadInfo: { name: string; tags: string[] | null } | undefined;
        
        if (assignment.lead_id) {
          const leadById = leadsById.get(assignment.lead_id);
          if (leadById) {
            leadInfo = { name: leadById.name, tags: leadById.tags };
          }
        }

        // Fallback to phone matching - try multiple formats and suffix lengths
        if (!leadInfo || (!leadInfo.name && !leadInfo.tags)) {
          const phoneSuffix8 = normalizedPhone.slice(-8);
          const phoneSuffix9 = normalizedPhone.slice(-9);
          const phoneWithout55 = normalizedPhone.startsWith('55') ? normalizedPhone.slice(2) : normalizedPhone;
          const phoneWith55 = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
          
          // Try all possible phone formats for matching
          const matches = [
            leadsMap.get(normalizedPhone),
            leadsMap.get(phoneWithout55),
            leadsMap.get(phoneWith55),
            leadsBySuffix.get(phoneSuffix9), // 9-digit suffix (Brazilian mobile)
            leadsBySuffix.get(phoneSuffix8)  // 8-digit suffix (fallback)
          ].filter(Boolean);

          // Prioritize matches with real names (not auto-generated)
          const bestMatch = matches.find(m => m && m.name && !m.name.startsWith('LeadWhats-') && !m.name.startsWith('WhatsApp '));
          
          if (bestMatch) {
            leadInfo = { name: bestMatch.name, tags: bestMatch.tags };
          } else {
            // Fallback: merge info from multiple matches
            for (const match of matches) {
              if (!match) continue;
              if (!leadInfo) {
                leadInfo = { name: match.name, tags: match.tags };
              } else {
                if (!leadInfo.name && match.name) leadInfo.name = match.name;
                if ((!leadInfo.tags || leadInfo.tags.length === 0) && match.tags && match.tags.length > 0) {
                  leadInfo.tags = match.tags;
                }
              }
              if (leadInfo.name && leadInfo.tags && leadInfo.tags.length > 0) break;
            }
          }
        }

        // Get last message info
        const lastMsgInfo = lastMessagesByConv.get(conversationKey);

        // Map status from DB to frontend
        let mappedStatus: Conversation["status"] = "pending";
        if (assignment.status === "active" || assignment.status === "in_progress") mappedStatus = "in_progress";
        else if (assignment.status === "archived") mappedStatus = "archived";
        else if (assignment.status === "resolved") mappedStatus = "resolved";
        else if (assignment.status === "pending") mappedStatus = "pending";

        return {
          id: assignment.id, // Include assignment ID for unique identification
          phone: displayPhone,
          name: leadInfo?.name || lastMsgInfo?.senderName || null,
          lastMessage: lastMsgInfo?.content || "",
          lastMessageTime: lastMsgInfo?.createdAt || assignment.updated_at,
          lastInboundTime: lastMsgInfo?.lastInboundTime || null,
          unreadCount: lastMsgInfo?.unreadCount || 0,
          channelId: assignment.channel_id,
          status: mappedStatus,
          assignedTo: assignment.assigned_to,
          assignedToName: assignment.assigned_to ? profilesMap.get(assignment.assigned_to) || null : null,
          sectorId: assignment.sector_id,
          tags: leadInfo?.tags || null
        };
      });

      // Sort by last message time (most recent first)
      conversationsFromAssignments.sort((a, b) => 
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      );

      setAllConversations(conversationsFromAssignments);
      setLoading(false);

      // CRITICAL: For conversations without lastMessage (not covered by batch limit),
      // fetch their last message individually in background batches
      const emptyMessageConvs = conversationsFromAssignments.filter(c => !c.lastMessage && c.channelId);
      if (emptyMessageConvs.length > 0) {
        console.log(`[AtendimentoV2] Fetching last messages for ${emptyMessageConvs.length} conversations without preview`);
        
        const BATCH = 50;
        for (let i = 0; i < emptyMessageConvs.length; i += BATCH) {
          const batch = emptyMessageConvs.slice(i, i + BATCH);
          
          const results = await Promise.all(batch.map(async (conv) => {
            const phone = conv.phone.replace(/\D/g, '');
            const phoneWithPlus = `+${phone}`;
            
            // Fetch last inbound OR outbound message for this conversation
            const [inboundRes, outboundRes] = await Promise.all([
              supabase
                .from("whatsapp_messages")
                .select("content, created_at, direction, sender_name")
                .eq("channel_id", conv.channelId!)
                .eq("direction", "inbound")
                .or(`sender_phone.eq.${phone},sender_phone.eq.${phoneWithPlus}`)
                .order("created_at", { ascending: false })
                .limit(1),
              supabase
                .from("whatsapp_messages")
                .select("content, created_at, direction, metadata")
                .eq("channel_id", conv.channelId!)
                .eq("direction", "outbound")
                .or(`metadata->>destination.eq.${phone},metadata->>destination.eq.${phoneWithPlus}`)
                .order("created_at", { ascending: false })
                .limit(1)
            ]);
            
            const inMsg = inboundRes.data?.[0];
            const outMsg = outboundRes.data?.[0];
            
            // Pick the most recent message
            let lastMsg: { content: string | null; created_at: string; direction: string; senderName?: string | null } | null = null;
            if (inMsg && outMsg) {
              lastMsg = new Date(inMsg.created_at) > new Date(outMsg.created_at) 
                ? { ...inMsg, senderName: inMsg.sender_name } 
                : { ...outMsg };
            } else {
              lastMsg = inMsg ? { ...inMsg, senderName: inMsg.sender_name } : outMsg ? { ...outMsg } : null;
            }
            
            return { phone: conv.phone, channelId: conv.channelId, lastMsg };
          }));
          
          // Update conversations with fetched messages
          setAllConversations(prev => {
            let changed = false;
            const updated = prev.map(c => {
              const result = results.find(r => 
                r.phone === c.phone && r.channelId === c.channelId && r.lastMsg
              );
              if (result && result.lastMsg && !c.lastMessage) {
                changed = true;
                return {
                  ...c,
                  lastMessage: result.lastMsg.content || "",
                  lastMessageTime: result.lastMsg.created_at,
                  lastInboundTime: result.lastMsg.direction === 'inbound' ? result.lastMsg.created_at : c.lastInboundTime,
                  name: c.name || (result.lastMsg as { senderName?: string | null }).senderName || c.name,
                };
              }
              return c;
            });
            return changed ? updated : prev;
          });
        }
        
        console.log(`[AtendimentoV2] Finished fetching missing last messages`);
      }
    };

    fetchConversations();
  }, [channels, effectiveOrganizationId]);

  // CRITICAL FIX: Periodic sync to ensure assignedTo is always up-to-date
  // This prevents stale state where conversations show as unassigned when they're actually assigned in DB
  useEffect(() => {
    if (channels.length === 0) return;
    
    const syncAssignments = async () => {
      const channelIds = channels.map(c => c.id);
      
      // UNLIMITED: Paginated fetch for sync assignments
      const allSyncAssignments: Array<any> = [];
      let syncFrom = 0;
      let syncHasMore = true;
      while (syncHasMore) {
        const { data } = await supabase
          .from("conversation_assignments")
          .select("id, conversation_phone, channel_id, assigned_to, sector_id, status")
          .in("channel_id", channelIds)
          .neq("status", "archived")
          .range(syncFrom, syncFrom + 999);
        if (!data || data.length === 0) { syncHasMore = false; }
        else { allSyncAssignments.push(...data); syncFrom += 1000; syncHasMore = data.length === 1000; }
      }
      const assignments = allSyncAssignments;
      
      if (!assignments) return;
      
      // Build a map of phone -> assignment for quick lookup
      const assignmentMap = new Map<string, typeof assignments[0]>();
      assignments.forEach(a => {
        const normalizedPhone = a.conversation_phone.replace(/\D/g, '');
        const key = `${a.channel_id}_${normalizedPhone}`;
        assignmentMap.set(key, a);
      });
      
      // Update any conversations that have stale assignedTo values
      setAllConversations(prev => {
        let hasChanges = false;
        const updated = prev.map(conv => {
          const normalizedPhone = conv.phone.replace(/\D/g, '');
          const key = `${conv.channelId}_${normalizedPhone}`;
          const dbAssignment = assignmentMap.get(key);
          
          if (dbAssignment) {
            // Check if local state differs from DB
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
    
    // IMMEDIATE sync on mount - don't wait
    syncAssignments();
    
    // Second sync after 1 second (catch any race conditions)
    const secondTimer = setTimeout(syncAssignments, 1000);
    
    // Third sync after 3 seconds (catch any delayed updates)
    const thirdTimer = setTimeout(syncAssignments, 3000);
    
    // Periodic sync every 10 seconds (more frequent to ensure consistency)
    const intervalId = setInterval(syncAssignments, 10000);
    
    return () => {
      clearTimeout(secondTimer);
      clearTimeout(thirdTimer);
      clearInterval(intervalId);
    };
  }, [channels]);

  // Helper function to get conversation key
  const getConversationKey = (conv: Conversation) => {
    return `${conv.channelId || 'unknown'}_${conv.phone.replace(/\D/g, '')}`;
  };

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
      await supabase
        .from("conversation_assignments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .or(`conversation_phone.eq.${phone},conversation_phone.eq.+${phone}`);
    }
  };

  // Global search function - searches directly in the database
  // This allows finding ANY conversation, even old ones not in the initial load
  const searchConversationsGlobal = useCallback(async (term: string) => {
    if (!term.trim() || term.length < 3 || channels.length === 0 || !effectiveOrganizationId) {
      setGlobalSearchResults([]);
      setIsSearchingGlobal(false);
      return;
    }

    setIsSearchingGlobal(true);
    const channelIds = channels.map(c => c.id);
    const normalizedSearch = term.replace(/\D/g, '');
    
    try {
      // Search conversation_assignments by phone
      const { data: assignments } = await supabase
        .from("conversation_assignments")
        .select("id, conversation_phone, channel_id, assigned_to, status, sector_id, lead_id, updated_at")
        .in("channel_id", channelIds)
        .or(`conversation_phone.ilike.%${normalizedSearch}%,conversation_phone.ilike.%${term}%`)
        .order("updated_at", { ascending: false })
        .limit(30);

      // Also search leads by name
      const { data: leadsByName } = await supabase
        .from("leads")
        .select("id, phone, name, tags")
        .eq("organization_id", effectiveOrganizationId)
        .ilike("name", `%${term}%`)
        .limit(30);

      // Find assignments for leads found by name
      const leadPhones = (leadsByName || []).map(l => l.phone.replace(/\D/g, ''));
      
      let additionalAssignments: typeof assignments = [];
      if (leadPhones.length > 0) {
        const phoneConditions = leadPhones.slice(0, 10).map(p => `conversation_phone.ilike.%${p.slice(-8)}%`).join(',');
        const { data: byLeadPhone } = await supabase
          .from("conversation_assignments")
          .select("id, conversation_phone, channel_id, assigned_to, status, sector_id, lead_id, updated_at")
          .in("channel_id", channelIds)
          .or(phoneConditions)
          .order("updated_at", { ascending: false })
          .limit(30);
        
        additionalAssignments = byLeadPhone || [];
      }

      // Combine and deduplicate
      const allAssignments = [...(assignments || []), ...additionalAssignments];
      const uniqueAssignments = allAssignments.filter((a, idx, self) => 
        idx === self.findIndex(b => b.id === a.id)
      );

      // Get profiles for assigned users
      const assignedUserIds = [...new Set(uniqueAssignments.filter(a => a.assigned_to).map(a => a.assigned_to!))];
      const { data: profiles } = assignedUserIds.length > 0 
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, email")
            .in("user_id", assignedUserIds)
        : { data: [] };

      const profilesMap = new Map<string, string>();
      profiles?.forEach(p => profilesMap.set(p.user_id, p.display_name || p.email || 'Atendente'));

      // Build search results
      const results: Conversation[] = uniqueAssignments.map(assignment => {
        const normalizedPhone = assignment.conversation_phone.replace(/\D/g, '');
        const displayPhone = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone;

        // Find matching lead for name
        const matchingLead = (leadsByName || []).find(l => 
          l.phone.replace(/\D/g, '').slice(-8) === normalizedPhone.slice(-8)
        );

        let mappedStatus: Conversation["status"] = "pending";
        if (assignment.status === "active" || assignment.status === "in_progress") mappedStatus = "in_progress";
        else if (assignment.status === "archived") mappedStatus = "archived";
        else if (assignment.status === "resolved") mappedStatus = "resolved";

        return {
          phone: displayPhone,
          name: matchingLead?.name || null,
          lastMessage: "",
          lastMessageTime: assignment.updated_at,
          lastInboundTime: null,
          unreadCount: 0,
          channelId: assignment.channel_id,
          status: mappedStatus,
          assignedTo: assignment.assigned_to,
          assignedToName: assignment.assigned_to ? profilesMap.get(assignment.assigned_to) || null : null,
          sectorId: assignment.sector_id,
          tags: matchingLead?.tags || null
        };
      });

      setGlobalSearchResults(results);
      setIsSearchingGlobal(false);

    } catch (error) {
      console.error("Error searching conversations:", error);
      setGlobalSearchResults([]);
      setIsSearchingGlobal(false);
    }
  }, [channels, effectiveOrganizationId]);

  // Debounced global search effect
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 3) {
      setGlobalSearchResults([]);
      return;
    }

    const debounceTimer = setTimeout(() => {
      searchConversationsGlobal(searchTerm);
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [searchTerm, searchConversationsGlobal]);

  // Fetch messages and notes for selected conversation
  const fetchMessagesAndNotes = async () => {
    if (!selectedConversation) {
      setConversationNotes([]);
      return;
    }

    const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');
    const conversationChannelId = selectedConversation.channelId;
    if (!conversationChannelId) return;

    const phoneWithPlus = `+${normalizedPhone}`;
    
    const [inboundResult, outboundResult, notesResult] = await Promise.all([
      supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("channel_id", conversationChannelId)
        .eq("direction", "inbound")
        .or(`sender_phone.eq.${normalizedPhone},sender_phone.eq.${phoneWithPlus}`)
        .order("created_at", { ascending: true }),
      supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("channel_id", conversationChannelId)
        .eq("direction", "outbound")
        .or(`metadata->>destination.eq.${normalizedPhone},metadata->>destination.eq.${phoneWithPlus}`)
        .order("created_at", { ascending: true }),
      supabase
        .from("conversation_notes")
        .select("id, content, created_at, created_by")
        .eq("channel_id", conversationChannelId)
        .eq("contact_phone", normalizedPhone)
        .order("created_at", { ascending: true })
    ]);

    if (!inboundResult.error && !outboundResult.error) {
      const allMessages = [
        ...(inboundResult.data || []),
        ...(outboundResult.data || [])
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setMessages(allMessages as Message[]);
      
      // Mark as read
      const unreadMessageIds = allMessages
        .filter((msg: { direction: string; is_read?: boolean; id: string }) => msg.direction === "inbound" && msg.is_read === false)
        .map((msg: { id: string }) => msg.id);
      
      if (unreadMessageIds.length > 0) {
        await supabase
          .from("whatsapp_messages")
          .update({ is_read: true })
          .in("id", unreadMessageIds);
        
        const conversationKey = getConversationKey(selectedConversation);
        setAllConversations(prev => prev.map(c => {
          const key = getConversationKey(c);
          return key === conversationKey ? { ...c, unreadCount: 0 } : c;
        }));
      }
    }

    if (!notesResult.error && notesResult.data) {
      setConversationNotes(notesResult.data as ConversationNote[]);
    } else {
      setConversationNotes([]);
    }

    // Mark as in_progress when selected
    if (selectedConversation.status === "pending") {
      const key = getConversationKey(selectedConversation);
      updateConversationStatus(key, "in_progress");
    }
  };

  useEffect(() => {
    fetchMessagesAndNotes();
  }, [selectedConversation]);

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
      // This handles the case where there's no existing conversation_assignment
      const firstChannel = channels[0];
      
      const tempConversation: Conversation = {
        phone: normalizedPhoneToOpen,
        name: null,
        lastMessage: "",
        lastMessageTime: new Date().toISOString(),
        lastInboundTime: null,
        unreadCount: 0,
        channelId: firstChannel.id,
        status: "in_progress",
        assignedTo: null,
        assignedToName: null,
        sectorId: null,
        tags: null
      };
      
      setSelectedConversation(tempConversation);
      setSelectedChannel(firstChannel);
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
        .single();

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
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  const showNotificationRef = useRef(showNotification);
  const soundEnabledRef = useRef(soundEnabled);
  const playNotificationSoundRef = useRef(playNotificationSound);
  
  useEffect(() => {
    showNotificationRef.current = showNotification;
    soundEnabledRef.current = soundEnabled;
    playNotificationSoundRef.current = playNotificationSound;
  }, [showNotification, soundEnabled, playNotificationSound]);

  // Real-time subscription
  useEffect(() => {
    if (channels.length === 0) return;

    const channelSubscriptions = channels.map(ch =>
      supabase
        .channel(`atendimento-v2-${ch.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'whatsapp_messages',
            filter: `channel_id=eq.${ch.id}`
          },
          (payload) => {
            const newMsg = payload.new as Message;
            
            let contactPhone: string;
            let contactName: string | null = null;
            
            if (newMsg.direction === "inbound") {
              contactPhone = newMsg.sender_phone;
              contactName = newMsg.sender_name;
            } else {
              const metadata = newMsg.metadata as { destination?: string } | null;
              contactPhone = metadata?.destination || '';
              if (!contactPhone) return;
            }
            
            const normalizedContactPhone = contactPhone.replace(/\D/g, '');
            const currentSelectedConv = selectedConversationRef.current;
            const normalizedSelectedPhone = currentSelectedConv?.phone.replace(/\D/g, '') || '';
            const selectedChannelId = currentSelectedConv?.channelId || '';
            const msgConversationKey = `${newMsg.channel_id}_${normalizedContactPhone}`;
            const selectedConversationKey = `${selectedChannelId}_${normalizedSelectedPhone}`;
            
            if (newMsg.direction === "inbound") {
              showNotificationRef.current(newMsg);
              
              // Add visual highlight to this conversation
              setRecentlyUpdatedConversations(prev => {
                const newSet = new Set(prev);
                newSet.add(msgConversationKey);
                return newSet;
              });
              
              // Remove highlight after 5 seconds
              setTimeout(() => {
                setRecentlyUpdatedConversations(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(msgConversationKey);
                  return newSet;
                });
              }, 5000);
              
              if (soundEnabledRef.current) {
                playNotificationSoundRef.current();
                toast.info(`Nova mensagem de ${contactName || contactPhone}`, {
                  description: (newMsg.content || "").substring(0, 50) + ((newMsg.content?.length || 0) > 50 ? "..." : ""),
                  action: {
                    label: "Ver",
                    onClick: () => {
                      // Find and select this conversation
                      setAllConversations(convs => {
                        const targetConv = convs.find(c => 
                          c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone
                        );
                        if (targetConv) {
                          setSelectedConversation(targetConv);
                        }
                        return convs;
                      });
                    }
                  }
                });
              }
            }
            
            if (selectedConversationKey === msgConversationKey) {
              setMessages(prev => {
                // Enhanced deduplication: check by message_id, id, or optimistic match
                const existingIndex = prev.findIndex(m => 
                  m.message_id === newMsg.message_id || 
                  m.id === newMsg.id ||
                  // Match optimistic template messages by content + direction + recent timestamp
                  (newMsg.direction === "outbound" && 
                   m.direction === "outbound" && 
                   m.content === newMsg.content && 
                   m.id.startsWith('temp_') &&
                   Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 10000)
                );
                
                if (existingIndex >= 0) {
                  // Replace optimistic message with real one from database
                  const updated = [...prev];
                  updated[existingIndex] = { ...newMsg };
                  return updated;
                }
                
                return [...prev, newMsg];
              });
            }
            
            // For OUTBOUND messages, also update or create conversations
            // This is important for manual sends to appear in "Meus"
            if (newMsg.direction === "outbound") {
              const metadata = newMsg.metadata as { sent_by_human?: boolean } | null;
              const isSentByHuman = metadata?.sent_by_human === true;
              
              setAllConversations(prev => {
                const existing = prev.find(c => 
                  c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone
                );
                
                if (existing) {
                  // Update existing conversation with new message info
                  return prev.map(c => 
                    c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone 
                      ? { 
                          ...c, 
                          lastMessage: newMsg.content || c.lastMessage, 
                          lastMessageTime: newMsg.created_at,
                        }
                      : c
                  ).sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
                } else if (isSentByHuman) {
                  // For manual sends to new numbers, create the conversation
                  // Then fetch assignment to get proper assignedTo
                  const displayPhone = contactPhone.startsWith('+') ? contactPhone : '+' + normalizedContactPhone;
                  
                  // Get lead info
                  const phoneWithout55 = normalizedContactPhone.startsWith('55') ? normalizedContactPhone.slice(2) : normalizedContactPhone;
                  const phoneWith55New = normalizedContactPhone.startsWith('55') ? normalizedContactPhone : `55${normalizedContactPhone}`;
                  const phoneSuffix8 = normalizedContactPhone.slice(-8);
                  
                  const newMatches = [
                    leadsMapRef.current.byPhone.get(normalizedContactPhone),
                    leadsMapRef.current.byPhone.get(phoneWithout55),
                    leadsMapRef.current.byPhone.get(phoneWith55New),
                    leadsMapRef.current.bySuffix.get(phoneSuffix8)
                  ].filter(Boolean);
                  
                  let leadNameFromSystem: string | undefined;
                  let leadTagsFromSystem: string[] | null = null;
                  
                  for (const m of newMatches) {
                    if (!m) continue;
                    if (!leadNameFromSystem && m.name) leadNameFromSystem = m.name;
                    if ((!leadTagsFromSystem || leadTagsFromSystem.length === 0) && m.tags && m.tags.length > 0) {
                      leadTagsFromSystem = m.tags;
                    }
                    if (leadNameFromSystem && leadTagsFromSystem && leadTagsFromSystem.length > 0) break;
                  }
                  
                  // Fetch assignment info asynchronously
                  supabase
                    .from('conversation_assignments')
                    .select('sector_id, assigned_to, status')
                    .eq('channel_id', newMsg.channel_id)
                    .or(`conversation_phone.eq.${normalizedContactPhone},conversation_phone.eq.+${normalizedContactPhone}`)
                    .maybeSingle()
                    .then(async ({ data: assignment }) => {
                      let assignedToName: string | null = null;
                      if (assignment?.assigned_to) {
                        const { data: profile } = await supabase
                          .from('profiles')
                          .select('display_name, email')
                          .eq('user_id', assignment.assigned_to)
                          .single();
                        assignedToName = profile?.display_name || profile?.email || 'Atendente';
                      }
                      
                      setAllConversations(currentPrev => {
                        // Check if conversation was already added
                        const alreadyExists = currentPrev.some(c => 
                          c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone
                        );
                        
                        if (alreadyExists) {
                          // Update with assignment info from DB
                          // Map "active" status from DB to "in_progress" for frontend
                          let mappedStatus: Conversation["status"] | undefined;
                          if (assignment?.status === "active") mappedStatus = "in_progress";
                          else if (assignment?.status === "archived") mappedStatus = "archived";
                          else if (assignment?.status === "resolved") mappedStatus = "resolved";
                          else if (assignment?.status === "pending") mappedStatus = "pending";
                          else if (assignment?.status === "in_progress") mappedStatus = "in_progress";
                          
                          return currentPrev.map(c => 
                            c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone
                              ? { 
                                  ...c, 
                                  sectorId: assignment?.sector_id || null, 
                                  assignedTo: assignment?.assigned_to || null,
                                  assignedToName: assignedToName,
                                  status: mappedStatus || c.status
                                }
                              : c
                          );
                        }
                        
                        // Add new conversation with assignment info
                        // Map "active" status from DB to "in_progress" for frontend
                        let convStatus: Conversation["status"] = "in_progress";
                        if (assignment?.status === "archived") convStatus = "archived";
                        else if (assignment?.status === "resolved") convStatus = "resolved";
                        else if (assignment?.status === "pending") convStatus = "pending";
                        
                        const newConv: Conversation = {
                          phone: displayPhone,
                          name: leadNameFromSystem || null,
                          lastMessage: newMsg.content || "",
                          lastMessageTime: newMsg.created_at,
                          lastInboundTime: null,
                          unreadCount: 0,
                          channelId: newMsg.channel_id,
                          status: convStatus,
                          assignedTo: assignment?.assigned_to || null,
                          assignedToName: assignedToName,
                          sectorId: assignment?.sector_id || null,
                          tags: leadTagsFromSystem || null
                        };
                        
                        return [newConv, ...currentPrev];
                      });
                    });
                  
                  // Return unchanged for now, async update will add the conversation
                  return prev;
                }
                
                return prev;
              });
            }

            if (newMsg.direction === "inbound") {
              // CRITICAL FIX: For inbound messages, ALWAYS fetch assignment from DB to ensure
              // we have the correct assignedTo value. This prevents distributed conversations
              // from appearing in "Novos" tab.
              const fetchAndUpdateConversation = async () => {
                // First, fetch the current assignment state from DB
                const { data: assignment } = await supabase
                  .from('conversation_assignments')
                  .select('id, sector_id, assigned_to, status')
                  .eq('channel_id', newMsg.channel_id)
                  .or(`conversation_phone.eq.${normalizedContactPhone},conversation_phone.eq.+${normalizedContactPhone}`)
                  .maybeSingle();
                
                // Get attendant name if assigned
                let assignedToNameFromDb: string | null = null;
                if (assignment?.assigned_to) {
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name, email')
                    .eq('user_id', assignment.assigned_to)
                    .single();
                  assignedToNameFromDb = profile?.display_name || profile?.email || 'Atendente';
                }
                
                // Map DB status to frontend status
                let mappedStatusFromDb: Conversation["status"] = "pending";
                if (assignment?.status === "active" || assignment?.status === "in_progress") mappedStatusFromDb = "in_progress";
                else if (assignment?.status === "archived") mappedStatusFromDb = "archived";
                else if (assignment?.status === "resolved") mappedStatusFromDb = "resolved";
                else if (assignment?.status === "pending") mappedStatusFromDb = "pending";
                
                setAllConversations(prev => {
                  const existing = prev.find(c => 
                    c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone
                  );
                  
                  if (existing) {
                    // Determine status based on DB assignment or archived reactivation
                    let newStatus = mappedStatusFromDb;
                    if (existing.status === "archived" && assignment) {
                      // Reactivate archived conversation
                      const hadPreviousAttendant = assignment.assigned_to !== null;
                      newStatus = hadPreviousAttendant ? "in_progress" : "pending";
                      
                      // Update in DB
                      if (existing.channelId) {
                        supabase
                          .from("conversation_assignments")
                          .update({ 
                            status: newStatus, 
                            updated_at: new Date().toISOString() 
                          })
                          .eq("id", assignment.id)
                          .then(() => {});
                      }
                    }
                    
                    const currentSelectedConv = selectedConversationRef.current;
                    const normalizedSelectedPhone = currentSelectedConv?.phone.replace(/\D/g, '') || '';
                    const selectedChannelId = currentSelectedConv?.channelId || '';
                    const selectedConversationKeyLocal = `${selectedChannelId}_${normalizedSelectedPhone}`;
                    const msgConversationKeyLocal = `${newMsg.channel_id}_${normalizedContactPhone}`;
                    const isCurrentConversation = selectedConversationKeyLocal === msgConversationKeyLocal;
                    
                    // Get lead name from system
                    const phoneWithout55 = normalizedContactPhone.startsWith('55') ? normalizedContactPhone.slice(2) : normalizedContactPhone;
                    const phoneWith55 = normalizedContactPhone.startsWith('55') ? normalizedContactPhone : `55${normalizedContactPhone}`;
                    const phoneSuffix8 = normalizedContactPhone.slice(-8);
                    
                    const matches = [
                      leadsMapRef.current.byPhone.get(normalizedContactPhone),
                      leadsMapRef.current.byPhone.get(phoneWithout55),
                      leadsMapRef.current.byPhone.get(phoneWith55),
                      leadsMapRef.current.bySuffix.get(phoneSuffix8)
                    ].filter(Boolean);
                    
                    let leadNameFromSystem: string | undefined;
                    let leadTagsFromSystem: string[] | null = null;
                    
                    for (const match of matches) {
                      if (!match) continue;
                      if (!leadNameFromSystem && match.name) leadNameFromSystem = match.name;
                      if ((!leadTagsFromSystem || leadTagsFromSystem.length === 0) && match.tags && match.tags.length > 0) {
                        leadTagsFromSystem = match.tags;
                      }
                      if (leadNameFromSystem && leadTagsFromSystem && leadTagsFromSystem.length > 0) break;
                    }
                    
                    const updated = prev.map(c => 
                      c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone 
                        ? { 
                            ...c, 
                            id: assignment?.id || c.id,
                            lastMessage: newMsg.content || "", 
                            lastMessageTime: newMsg.created_at,
                            lastInboundTime: newMsg.created_at,
                            unreadCount: isCurrentConversation ? c.unreadCount : c.unreadCount + 1,
                            status: newStatus,
                            // CRITICAL: Always sync assignedTo from DB to prevent appearing in "Novos"
                            assignedTo: assignment?.assigned_to ?? c.assignedTo,
                            assignedToName: assignedToNameFromDb ?? c.assignedToName,
                            sectorId: assignment?.sector_id ?? c.sectorId,
                            name: leadNameFromSystem || c.name || contactName,
                            tags: leadTagsFromSystem || c.tags
                          }
                        : c
                    );
                    
                    return updated.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
                  }
                  
                  return prev;
                });
              };
              
              // Execute the async function
              fetchAndUpdateConversation();
              
              // Also check if conversation exists in current state for new conversations
              setAllConversations(prev => {
                const existing = prev.find(c => 
                  c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone
                );
                if (existing) {
                  // Will be handled by fetchAndUpdateConversation above
                  return prev;
                } else {
                  const displayPhone = contactPhone.startsWith('+') ? contactPhone : '+' + normalizedContactPhone;
                  // Get lead name from system with multiple lookup strategies
                  const phoneWithout55 = normalizedContactPhone.startsWith('55') ? normalizedContactPhone.slice(2) : normalizedContactPhone;
                  const phoneWith55New = normalizedContactPhone.startsWith('55') ? normalizedContactPhone : `55${normalizedContactPhone}`;
                  const phoneSuffix8 = normalizedContactPhone.slice(-8);
                  
                  // Find best lead match with merged data
                  const newMatches = [
                    leadsMapRef.current.byPhone.get(normalizedContactPhone),
                    leadsMapRef.current.byPhone.get(phoneWithout55),
                    leadsMapRef.current.byPhone.get(phoneWith55New),
                    leadsMapRef.current.bySuffix.get(phoneSuffix8)
                  ].filter(Boolean);
                  
                  let leadNameFromSystem: string | undefined;
                  let leadTagsFromSystem: string[] | null = null;
                  
                  for (const m of newMatches) {
                    if (!m) continue;
                    if (!leadNameFromSystem && m.name) leadNameFromSystem = m.name;
                    if ((!leadTagsFromSystem || leadTagsFromSystem.length === 0) && m.tags && m.tags.length > 0) {
                      leadTagsFromSystem = m.tags;
                    }
                    if (leadNameFromSystem && leadTagsFromSystem && leadTagsFromSystem.length > 0) break;
                  }
                  
                  // CRITICAL FIX: Buscar assignment ANTES de adicionar a conversa para garantir 
                  // que conversas já distribuídas não apareçam em "Novos"
                  supabase
                    .from('conversation_assignments')
                    .select('id, sector_id, assigned_to, status')
                    .eq('channel_id', newMsg.channel_id)
                    .or(`conversation_phone.eq.${normalizedContactPhone},conversation_phone.eq.+${normalizedContactPhone}`)
                    .maybeSingle()
                    .then(async ({ data: assignment }) => {
                      const sectorIdFromDb = assignment?.sector_id || null;
                      const assignedToFromDb = assignment?.assigned_to || null;
                      
                      // Fetch assigned user's name
                      let assignedToNameFromDb: string | null = null;
                      if (assignedToFromDb) {
                        const { data: profile } = await supabase
                          .from('profiles')
                          .select('display_name, email')
                          .eq('user_id', assignedToFromDb)
                          .single();
                        assignedToNameFromDb = profile?.display_name || profile?.email || 'Atendente';
                      }
                      
                      // Map DB status to frontend status
                      let mappedStatus: Conversation["status"] = "pending";
                      if (assignment?.status === "active" || assignment?.status === "in_progress") mappedStatus = "in_progress";
                      else if (assignment?.status === "archived") mappedStatus = "archived";
                      else if (assignment?.status === "resolved") mappedStatus = "resolved";
                      
                      setAllConversations(currentPrev => {
                        // Verificar se a conversa já foi adicionada
                        const alreadyExists = currentPrev.some(c => 
                          c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone
                        );
                        
                        if (alreadyExists) {
                          // Atualizar com dados do banco
                          return currentPrev.map(c => 
                            c.channelId === newMsg.channel_id && c.phone.replace(/\D/g, '') === normalizedContactPhone
                              ? { 
                                  ...c, 
                                  id: assignment?.id || c.id,
                                  sectorId: sectorIdFromDb, 
                                  assignedTo: assignedToFromDb,
                                  assignedToName: assignedToNameFromDb,
                                  status: mappedStatus
                                }
                              : c
                          );
                        }
                        
                        // Add new conversation with CORRECT assignment data from DB
                        const newConv: Conversation = {
                          id: assignment?.id,
                          phone: displayPhone,
                          name: leadNameFromSystem || contactName,
                          lastMessage: newMsg.content || "",
                          lastMessageTime: newMsg.created_at,
                          lastInboundTime: newMsg.created_at,
                          unreadCount: 1,
                          channelId: newMsg.channel_id,
                          status: mappedStatus,
                          assignedTo: assignedToFromDb, // CRITICAL: Use DB value, not null
                          assignedToName: assignedToNameFromDb,
                          sectorId: sectorIdFromDb,
                          tags: leadTagsFromSystem || null
                        };
                        
                        return [newConv, ...currentPrev];
                      });
                    });
                  
                  // Don't add immediately - wait for the async fetch above to add with correct data
                  return prev;
                }
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'whatsapp_messages',
            filter: `channel_id=eq.${ch.id}`
          },
          (payload) => {
            const updatedMsg = payload.new as Message;
            setMessages(prev => prev.map(m => 
              m.message_id === updatedMsg.message_id || m.id === updatedMsg.id 
                ? { ...m, status: updatedMsg.status }
                : m
            ));
          }
        )
        .subscribe()
    );

    // Subscription para mudanças em conversation_assignments (atribuições)
    // CRITICAL: Build a Set of channel IDs for fast lookup to prevent cross-org data leaks
    const channelIdSet = new Set(channels.map(c => c.id));
    
    const assignmentSubscription = supabase
      .channel('atendimento-v2-assignments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_assignments'
        },
        async (payload) => {
          const assignment = payload.new as { 
            id: string;
            conversation_phone: string; 
            channel_id: string | null; 
            assigned_to: string | null;
            sector_id: string | null;
            status: string | null;
          };
          
          if (!assignment?.conversation_phone) return;
          
          // CRITICAL: Ignore assignments from other organizations
          // Only process if the channel_id belongs to the current org's channels
          if (!assignment.channel_id || !channelIdSet.has(assignment.channel_id)) {
            return;
          }
          
          const normalizedPhone = assignment.conversation_phone.replace(/\D/g, '');
          
          // Buscar nome do atendente
          let assignedToName: string | null = null;
          if (assignment.assigned_to) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name, email')
              .eq('user_id', assignment.assigned_to)
              .single();
            
            assignedToName = profile?.display_name || profile?.email || 'Atendente';
          }
          
          // Map DB status to frontend status
          let mappedStatus: Conversation["status"] = "in_progress";
          if (assignment.status === "active") mappedStatus = "in_progress";
          else if (assignment.status === "archived") mappedStatus = "archived";
          else if (assignment.status === "resolved") mappedStatus = "resolved";
          else if (assignment.status === "pending") mappedStatus = "pending";
          else if (assignment.status === "in_progress") mappedStatus = "in_progress";
          
          // Check if this was locally created - skip realtime processing to avoid duplicates
          const convKey = `${assignment.channel_id}_${normalizePhoneNumber(normalizedPhone)}`;
          if (locallyCreatedConversationsRef.current.has(convKey)) {
            console.log('Skipping realtime update for locally created conversation:', convKey);
            // Still update existing with latest DB info (e.g., ID)
            setAllConversations(prev => prev.map(c => {
              const cKey = `${c.channelId}_${normalizePhoneNumber(c.phone)}`;
              if (cKey === convKey) {
                return { 
                  ...c, 
                  id: assignment.id, // Ensure we have the DB ID
                  assignedTo: assignment.assigned_to,
                  assignedToName: assignedToName,
                  sectorId: assignment.sector_id || c.sectorId,
                  status: mappedStatus
                };
              }
              return c;
            }));
            return;
          }
          
          // Check if conversation exists by ID first, then by phone+channel
          setAllConversations(prev => {
            // First try to find by ID (most reliable)
            let existing = assignment.id ? prev.find(c => c.id === assignment.id) : null;
            
            // Fallback to phone+channel matching
            if (!existing) {
              existing = prev.find(c => {
                const cNormalized = normalizePhoneNumber(c.phone);
                const assignmentNormalized = normalizePhoneNumber(normalizedPhone);
                return cNormalized === assignmentNormalized && c.channelId === assignment.channel_id;
              });
            }
            
            if (existing) {
              // Update existing conversation
              return prev.map(c => {
                const isMatch = c.id === assignment.id || 
                  (normalizePhoneNumber(c.phone) === normalizePhoneNumber(normalizedPhone) && c.channelId === assignment.channel_id);
                if (isMatch) {
                  return { 
                    ...c, 
                    id: assignment.id,
                    assignedTo: assignment.assigned_to,
                    assignedToName: assignedToName,
                    sectorId: assignment.sector_id || c.sectorId,
                    status: mappedStatus
                  };
                }
                return c;
              });
            } else if (assignment.assigned_to && assignment.channel_id) {
              // Conversation doesn't exist yet - create it for manual sends
              // This is crucial for showing conversations in "Meus" when sending templates manually
              
              // Get lead info from cache
              const phoneWithout55 = normalizedPhone.startsWith('55') ? normalizedPhone.slice(2) : normalizedPhone;
              const phoneWith55 = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
              const phoneSuffix8 = normalizedPhone.slice(-8);
              
              const matches = [
                leadsMapRef.current.byPhone.get(normalizedPhone),
                leadsMapRef.current.byPhone.get(phoneWithout55),
                leadsMapRef.current.byPhone.get(phoneWith55),
                leadsMapRef.current.bySuffix.get(phoneSuffix8)
              ].filter(Boolean);
              
              let leadName: string | null = null;
              let leadTags: string[] | null = null;
              
              for (const m of matches) {
                if (!m) continue;
                if (!leadName && m.name) leadName = m.name;
                if ((!leadTags || leadTags.length === 0) && m.tags && m.tags.length > 0) {
                  leadTags = m.tags;
                }
                if (leadName && leadTags && leadTags.length > 0) break;
              }
              
              const displayPhone = '+' + normalizePhoneNumber(normalizedPhone);
              
              // Create new conversation with ID
              const newConv: Conversation = {
                id: assignment.id,
                phone: displayPhone,
                name: leadName,
                lastMessage: "Template enviado",
                lastMessageTime: new Date().toISOString(),
                lastInboundTime: null,
                unreadCount: 0,
                channelId: assignment.channel_id,
                status: mappedStatus,
                assignedTo: assignment.assigned_to,
                assignedToName: assignedToName,
                sectorId: assignment.sector_id || null,
                tags: leadTags
              };
              
              return [newConv, ...prev];
            }
            
            return prev;
          });
          
          // Atualizar conversa selecionada se for a mesma
          setSelectedConversation(prev => {
            if (!prev) return null;
            const prevNormalized = prev.phone.replace(/\D/g, '');
            if (prevNormalized === normalizedPhone && prev.channelId === assignment.channel_id) {
              return { 
                ...prev, 
                assignedTo: assignment.assigned_to,
                assignedToName: assignedToName,
                sectorId: assignment.sector_id || prev.sectorId,
                status: mappedStatus
              };
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      channelSubscriptions.forEach(sub => supabase.removeChannel(sub));
      supabase.removeChannel(assignmentSubscription);
    };
  }, [channels]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    const { data: currentAssignment } = await supabase
      .from('conversation_assignments')
      .select('assigned_to, sector_id, status')
      .eq('channel_id', conversation.channelId)
      .or(`conversation_phone.eq.${normalizedPhone},conversation_phone.eq.+${normalizedPhone}`)
      .maybeSingle();

    // CRITICAL: Re-check sector permission using the actual sector_id from DB
    // This prevents race conditions where frontend state is stale
    const actualSectorId = currentAssignment?.sector_id || conversation.sectorId;
    if (!canInteractWithSector(actualSectorId)) {
      const sectorName = sectors.find(s => s.id === actualSectorId)?.name || "outro departamento";
      toast.error(`Você não tem permissão para atender conversas do departamento "${sectorName}"`);
      return;
    }

    // Se já está atribuída a outro atendente e está ativa, bloquear
    if (currentAssignment?.assigned_to && 
        currentAssignment.assigned_to !== user.id && 
        currentAssignment.status !== 'archived') {
      // Atendentes não podem assumir conversas de outros atendentes
      // Apenas supervisors e admins podem fazer isso
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

    // Get user's first sector to assign to the conversation if it doesn't have one
    let sectorToAssign = actualSectorId;
    if (!sectorToAssign && sectorIds.length > 0) {
      // Inherit sector from the user accepting the conversation
      sectorToAssign = sectorIds[0];
    }

    try {
      const { error } = await supabase
        .from("conversation_assignments")
        .upsert({
          conversation_phone: normalizedPhone,
          channel_id: conversation.channelId,
          assigned_to: user.id,
          assigned_at: new Date().toISOString(),
          status: "active",
          sector_id: sectorToAssign
        }, {
          onConflict: "conversation_phone,channel_id"
        });

      if (error) {
        // Check if it's a RLS error
        if (error.message?.includes('row-level security') || error.code === '42501') {
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

  // Send message
  const handleSendMessage = async () => {
    const conversationChannelId = selectedConversation?.channelId;
    if (!newMessage.trim() || !selectedConversation || !conversationChannelId || sendingMessage) return;

    const conversationChannel = channels.find(c => c.id === conversationChannelId);
    const messageToSend = newMessage.trim();
    setNewMessage("");
    setSendingMessage(true);

    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const optimisticMessage: Message = {
      id: tempId,
      channel_id: conversationChannelId,
      message_id: tempId,
      sender_phone: conversationChannel?.phone || "",
      sender_name: null,
      message_type: "text",
      content: messageToSend,
      media_url: null,
      direction: "outbound",
      status: "sending",
      created_at: new Date().toISOString(),
      metadata: { destination: selectedConversation.phone }
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const sendFunction = conversationChannel?.provider === 'zapi' ? 'zapi-send' : 'meta-send';
      
      // CRÍTICO: Verificar no banco se outro atendente já pegou esta conversa
      const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');
      const { data: currentAssignment } = await supabase
        .from('conversation_assignments')
        .select('assigned_to, sector_id')
        .eq('channel_id', conversationChannelId)
        .or(`conversation_phone.eq.${normalizedPhone},conversation_phone.eq.+${normalizedPhone}`)
        .maybeSingle();
      
      // Verificar se o usuário tem acesso ao setor da conversa
      const assignmentSectorId = currentAssignment?.sector_id || selectedConversation.sectorId;
      if (!canInteractWithSector(assignmentSectorId)) {
        toast.error('Você não tem permissão para enviar mensagens para este departamento');
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setNewMessage(messageToSend);
        setSendingMessage(false);
        return;
      }
      
      // Se já está atribuída a outro atendente, bloquear envio
      if (currentAssignment?.assigned_to && currentAssignment.assigned_to !== user?.id) {
        toast.error('Esta conversa já foi assumida por outro atendente');
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setNewMessage(messageToSend);
        setSendingMessage(false);
        
        // Atualizar estado local para refletir a atribuição
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

      const { data, error } = await supabase.functions.invoke(sendFunction, {
        body: {
          channelId: conversationChannelId,
          destination: selectedConversation.phone,
          message: messageToSend,
          messageType: 'text'
        }
      });

      if (error) {
        toast.error('Erro ao enviar mensagem');
        setMessages(prev => prev.map(m => m.id === tempId 
          ? { ...m, status: 'failed', error_message: 'Erro de conexão ao enviar mensagem' }
          : m
        ));
        setNewMessage(messageToSend);
        setSendingMessage(false);
        return;
      }

      if (data.success) {
        setMessages(prev => prev.map(m => 
          m.id === tempId 
            ? { ...m, message_id: data.messageId, status: "sent" }
            : m
        ));

        // Auto-assign quando envia primeira mensagem (usar insert com onConflict para garantir atomicidade)
        if (!selectedConversation.assignedTo && user?.id) {
          const { error: assignError } = await supabase
            .from('conversation_assignments')
            .upsert({
              conversation_phone: normalizedPhone,
              channel_id: conversationChannelId,
              assigned_to: user.id,
              assigned_at: new Date().toISOString(),
              status: 'in_progress',
              sector_id: currentAssignment?.sector_id || selectedConversation.sectorId
            }, { onConflict: 'conversation_phone,channel_id' });

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
      } else {
        const errorMsg = data.error || 'Erro ao enviar mensagem';
        toast.error(errorMsg);
        setMessages(prev => prev.map(m => m.id === tempId 
          ? { ...m, status: 'failed', error_message: errorMsg, message_id: data.messageId || tempId }
          : m
        ));
        setNewMessage(messageToSend);
      }
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Erro ao enviar mensagem');
      setMessages(prev => prev.map(m => m.id === tempId 
        ? { ...m, status: 'failed', error_message: 'Erro inesperado ao enviar mensagem' }
        : m
      ));
      setNewMessage(messageToSend);
    }

    setSendingMessage(false);
  };

  // Send media
  const handleSendMedia = async (mediaData: {
    mediaType: string;
    mediaUrl: string;
    mediaCaption?: string;
    fileName?: string;
  }) => {
    const conversationChannelId = selectedConversation?.channelId;
    if (!selectedConversation || !conversationChannelId) return;

    const conversationChannel = channels.find(c => c.id === conversationChannelId);
    setSendingMessage(true);

    try {
      const sendFunction = conversationChannel?.provider === 'zapi' ? 'zapi-send' : 'meta-send';
      
      // CRÍTICO: Verificar no banco se outro atendente já pegou esta conversa
      const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');
      const { data: currentAssignment } = await supabase
        .from('conversation_assignments')
        .select('assigned_to, sector_id')
        .eq('channel_id', conversationChannelId)
        .or(`conversation_phone.eq.${normalizedPhone},conversation_phone.eq.+${normalizedPhone}`)
        .maybeSingle();
      
      // Se já está atribuída a outro atendente, bloquear envio
      if (currentAssignment?.assigned_to && currentAssignment.assigned_to !== user?.id) {
        toast.error('Esta conversa já foi assumida por outro atendente');
        setSendingMessage(false);
        
        // Atualizar estado local para refletir a atribuição
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
      
      const { data, error } = await supabase.functions.invoke(sendFunction, {
        body: {
          channelId: conversationChannelId,
          destination: selectedConversation.phone,
          messageType: mediaData.mediaType,
          mediaUrl: mediaData.mediaUrl,
          mediaCaption: mediaData.mediaCaption,
          fileName: mediaData.fileName
        }
      });

      if (error) {
        const failedMessage: Message = {
          id: `temp_failed_${Date.now()}`,
          channel_id: conversationChannelId,
          message_id: `failed_media_${Date.now()}`,
          sender_phone: conversationChannel?.phone || "",
          sender_name: null,
          message_type: mediaData.mediaType === 'ptt' ? 'audio' : mediaData.mediaType,
          content: mediaData.mediaCaption || `[${mediaData.mediaType}]`,
          media_url: mediaData.mediaUrl,
          direction: "outbound",
          status: "failed",
          created_at: new Date().toISOString(),
          metadata: { destination: selectedConversation.phone },
          error_message: 'Erro de conexão ao enviar mídia'
        };
        setMessages(prev => [...prev, failedMessage]);
        toast.error('Erro ao enviar mídia');
        setSendingMessage(false);
        return;
      }

      if (data.success) {
        const optimisticMessage: Message = {
          id: `temp_${Date.now()}`,
          channel_id: conversationChannelId,
          message_id: data.messageId,
          sender_phone: conversationChannel?.phone || "",
          sender_name: null,
          message_type: mediaData.mediaType === 'ptt' ? 'audio' : mediaData.mediaType,
          content: mediaData.mediaCaption || (mediaData.mediaType === 'ptt' ? '[Mensagem de voz]' : `[${mediaData.mediaType}]`),
          media_url: mediaData.mediaUrl,
          direction: "outbound",
          status: "sent",
          created_at: new Date().toISOString(),
          metadata: { destination: selectedConversation.phone }
        };
        setMessages(prev => [...prev, optimisticMessage]);
        toast.success(mediaData.mediaType === 'ptt' ? "Áudio enviado!" : "Mídia enviada!");

        // Auto-assign quando envia (usar insert com onConflict para garantir atomicidade)
        if (!selectedConversation.assignedTo && user?.id) {
          const { error: assignError } = await supabase
            .from('conversation_assignments')
            .upsert({
              conversation_phone: normalizedPhone,
              channel_id: conversationChannelId,
              assigned_to: user.id,
              assigned_at: new Date().toISOString(),
              status: 'in_progress',
              sector_id: currentAssignment?.sector_id || selectedConversation.sectorId
            }, { onConflict: 'conversation_phone,channel_id' });

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
      } else {
        const errorMsg = data.error || 'Erro ao enviar mídia';
        const failedMessage: Message = {
          id: `temp_failed_${Date.now()}`,
          channel_id: conversationChannelId,
          message_id: data.messageId || `failed_media_${Date.now()}`,
          sender_phone: conversationChannel?.phone || "",
          sender_name: null,
          message_type: mediaData.mediaType === 'ptt' ? 'audio' : mediaData.mediaType,
          content: mediaData.mediaCaption || `[${mediaData.mediaType}]`,
          media_url: mediaData.mediaUrl,
          direction: "outbound",
          status: "failed",
          created_at: new Date().toISOString(),
          metadata: { destination: selectedConversation.phone },
          error_message: errorMsg
        };
        setMessages(prev => [...prev, failedMessage]);
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Send media error:', err);
      toast.error('Erro ao enviar mídia');
    }

    setSendingMessage(false);
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

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        toast.error('Erro ao fazer upload do arquivo');
        setUploadingMedia(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);

      await handleSendMedia({
        mediaType,
        mediaUrl: urlData.publicUrl,
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
      toast.error('Erro ao enviar áudio');
    }

    setIsConvertingAudio(false);
    setUploadingMedia(false);
  };

  const handleCancelVoiceRecording = () => {
    cancelRecording();
    toast.info("Gravação cancelada");
  };

  // Send template
  const handleSendTemplate = async (templateName: string, templateParams: string[]) => {
    const conversationChannelId = selectedConversation?.channelId;
    if (!selectedConversation || !conversationChannelId) return;

    const conversationChannel = channels.find(c => c.id === conversationChannelId);
    
    if (conversationChannel?.provider === 'zapi') {
      toast.error('Templates não são suportados em canais Z-API. Use mensagens de texto.');
      return;
    }
    
    setSendingMessage(true);

    // CRITICAL: Create optimistic message BEFORE API call to prevent duplication
    // The Realtime handler will find this and update it instead of adding a duplicate
    const tempId = `temp_template_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: Message = {
      id: tempId,
      channel_id: conversationChannelId,
      message_id: tempId, // Temporary, will be updated with real messageId
      sender_phone: conversationChannel?.phone || "",
      sender_name: null,
      message_type: "template",
      content: `Template: ${templateName}`,
      media_url: null,
      direction: "outbound",
      status: "sending", // Show "sending" status while waiting for API
      created_at: new Date().toISOString(),
      metadata: { destination: selectedConversation.phone, templateName, templateParams }
    };
    
    // Add optimistic message immediately
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const { data, error } = await supabase.functions.invoke('meta-send', {
        body: {
          channelId: conversationChannelId,
          destination: selectedConversation.phone,
          messageType: 'template',
          templateName,
          templateParams
        }
      });

      if (error) {
        // Update existing optimistic message to failed
        setMessages(prev => prev.map(m => 
          m.id === tempId 
            ? { ...m, status: "failed", error_message: 'Erro de conexão ao enviar template' }
            : m
        ));
        toast.error('Erro ao enviar template');
        setSendingMessage(false);
        return;
      }

      if (data.success) {
        // Update existing optimistic message with real messageId and success status
        setMessages(prev => prev.map(m => 
          m.id === tempId 
            ? { ...m, message_id: data.messageId, status: "sent" }
            : m
        ));
        toast.success("Template enviado!");
      } else {
        const errorMsg = data.error || 'Erro ao enviar template';
        // Update existing optimistic message to failed
        setMessages(prev => prev.map(m => 
          m.id === tempId 
            ? { ...m, message_id: data.messageId || tempId, status: "failed", error_message: errorMsg }
            : m
        ));
        toast.error(errorMsg);
      }
    } catch {
      // Update existing optimistic message to failed
      setMessages(prev => prev.map(m => 
        m.id === tempId 
          ? { ...m, status: "failed", error_message: 'Erro inesperado ao enviar template' }
          : m
      ));
      toast.error('Erro ao enviar template');
    }

    setSendingMessage(false);
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
      
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('conversation_assignments')
        .upsert({
          channel_id: data.channelId,
          conversation_phone: normalizedPhone,
          assigned_to: user.id,
          assigned_at: now,
          status: 'in_progress',
          is_bot_handling: false,
          bot_paused_until: botPausedUntil,
          updated_at: now
        }, {
          onConflict: 'conversation_phone,channel_id',
          ignoreDuplicates: false
        })
        .select('id')
        .single();
      
      if (assignmentError) {
        console.error('Error persisting conversation assignment:', assignmentError);
        // Continue anyway - at least try to show in UI
      } else {
        assignmentId = assignmentData?.id || null;
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
    const phoneWithout55 = normalizedPhone.startsWith('55') ? normalizedPhone.slice(2) : normalizedPhone;
    const phoneWith55 = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
    const phoneSuffix8 = normalizedPhone.slice(-8);
    
    let leadName: string | null = null;
    let leadTags: string[] | null = null;
    let leadId: string | null = null;
    
    const matches = [
      leadsMapRef.current.byPhone.get(normalizedPhone),
      leadsMapRef.current.byPhone.get(phoneWithout55),
      leadsMapRef.current.byPhone.get(phoneWith55),
      leadsMapRef.current.bySuffix.get(phoneSuffix8)
    ].filter(Boolean);
    
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
      await supabase
        .from('conversation_assignments')
        .update({ lead_id: leadId })
        .eq('channel_id', data.channelId)
        .eq('conversation_phone', normalizedPhone);
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

  // Computed values - FIXED: Only archived conversations go to archived, not based on hasClientResponse
  const activeConversations = conversations.filter(conv => conv.status !== "archived");
  const archivedConversations = conversations.filter(conv => conv.status === "archived");

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

  // If we have global search results and a search term, prioritize showing those
  const hasGlobalResults = globalSearchResults.length > 0 && searchTerm.length >= 3;
  
  const filteredConversations = hasGlobalResults 
    ? globalSearchResults.filter(conv => {
        // Apply filter status to global results too
        let matchesFilter = false;
        if (filterStatus === "new") {
          // Same strict logic as main filter - only truly orphan conversations
          const isTrulyOrphan = !conv.assignedTo && !conv.sectorId;
          matchesFilter = isTrulyOrphan && conv.status !== "archived";
        }
        else if (filterStatus === "mine") matchesFilter = conv.assignedTo === user?.id;
        else if (filterStatus === "others") matchesFilter = canSeeOthers && conv.assignedTo !== null && conv.assignedTo !== user?.id;
        
        // Apply attendant filter (only for admins/supervisors)
        // CRITICAL FIX: Do NOT apply attendant filter to "Novos" tab - new conversations have NO assignee
        const matchesAttendant = filterStatus === "new" || !filterByAttendant || conv.assignedTo === filterByAttendant;
        
        // Apply sector filter with attendant cross-reference
        const matchesSector = matchesSectorFilter(conv);
        
        return matchesFilter && matchesAttendant && matchesSector && conv.status !== "archived";
      })
    : visibleConversations.filter(conv => {
        const matchesSearch = !searchTerm || conv.phone.includes(searchTerm) || conv.name?.toLowerCase().includes(searchTerm.toLowerCase());
        
        let matchesFilter = false;
        if (filterStatus === "new") {
          // CRITICAL FIX: "Novos" ONLY shows truly orphan conversations:
          // 1. Have NO assignee (assigned_to is null/undefined)
          // 2. Have NO sector (sector_id is null/undefined)
          // 3. Are not archived
          // 
          // STRICT ENFORCEMENT: If a conversation has a sector, it means it came from
          // a campaign or was manually assigned to a department. Such conversations
          // should NEVER appear in "Novos" because they WILL be auto-distributed.
          // If the assignedTo is still null but sector exists, it means the state
          // is stale and the conversation shouldn't be shown until synced.
          const isTrulyOrphan = !conv.assignedTo && !conv.sectorId;
          matchesFilter = isTrulyOrphan && conv.status !== "archived";
        }
        else if (filterStatus === "mine") matchesFilter = conv.assignedTo === user?.id;
        else if (filterStatus === "others") matchesFilter = canSeeOthers && conv.assignedTo !== null && conv.assignedTo !== user?.id;
        
        // Apply attendant filter (only for admins/supervisors)
        // CRITICAL FIX: Do NOT apply attendant filter to "Novos" tab - new conversations have NO assignee
        const matchesAttendant = filterStatus === "new" || !filterByAttendant || conv.assignedTo === filterByAttendant;
        
        // Apply sector filter with attendant cross-reference
        const matchesSector = matchesSectorFilter(conv);
        
        return matchesSearch && matchesFilter && matchesAttendant && matchesSector;
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
  const archivedFromGlobalSearch = hasGlobalResults 
    ? globalSearchResults.filter(conv => conv.status === "archived")
    : [];
    
  const filteredArchived = hasGlobalResults
    ? archivedFromGlobalSearch
        .filter(conv => {
          const matchesAttendant = !filterByAttendant || conv.assignedTo === filterByAttendant;
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
          const matchesAttendant = !filterByAttendant || conv.assignedTo === filterByAttendant;
          const matchesSector = matchesSectorFilter(conv);
          return matchesSearch && matchesAttendant && matchesSector;
        })
        .sort((a, b) => {
          const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
          const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
          return timeB - timeA;
        });

  // Counts - "Novos" counts ALL conversations without assignee (excluding archived)
  // CRITICAL FIX: Count only truly orphan conversations (no assignee AND no sector)
  const newCount = visibleConversations.filter(c => !c.assignedTo && !c.sectorId && c.status !== "archived").length;
  const mineCount = visibleConversations.filter(c => c.assignedTo === user?.id).length;
  const othersCount = canSeeOthers ? visibleConversations.filter(c => c.assignedTo && c.assignedTo !== user?.id).length : 0;

  // 24-hour window
  const is24HourWindowExpired = (lastInboundTime: string | null) => {
    if (!lastInboundTime) return true;
    const lastInbound = new Date(lastInboundTime);
    const now = new Date();
    const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 24;
  };

  const getWindowTimeRemaining = (lastInboundTime: string | null) => {
    if (!lastInboundTime) return null;
    const lastInbound = new Date(lastInboundTime);
    const expireTime = new Date(lastInbound.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const remainingMs = expireTime.getTime() - now.getTime();
    if (remainingMs <= 0) return null;
    
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}min`;
  };

  const isWindowExpired = selectedConversation ? is24HourWindowExpired(selectedConversation.lastInboundTime) : false;
  const windowTimeRemaining = selectedConversation ? getWindowTimeRemaining(selectedConversation.lastInboundTime) : null;
  const isMyConversation = !selectedConversation?.assignedTo || selectedConversation?.assignedTo === user?.id;

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
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, pastedImage.file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        toast.error('Erro ao fazer upload da imagem');
        setUploadingMedia(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);

      await handleSendMedia({
        mediaType: 'image',
        mediaUrl: urlData.publicUrl,
        fileName: `imagem_colada.${fileExt}`
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
      <div className="h-full flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          "w-full lg:w-80 xl:w-96 bg-card border-r border-border flex flex-col min-h-0",
          selectedConversation ? "hidden lg:flex" : "flex"
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
                  onClick={() => setFilterStatus("new")} 
                  className={cn(
                    "text-sm font-medium flex items-center gap-1.5 transition-colors",
                    filterStatus === "new" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
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
                  onClick={() => setFilterStatus("mine")} 
                  className={cn(
                    "text-sm font-medium transition-colors",
                    filterStatus === "mine" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Meus
                </button>
                {canSeeOthers && (
                  <button 
                    onClick={() => setFilterStatus("others")} 
                    className={cn(
                      "text-sm font-medium transition-colors",
                      filterStatus === "others" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Outros
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowArchived(!showArchived)}
                  className="h-8 w-8"
                  title="Arquivados"
                >
                  <Archive className="w-4 h-4 text-muted-foreground" />
                </Button>
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar atendimento (mín. 3 caracteres para busca global)" 
                  className="pl-10 bg-muted/30 border-border h-9 text-sm" 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                />
                {isSearchingGlobal && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                )}
              </div>
              
              {/* Filters for admins/supervisors */}
              {canSeeOthers && (
                <div className="flex gap-2">
                  <AttendantFilter 
                    value={filterByAttendant} 
                    onChange={(v) => {
                      setFilterByAttendant(v);
                      // Auto-switch to "Outros" when filtering by specific attendant
                      if (v && v !== user?.id) {
                        setFilterStatus("others");
                      }
                    }}
                    selectedSectorId={filterBySector}
                  />
                  <SectorFilter 
                    value={filterBySector} 
                    onChange={setFilterBySector}
                  />
                </div>
              )}
            </div>
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
                                  {conv.lastMessage || "Sem mensagens"}
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

          {/* Conversations list - hidden when showing archived */}
          {!showArchived && (
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
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
                filteredConversations.map((conversation) => {
                  const conversationKey = getConversationKey(conversation);
                  const sectorInfo = sectors.find(s => s.id === conversation.sectorId);
                  const isSelected = selectedConversation && getConversationKey(selectedConversation) === conversationKey;
                  
                  return (
                    <button 
                      key={conversationKey} 
                      onClick={() => setSelectedConversation(conversation)} 
                      className={cn(
                        "w-full p-3 text-left transition-all hover:bg-muted/30",
                        isSelected && "bg-primary/5",
                        recentlyUpdatedConversations.has(conversationKey) && !isSelected && "animate-pulse bg-primary/10 border-l-4 border-primary"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar with WhatsApp icon overlay */}
                        <div className="relative shrink-0">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-pink-100 text-pink-600 text-sm font-semibold">
                              {conversation.name ? conversation.name.split(" ").map(n => n[0]).join("").slice(0, 2) : <User className="w-4 h-4" />}
                            </AvatarFallback>
                          </Avatar>
                          <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                            <MessageSquare className="w-2.5 h-2.5 text-white" />
                          </div>
                        </div>
                        
                        {/* Content - Name and Last Message */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="font-medium text-foreground text-sm truncate flex-1 min-w-0">
                              {conversation.name || conversation.phone}
                            </span>
                            {sectorInfo && (
                              <Badge variant="outline" className="text-[10px] h-5 px-2 bg-primary text-primary-foreground border-0 shrink-0 max-w-[90px] truncate">
                                {sectorInfo.name}
                              </Badge>
                            )}
                          </div>
                          {/* Lead Tags */}
                          {conversation.tags && conversation.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-0.5">
                              {conversation.tags.slice(0, 3).map((tagName, idx) => {
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
                              {conversation.tags.length > 3 && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-muted text-muted-foreground border-0">
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
                              {conversation.lastMessage}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatConversationDate(conversation.lastMessageTime)}
                              </span>
                              {conversation.unreadCount > 0 && (
                                <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {conversation.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
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
        <div className={cn("flex-1 bg-card flex flex-col overflow-hidden", !selectedConversation ? "hidden lg:flex" : "flex")}>
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
                    <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 shrink-0" onClick={() => setSelectedConversation(null)}>
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

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-3xl mx-auto">
                  {(() => {
                    let lastDate = "";
                    return messages.map((message) => {
                      const messageDate = format(new Date(message.created_at), "yyyy-MM-dd");
                      const showDateSeparator = messageDate !== lastDate;
                      lastDate = messageDate;
                      
                      const isOutbound = message.direction === "outbound";
                      const isFailed = message.status === "failed";
                      
                      return (
                        <div key={message.id}>
                          {showDateSeparator && (
                            <div className="flex items-center justify-center my-4">
                              <div className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs">
                                {isToday(new Date(message.created_at)) ? "Hoje" : isYesterday(new Date(message.created_at)) ? "Ontem" : format(new Date(message.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </div>
                            </div>
                          )}
                          <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
                            <div className={cn("max-w-[80%]", isFailed ? "space-y-2" : "")}>
                              <div className={cn("rounded-2xl px-4 py-2 shadow-sm", isOutbound ? isFailed ? "bg-destructive/80 text-destructive-foreground" : "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                                {isFailed && (
                                  <div className="flex items-center gap-1.5 mb-1 text-xs opacity-80">
                                    <AlertTriangle className="w-3 h-3" /><span>Falha ao enviar</span>
                                  </div>
                                )}
                                {renderMessageContent(message)}
                                <div className={cn("flex items-center gap-1.5 mt-1 text-[10px]", isOutbound ? "justify-end text-primary-foreground/70" : "text-muted-foreground")}>
                                  <span>{formatMessageTime(message.created_at)}</span>
                                  {isOutbound && !isFailed && (
                                    message.status === "read" ? <CheckCheck className="w-3.5 h-3.5 text-blue-400" /> :
                                    message.status === "delivered" ? <CheckCheck className="w-3.5 h-3.5" /> :
                                    message.status === "sending" ? <Clock className="w-3.5 h-3.5" /> :
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                </div>
                              </div>
                              
                              {/* Detailed error message panel */}
                              {isFailed && message.error_message && (() => {
                                const errorDetails = formatErrorDisplay(message.error_message);
                                return (
                                  <div className="rounded-xl bg-card border border-warning/30 p-3 text-sm">
                                    <div className="flex items-start gap-2 text-warning mb-1.5">
                                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                      <div className="font-medium">
                                        Atenção{errorDetails.code ? `: ${errorDetails.code}` : ""} - {errorDetails.title}
                                      </div>
                                    </div>
                                    <p className="text-muted-foreground text-xs mb-2 pl-6">
                                      {errorDetails.description}
                                    </p>
                                    <p className="text-muted-foreground text-xs pl-6">
                                      {errorDetails.suggestion}
                                    </p>
                                    {errorDetails.link && (
                                      <div className="mt-2 pt-2 border-t border-border pl-6">
                                        <p className="text-xs text-muted-foreground">
                                          Para saber mais acesse esse link:
                                        </p>
                                        <a 
                                          href={errorDetails.link} 
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="text-xs text-primary hover:underline break-all"
                                        >
                                          {errorDetails.link}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

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
                    <div className="relative flex-1 flex items-end gap-2">
                      {/* Quick Responses Autocomplete */}
                      <QuickResponsesAutocomplete
                        isOpen={showQuickResponsesAutocomplete}
                        onClose={() => setShowQuickResponsesAutocomplete(false)}
                        onSelectResponse={(content) => {
                          setNewMessage(content);
                          setShowQuickResponsesAutocomplete(false);
                        }}
                        searchTerm={newMessage}
                      />
                      
                      <Textarea
                        placeholder={!isMyConversation ? "Esta conversa pertence a outro atendente" : isWindowExpired ? "Use um template..." : "Digite / para respostas rápidas..."}
                        className={cn("min-h-[44px] max-h-32 resize-none bg-muted/30 text-sm flex-1", (isWindowExpired || !isMyConversation) && "opacity-50 cursor-not-allowed")}
                        value={newMessage}
                        onChange={(e) => {
                          if (isWindowExpired || !isMyConversation) return;
                          const value = e.target.value;
                          setNewMessage(value);
                          
                          // Show autocomplete when typing "/" at start or after space
                          if (value.startsWith("/") || value.includes(" /")) {
                            setShowQuickResponsesAutocomplete(true);
                          } else {
                            setShowQuickResponsesAutocomplete(false);
                          }
                        }}
                        disabled={isWindowExpired || !isMyConversation}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                          // If autocomplete is open, let it handle navigation keys
                          if (showQuickResponsesAutocomplete) {
                            if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
                              // Let the autocomplete component handle these keys
                              return;
                            }
                          }
                          
                          if (e.key === "Enter" && !e.shiftKey && !isWindowExpired && isMyConversation && !showQuickResponsesAutocomplete) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                          
                          // Close autocomplete on Escape
                          if (e.key === "Escape" && showQuickResponsesAutocomplete) {
                            setShowQuickResponsesAutocomplete(false);
                          }
                        }}
                        onBlur={() => {
                          // Delay closing to allow click on autocomplete items
                          setTimeout(() => setShowQuickResponsesAutocomplete(false), 200);
                        }}
                      />
                      {isWindowExpired ? (
                        <Button onClick={() => setShowTemplateSelector(true)} className="h-11 px-4 shrink-0"><FileText className="w-5 h-5" /></Button>
                      ) : newMessage.trim() ? (
                        <Button onClick={handleSendMessage} disabled={sendingMessage} className="h-11 px-4 shrink-0">
                          {sendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </Button>
                      ) : (
                        <Button onClick={handleStartVoiceRecording} disabled={uploadingMedia} variant="default" className="h-11 px-4 bg-green-600 hover:bg-green-700 shrink-0">
                          {uploadingMedia ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
                        </Button>
                      )}
                    </div>
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

      {selectedConversation && <ConversationNotesDialog isOpen={showNotesDialog} onClose={() => setShowNotesDialog(false)} contactPhone={selectedConversation.phone} contactName={selectedConversation?.name} channelId={selectedConversation?.channelId} onNoteAdded={fetchMessagesAndNotes} />}

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
    </TopNavLayout>
  );
};

export default AtendimentoV2;
