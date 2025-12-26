import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Tag
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

import { QuickResponsesPanel } from "@/components/whatsapp/QuickResponsesPanel";
import { MediaUploadDialog } from "@/components/whatsapp/MediaUploadDialog";
import { TemplateSelector } from "@/components/whatsapp/TemplateSelector";
import { ManualSendDialog } from "@/components/whatsapp/ManualSendDialog";
import { SalesAssistant } from "@/components/whatsapp/SalesAssistant";
import { BalanceIndicator } from "@/components/balance/BalanceIndicator";
import { AddToPortfolioDialog } from "@/components/whatsapp/AddToPortfolioDialog";
import { AssignTagsFromChatDialog } from "@/components/whatsapp/AssignTagsFromChatDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
}

interface Conversation {
  phone: string;
  name: string | null;
  lastMessage: string;
  lastMessageTime: string;
  lastInboundTime: string | null;
  unreadCount: number;
  channelId: string | null;
  status: "pending" | "in_progress" | "resolved" | "archived";
}

interface Channel {
  id: string;
  name: string;
  phone: string;
}

interface QuickResponse {
  shortcut: string | null;
  content: string;
}

const statusConfig = {
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/30" },
  in_progress: { label: "Em atendimento", className: "bg-primary/10 text-primary border-primary/30" },
  resolved: { label: "Resolvido", className: "bg-muted text-muted-foreground border-border" },
  archived: { label: "Arquivado", className: "bg-destructive/10 text-destructive border-destructive/30" }
};

type FilterStatus = "all" | "pending" | "in_progress" | "resolved";

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

const WhatsAppChat = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const [showMediaDialog, setShowMediaDialog] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showManualSendDialog, setShowManualSendDialog] = useState(false);
  const [manualPhoneInput, setManualPhoneInput] = useState("");
  const [showSalesAssistant, setShowSalesAssistant] = useState(false);
  const [showPortfolioDialog, setShowPortfolioDialog] = useState(false);
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [contactTags, setContactTags] = useState<string[]>([]);
  const [quickResponses, setQuickResponses] = useState<QuickResponse[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const playNotificationSound = useNotificationSound();

  // Stored conversation statuses (in localStorage to persist across sessions)
  const [conversationStatuses, setConversationStatuses] = useState<Record<string, Conversation["status"]>>(() => {
    const stored = localStorage.getItem("whatsapp-conversation-statuses");
    return stored ? JSON.parse(stored) : {};
  });

  // Save statuses to localStorage
  useEffect(() => {
    localStorage.setItem("whatsapp-conversation-statuses", JSON.stringify(conversationStatuses));
  }, [conversationStatuses]);

  // Fetch quick responses for shortcut detection
  useEffect(() => {
    const fetchQuickResponses = async () => {
      const { data } = await supabase
        .from("quick_responses")
        .select("shortcut, content")
        .not("shortcut", "is", null);
      
      if (data) {
        setQuickResponses(data);
      }
    };
    
    if (user) {
      fetchQuickResponses();
    }
  }, [user]);

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

  // Fetch channels (Meta Cloud API only)
  useEffect(() => {
    const fetchChannels = async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, phone")
        .eq("provider", "meta")
        .eq("connected", true);

      if (!error && data) {
        setChannels(data);
        if (data.length > 0) {
          setSelectedChannel(data[0]);
        }
      }
    };

    if (user) {
      fetchChannels();
    }
  }, [user]);

  // Fetch all templates for displaying in chat
  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase
        .from("message_templates")
        .select("name, content, variables, components");

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

    if (user) {
      fetchTemplates();
    }
  }, [user]);

  // Fetch conversations
  useEffect(() => {
    const fetchConversations = async () => {
      if (!selectedChannel) {
        console.log("[WhatsAppChat] No selected channel, skipping fetch");
        return;
      }

      setLoading(true);
      console.log("[WhatsAppChat] Fetching conversations for channel:", selectedChannel.id, selectedChannel.name);

      // Fetch all messages (inbound and outbound) to build conversations
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("channel_id", selectedChannel.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[WhatsAppChat] Error fetching conversations:", error);
        setLoading(false);
        return;
      }

      console.log("[WhatsAppChat] Fetched messages:", data?.length, "messages");

      const conversationsMap = new Map<string, Conversation>();
      
      data?.forEach((msg) => {
        // Determine the contact phone - for inbound it's sender_phone, for outbound it's in metadata.destination
        let contactPhone: string;
        let contactName: string | null = null;
        
        if (msg.direction === "inbound") {
          contactPhone = msg.sender_phone;
          contactName = msg.sender_name;
        } else {
          // For outbound messages, the contact is in metadata.destination
          const metadata = msg.metadata as { destination?: string } | null;
          contactPhone = metadata?.destination || "";
          console.log("[WhatsAppChat] Outbound message metadata:", metadata, "contactPhone:", contactPhone);
          // Skip if no destination metadata
          if (!contactPhone) {
            console.log("[WhatsAppChat] Skipping outbound message without destination");
            return;
          }
        }

        // Normalize phone - add + prefix if missing for consistency
        if (!contactPhone.startsWith('+')) {
          contactPhone = '+' + contactPhone;
        }

        if (!conversationsMap.has(contactPhone)) {
          const storedStatus = conversationStatuses[contactPhone];
          conversationsMap.set(contactPhone, {
            phone: contactPhone,
            name: contactName,
            lastMessage: msg.content || "",
            lastMessageTime: msg.created_at,
            lastInboundTime: msg.direction === "inbound" ? msg.created_at : null,
            unreadCount: msg.direction === "inbound" && msg.is_read === false ? 1 : 0,
            channelId: msg.channel_id,
            status: storedStatus || "pending"
          });
          console.log("[WhatsAppChat] Created conversation for:", contactPhone);
        } else {
          const existing = conversationsMap.get(contactPhone)!;
          // Update name if we get it from an inbound message
          if (msg.direction === "inbound" && msg.sender_name && !existing.name) {
            existing.name = msg.sender_name;
          }
          // Track the most recent inbound message time
          if (msg.direction === "inbound" && (!existing.lastInboundTime || new Date(msg.created_at) > new Date(existing.lastInboundTime))) {
            existing.lastInboundTime = msg.created_at;
          }
          // Count unread inbound messages
          if (msg.direction === "inbound" && msg.is_read === false) {
            existing.unreadCount++;
          }
        }
      });

      const convList = Array.from(conversationsMap.values());
      console.log("[WhatsAppChat] Built conversations:", convList.length, convList);
      setConversations(convList);
      setLoading(false);
    };

    fetchConversations();
  }, [selectedChannel, conversationStatuses]);

  // Fetch messages for selected conversation and mark as read
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedConversation || !selectedChannel) return;

      // Normalize the phone number for queries (remove non-digits)
      const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');

      // Fetch all messages for the channel, then filter client-side for more accurate matching
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("channel_id", selectedChannel.id)
        .order("created_at", { ascending: true });

      if (!error && data) {
        // Filter messages that belong to this conversation
        const conversationMessages = data.filter((msg) => {
          if (msg.direction === "inbound") {
            // For inbound, match sender_phone (normalized)
            const msgPhone = msg.sender_phone.replace(/\D/g, '');
            return msgPhone === normalizedPhone;
          } else {
            // For outbound, match metadata.destination (normalized)
            const metadata = msg.metadata as { destination?: string } | null;
            const destPhone = metadata?.destination?.replace(/\D/g, '') || '';
            return destPhone === normalizedPhone;
          }
        });

        setMessages(conversationMessages as Message[]);
        
        // Mark inbound messages as read
        const unreadMessageIds = conversationMessages
          .filter((msg) => msg.direction === "inbound" && msg.is_read === false)
          .map((msg) => msg.id);
        
        if (unreadMessageIds.length > 0) {
          await supabase
            .from("whatsapp_messages")
            .update({ is_read: true })
            .in("id", unreadMessageIds);
        }
      }

      // Mark as in_progress when selected
      if (selectedConversation.status === "pending") {
        updateConversationStatus(selectedConversation.phone, "in_progress");
      }
    };

    fetchMessages();
  }, [selectedConversation, selectedChannel]);

  // Fetch contact tags when conversation is selected
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

  // Real-time subscription for new messages
  useEffect(() => {
    if (!selectedChannel) return;

    const channel = supabase
      .channel('whatsapp-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `channel_id=eq.${selectedChannel.id}`
        },
        (payload) => {
          console.log('New message received:', payload);
          const newMsg = payload.new as Message;
          
          // Determine the contact phone for this message
          let contactPhone: string;
          let contactName: string | null = null;
          
          if (newMsg.direction === "inbound") {
            contactPhone = newMsg.sender_phone;
            contactName = newMsg.sender_name;
          } else {
            const metadata = newMsg.metadata as { destination?: string } | null;
            contactPhone = metadata?.destination || '';
            if (!contactPhone) return; // Skip outbound without destination
          }
          
          // Normalize phone for comparison
          const normalizedContactPhone = contactPhone.replace(/\D/g, '');
          const normalizedSelectedPhone = selectedConversation?.phone.replace(/\D/g, '') || '';
          
          // Show notification only for inbound
          if (newMsg.direction === "inbound") {
            showNotification(newMsg);
            
            // Play sound
            if (soundEnabled) {
              playNotificationSound();
              toast.info(`Nova mensagem de ${contactName || contactPhone}`, {
                description: (newMsg.content || "").substring(0, 50) + ((newMsg.content?.length || 0) > 50 ? "..." : ""),
              });
            }
          }
          
          // Update messages if in current conversation - avoid duplicates
          if (normalizedSelectedPhone === normalizedContactPhone) {
            setMessages(prev => {
              // Check if message already exists (by message_id or exact content+time match for optimistic updates)
              const exists = prev.some(m => 
                m.message_id === newMsg.message_id || 
                m.id === newMsg.id ||
                // For outbound messages, check if we already have an optimistic version
                (newMsg.direction === "outbound" && 
                 m.direction === "outbound" && 
                 m.content === newMsg.content &&
                 m.id.startsWith('temp_'))
              );
              
              if (exists) {
                // Update the optimistic message with real data instead of adding duplicate
                return prev.map(m => {
                  if (m.id.startsWith('temp_') && 
                      m.direction === "outbound" && 
                      m.content === newMsg.content) {
                    return { ...newMsg };
                  }
                  return m;
                });
              }
              
              return [...prev, newMsg];
            });
          }

          // Update conversations list - only for inbound messages to avoid flickering
          if (newMsg.direction === "inbound") {
            setConversations(prev => {
              const existing = prev.find(c => c.phone.replace(/\D/g, '') === normalizedContactPhone);
              if (existing) {
                // If archived and new inbound message comes, move to in_progress
                let newStatus = existing.status;
                if (existing.status === "archived") {
                  newStatus = "in_progress";
                  updateConversationStatus(existing.phone, "in_progress");
                }
                const updated = prev.map(c => 
                  c.phone.replace(/\D/g, '') === normalizedContactPhone 
                    ? { 
                        ...c, 
                        lastMessage: newMsg.content || "", 
                        lastMessageTime: newMsg.created_at,
                        lastInboundTime: newMsg.created_at,
                        unreadCount: normalizedSelectedPhone !== normalizedContactPhone
                          ? c.unreadCount + 1 
                          : c.unreadCount,
                        status: newStatus,
                        name: contactName || c.name
                      }
                    : c
                );
                // Only sort if the updated conversation isn't already at the top
                const updatedIndex = updated.findIndex(c => c.phone.replace(/\D/g, '') === normalizedContactPhone);
                if (updatedIndex > 0) {
                  return updated.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
                }
                return updated;
              } else {
                // Create new conversation for inbound messages
                return [{
                  phone: contactPhone,
                  name: contactName,
                  lastMessage: newMsg.content || "",
                  lastMessageTime: newMsg.created_at,
                  lastInboundTime: newMsg.created_at,
                  unreadCount: 1,
                  channelId: newMsg.channel_id,
                  status: "pending" as const
                }, ...prev];
              }
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannel, selectedConversation, showNotification, soundEnabled, playNotificationSound]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check for quick response shortcuts
  useEffect(() => {
    if (newMessage.startsWith("/")) {
      const shortcut = newMessage.slice(1).toLowerCase();
      const match = quickResponses.find(qr => 
        qr.shortcut?.toLowerCase() === shortcut
      );
      if (match) {
        setNewMessage(match.content);
        toast.success("Resposta rápida aplicada!");
      }
    }
  }, [newMessage, quickResponses]);

  const updateConversationStatus = (phone: string, status: Conversation["status"]) => {
    setConversationStatuses(prev => ({ ...prev, [phone]: status }));
    setConversations(prev => prev.map(c => 
      c.phone === phone ? { ...c, status } : c
    ));
  };

  const handleArchive = (phone: string) => {
    updateConversationStatus(phone, "archived");
    if (selectedConversation?.phone === phone) {
      const nextConv = activeConversations.find(c => c.phone !== phone);
      setSelectedConversation(nextConv || null);
    }
    toast.success("Conversa arquivada");
  };

  const handleRestore = (phone: string) => {
    updateConversationStatus(phone, "in_progress");
    toast.success("Conversa restaurada");
  };

  const handleResolve = (phone: string) => {
    updateConversationStatus(phone, "resolved");
    toast.success("Conversa marcada como resolvida");
  };

  const handleAddToBlacklist = async (conversation: Conversation) => {
    if (!user) {
      toast.error("Erro ao identificar usuário");
      return;
    }

    // Get organization_id from the profile
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !selectedChannel || sendingMessage) return;

    const messageToSend = newMessage.trim();
    setNewMessage(""); // Clear immediately to prevent duplicates
    setSendingMessage(true);

    // Create optimistic message right away for better UX
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const optimisticMessage: Message = {
      id: tempId,
      channel_id: selectedChannel.id,
      message_id: tempId,
      sender_phone: selectedChannel.phone,
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
      const { data, error } = await supabase.functions.invoke('meta-send', {
        body: {
          channelId: selectedChannel.id,
          destination: selectedConversation.phone,
          message: messageToSend,
          messageType: 'text'
        }
      });

      if (error) {
        console.error('Send error:', error);
        toast.error('Erro ao enviar mensagem');
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setNewMessage(messageToSend); // Restore the message
        setSendingMessage(false);
        return;
      }

      if (data.success) {
        // Update optimistic message with real ID and status
        setMessages(prev => prev.map(m => 
          m.id === tempId 
            ? { ...m, message_id: data.messageId, status: "sent" }
            : m
        ));
      } else {
        toast.error(data.error || 'Erro ao enviar mensagem');
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setNewMessage(messageToSend); // Restore the message
      }
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Erro ao enviar mensagem');
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setNewMessage(messageToSend); // Restore the message
    }

    setSendingMessage(false);
  };

  const handleSendMedia = async (mediaData: {
    mediaType: string;
    mediaUrl: string;
    mediaCaption?: string;
    fileName?: string;
  }) => {
    if (!selectedConversation || !selectedChannel) return;

    setSendingMessage(true);

    try {
      const { data, error } = await supabase.functions.invoke('meta-send', {
        body: {
          channelId: selectedChannel.id,
          destination: selectedConversation.phone,
          messageType: mediaData.mediaType,
          mediaUrl: mediaData.mediaUrl,
          caption: mediaData.mediaCaption
        }
      });

      if (error) {
        console.error('Send media error:', error);
        toast.error('Erro ao enviar mídia');
        setSendingMessage(false);
        return;
      }

      if (data.success) {
        const optimisticMessage: Message = {
          id: `temp_${Date.now()}`,
          channel_id: selectedChannel.id,
          message_id: data.messageId,
          sender_phone: selectedChannel.phone,
          sender_name: null,
          message_type: mediaData.mediaType,
          content: mediaData.mediaCaption || `[${mediaData.mediaType}]`,
          media_url: mediaData.mediaUrl,
          direction: "outbound",
          status: "sent",
          created_at: new Date().toISOString(),
          metadata: { destination: selectedConversation.phone }
        };
        setMessages(prev => [...prev, optimisticMessage]);
        toast.success("Mídia enviada!");
      } else {
        toast.error(data.error || 'Erro ao enviar mídia');
      }
    } catch (err) {
      console.error('Send media error:', err);
      toast.error('Erro ao enviar mídia');
    }

    setSendingMessage(false);
  };

  const handleSendTemplate = async (templateName: string, templateParams: string[]) => {
    if (!selectedConversation || !selectedChannel) return;

    setSendingMessage(true);

    try {
      const { data, error } = await supabase.functions.invoke('meta-send', {
        body: {
          channelId: selectedChannel.id,
          destination: selectedConversation.phone,
          messageType: 'template',
          templateName,
          templateParams
        }
      });

      if (error) {
        console.error('Send template error:', error);
        toast.error('Erro ao enviar template');
        setSendingMessage(false);
        return;
      }

      if (data.success) {
        const optimisticMessage: Message = {
          id: `temp_${Date.now()}`,
          channel_id: selectedChannel.id,
          message_id: data.messageId,
          sender_phone: selectedChannel.phone,
          sender_name: null,
          message_type: "template",
          content: `Template: ${templateName}`,
          media_url: null,
          direction: "outbound",
          status: "sent",
          created_at: new Date().toISOString(),
          metadata: { destination: selectedConversation.phone, templateName, templateParams }
        };
        setMessages(prev => [...prev, optimisticMessage]);
        toast.success("Template enviado!");
      } else {
        toast.error(data.error || 'Erro ao enviar template');
      }
    } catch (err) {
      console.error('Send template error:', err);
      toast.error('Erro ao enviar template');
    }

    setSendingMessage(false);
  };

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "HH:mm");
  };

  const formatConversationDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return "Ontem";
    return format(date, "dd/MM", { locale: ptBR });
  };

  const renderMessageContent = (message: Message) => {
    const isMedia = ["image", "video", "audio", "document", "file", "sticker"].includes(message.message_type);
    
    if (isMedia && message.media_url) {
      switch (message.message_type) {
        case "image":
        case "sticker":
          return (
            <div className="space-y-1">
              <img 
                src={message.media_url} 
                alt="Media" 
                className="max-w-full rounded-lg max-h-60 object-cover"
              />
              {message.content && message.content !== `[${message.message_type}]` && (
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          );
        case "video":
          return (
            <div className="space-y-1">
              <video 
                src={message.media_url} 
                controls 
                className="max-w-full rounded-lg max-h-60"
              />
              {message.content && message.content !== "[video]" && (
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          );
        case "audio":
          return (
            <audio src={message.media_url} controls className="max-w-full" />
          );
        case "document":
        case "file":
          return (
            <a 
              href={message.media_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm underline"
            >
              <FileText className="w-4 h-4" />
              {message.content || "Documento"}
            </a>
          );
        default:
          return <p className="text-sm whitespace-pre-wrap">{message.content}</p>;
      }
    }

    // Check if it's a template message
    if (message.message_type === "template" || message.content?.startsWith("Template:")) {
      // Get template name from content or metadata
      const metadata = message.metadata as { templateName?: string; templateParams?: string[] } | null;
      let templateName = metadata?.templateName || "";
      const templateParams = metadata?.templateParams || [];
      
      // Extract template name from content if not in metadata
      if (!templateName && message.content?.startsWith("Template:")) {
        templateName = message.content.replace("Template:", "").trim();
      }

      // Get template content from our cached templates
      const templateData = templates.get(templateName);
      
      if (templateData) {
        // Replace {{1}}, {{2}}, etc. with actual params
        let displayContent = templateData.content;
        templateParams.forEach((param, index) => {
          const placeholder = `{{${index + 1}}}`;
          displayContent = displayContent.replace(placeholder, param);
        });

        // Also replace *[VARIABLE]* style placeholders if any remain
        displayContent = displayContent.replace(/\*?\[[A-Z_]+\]\*?/g, (match) => {
          // Just show the placeholder as-is if not replaced
          return match;
        });

        // Get buttons from components
        const buttons = templateData.components?.buttons || [];

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/80 mb-1">
              <FileText className="w-3 h-3" />
              <span className="font-medium">{templateName}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
            
            {/* Render buttons if any */}
            {buttons.length > 0 && (
              <div className="flex flex-col gap-1 pt-2 border-t border-border/30">
                {buttons.map((button, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-center gap-2 py-1.5 px-3 rounded bg-background/20 text-xs font-medium text-center"
                  >
                    {button.type === "URL" && (
                      <>
                        <span className="text-primary">🔗</span>
                        <span>{button.text}</span>
                      </>
                    )}
                    {button.type === "PHONE_NUMBER" && (
                      <>
                        <Phone className="w-3 h-3 text-primary" />
                        <span>{button.text}</span>
                      </>
                    )}
                    {button.type === "QUICK_REPLY" && (
                      <span>{button.text}</span>
                    )}
                    {!["URL", "PHONE_NUMBER", "QUICK_REPLY"].includes(button.type) && (
                      <span>{button.text}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      
      // Fallback: show original content if template not found
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
            <FileText className="w-3 h-3" />
            <span>{templateName || "Template"}</span>
          </div>
          <p className="text-sm text-muted-foreground italic">Template não encontrado</p>
        </div>
      );
    }

    return <p className="text-sm whitespace-pre-wrap">{message.content}</p>;
  };

  // Active conversations (not archived)
  const activeConversations = conversations.filter(conv => conv.status !== "archived");
  
  // Archived conversations
  const archivedConversations = conversations.filter(conv => conv.status === "archived");

  // Filter active conversations by search and status
  const filteredConversations = activeConversations.filter(conv => {
    const matchesSearch = conv.phone.includes(searchTerm) || 
      conv.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || conv.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Filter archived conversations by search
  const filteredArchived = archivedConversations.filter(conv =>
    conv.phone.includes(searchTerm) || 
    conv.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get counts for filter badges
  const pendingCount = activeConversations.filter(c => c.status === "pending").length;
  const inProgressCount = activeConversations.filter(c => c.status === "in_progress").length;
  const resolvedCount = activeConversations.filter(c => c.status === "resolved").length;

  // Get conversation context for Sales Assistant
  const conversationContext = messages.map(m => 
    `${m.direction === 'inbound' ? 'Cliente' : 'Atendente'}: ${m.content}`
  ).join('\n');

  // Check if 24-hour window has expired
  const isWindowExpired = useMemo(() => {
    if (!selectedConversation?.lastInboundTime) return true;
    const lastInbound = new Date(selectedConversation.lastInboundTime);
    const now = new Date();
    const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 24;
  }, [selectedConversation?.lastInboundTime]);

  // Calculate time remaining in window
  const windowTimeRemaining = useMemo(() => {
    if (!selectedConversation?.lastInboundTime) return null;
    const lastInbound = new Date(selectedConversation.lastInboundTime);
    const expiresAt = new Date(lastInbound.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }, [selectedConversation?.lastInboundTime]);

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)] gap-4 animate-fade-in w-full">
        {/* Conversations List */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 shrink-0 bg-card rounded-lg border border-border flex flex-col overflow-hidden",
          selectedConversation ? "hidden md:flex" : "flex"
        )}>
          {/* Header */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">WhatsApp</h2>
              <div className="flex items-center gap-2">
                <BalanceIndicator />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? "Desativar som" : "Ativar som"}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-primary" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={notificationsEnabled ? () => setNotificationsEnabled(false) : requestNotificationPermission}
                  className={cn("h-8 w-8", notificationsEnabled ? "text-primary" : "text-muted-foreground")}
                >
                  {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                className="pl-10 bg-muted/30 border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {/* Status Filter Buttons */}
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={filterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("all")}
                className="text-xs px-3 h-7"
              >
                Todos
              </Button>
              <Button
                variant={filterStatus === "pending" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("pending")}
                className="text-xs px-3 h-7 gap-1.5"
              >
                <Clock className="w-3 h-3 shrink-0" />
                Pendentes
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] shrink-0">
                    {pendingCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant={filterStatus === "in_progress" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("in_progress")}
                className="text-xs px-3 h-7 gap-1.5"
              >
                <Play className="w-3 h-3 shrink-0" />
                Em Andamento
                {inProgressCount > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] shrink-0">
                    {inProgressCount}
                  </Badge>
                )}
              </Button>
            </div>
            
            {/* Atendimentos Fechados */}
            <Button
              variant={filterStatus === "resolved" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterStatus("resolved")}
              className="w-full text-xs h-7 gap-1.5 justify-start text-muted-foreground hover:text-foreground"
            >
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              Atendimentos Fechados
              {resolvedCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] shrink-0 ml-auto">
                  {resolvedCount}
                </Badge>
              )}
            </Button>

            {channels.length > 1 && (
              <select
                className="w-full p-2 rounded-md bg-muted/30 border border-border text-sm"
                value={selectedChannel?.id || ""}
                onChange={(e) => setSelectedChannel(channels.find(c => c.id === e.target.value) || null)}
              >
                {channels.map(channel => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name} ({channel.phone})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Conversations */}
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {loading ? (
                <div className="p-4 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Carregando...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma conversa encontrada</p>
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <div
                    key={conversation.phone}
                    className={cn(
                      "group relative",
                      selectedConversation?.phone === conversation.phone && "bg-muted/30 border-l-2 border-l-primary"
                    )}
                  >
                    <button
                      onClick={() => setSelectedConversation(conversation)}
                      className="w-full p-4 text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className="bg-emerald-500/10 text-emerald-500 text-sm font-semibold">
                            {conversation.name ? conversation.name.split(" ").map(n => n[0]).join("") : <User className="w-4 h-4" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-foreground text-sm truncate">
                              {conversation.name || conversation.phone}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatConversationDate(conversation.lastMessageTime)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mb-2">
                            {conversation.lastMessage}
                          </p>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className={cn("text-xs", statusConfig[conversation.status].className)}>
                              {statusConfig[conversation.status].label}
                            </Badge>
                            {conversation.unreadCount > 0 && (
                              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">
                                {conversation.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    {/* Archive button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchive(conversation.phone);
                      }}
                      title="Arquivar conversa"
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Archived Section */}
          {archivedConversations.length > 0 && (
            <div className="border-t border-border">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="w-full p-3 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  <span>Arquivados</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {archivedConversations.length}
                  </Badge>
                </div>
                {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              {showArchived && (
                <ScrollArea className="max-h-48">
                  <div className="divide-y divide-border bg-muted/20">
                    {filteredArchived.map((conv) => (
                      <div
                        key={conv.phone}
                        className="group relative p-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
                              {conv.name ? conv.name.split(" ").map(n => n[0]).join("") : <User className="w-3 h-3" />}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-muted-foreground text-sm truncate block">
                              {conv.name || conv.phone}
                            </span>
                            <span className="text-xs text-muted-foreground/70">
                              {formatConversationDate(conv.lastMessageTime)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRestore(conv.phone)}
                            title="Restaurar conversa"
                          >
                            <RotateCcw className="w-3 h-3 text-muted-foreground hover:text-primary" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className={cn(
          "flex-1 bg-card rounded-lg border border-border flex flex-col overflow-hidden",
          !selectedConversation ? "hidden md:flex" : "flex"
        )}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-emerald-500/10 text-emerald-500 font-semibold">
                      {selectedConversation.name ? selectedConversation.name.split(" ").map(n => n[0]).join("") : <User className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">
                      {selectedConversation.name || selectedConversation.phone}
                    </h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {selectedConversation.phone}
                    </p>
                    {contactTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {contactTags.slice(0, 3).map((tag) => (
                          <Badge 
                            key={tag} 
                            variant="outline" 
                            className="text-[10px] h-4 px-1.5 bg-muted/50"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {contactTags.length > 3 && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-muted/50">
                            +{contactTags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showQuickResponses ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowQuickResponses(!showQuickResponses)}
                    className="gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    <span className="hidden sm:inline">Rápidas</span>
                  </Button>
                  <Button
                    variant={showSalesAssistant ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowSalesAssistant(!showSalesAssistant)}
                    className="gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline">IA</span>
                  </Button>
                  <Badge variant="outline" className={cn(statusConfig[selectedConversation.status].className)}>
                    {statusConfig[selectedConversation.status].label}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setShowPortfolioDialog(true)}>
                        <Briefcase className="w-4 h-4 mr-2" />
                        Adicionar à Carteira
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTagsDialog(true)}>
                        <Tag className="w-4 h-4 mr-2" />
                        Atribuir Tags
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleResolve(selectedConversation.phone)}>
                        <CheckCheck className="w-4 h-4 mr-2" />
                        Marcar como resolvido
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(selectedConversation.phone)}>
                        <Archive className="w-4 h-4 mr-2" />
                        Arquivar conversa
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleAddToBlacklist(selectedConversation)}
                        className="text-warning"
                      >
                        <Ban className="w-4 h-4 mr-2" />
                        Adicionar à Lista Negra
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        message.direction === "outbound" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg px-4 py-2",
                          message.direction === "outbound"
                            ? "bg-emerald-500 text-white"
                            : "bg-muted"
                        )}
                      >
                        {renderMessageContent(message)}
                        <div className={cn(
                          "flex items-center justify-end gap-1 mt-1",
                          message.direction === "outbound" ? "text-white/70" : "text-muted-foreground"
                        )}>
                          <span className="text-xs">{formatMessageTime(message.created_at)}</span>
                          {message.direction === "outbound" && (
                            message.status === "read" ? (
                              <CheckCheck className="w-3 h-3 text-blue-400" />
                            ) : message.status === "delivered" ? (
                              <CheckCheck className="w-3 h-3" />
                            ) : message.status === "sent" ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t border-border space-y-2">
                {/* 24-hour window indicator */}
                {isWindowExpired ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p className="text-sm">
                      Janela de 24h expirada. Use um <button 
                        onClick={() => setShowTemplateSelector(true)}
                        className="font-semibold underline hover:no-underline"
                      >template aprovado</button> para iniciar uma nova conversa.
                    </p>
                  </div>
                ) : windowTimeRemaining && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>Janela de resposta expira em {windowTimeRemaining}</span>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <Paperclip className="w-5 h-5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => setShowMediaDialog(true)} disabled={isWindowExpired}>
                        <Image className="w-4 h-4 mr-2" />
                        Enviar mídia
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTemplateSelector(true)}>
                        <FileText className="w-4 h-4 mr-2" />
                        Enviar template
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Textarea
                    placeholder={isWindowExpired ? "Use um template para iniciar a conversa..." : "Digite sua mensagem... (use /atalho para respostas rápidas)"}
                    className={cn(
                      "min-h-[44px] max-h-32 resize-none bg-muted/30",
                      isWindowExpired && "opacity-50 cursor-not-allowed"
                    )}
                    value={newMessage}
                    onChange={(e) => !isWindowExpired && setNewMessage(e.target.value)}
                    disabled={isWindowExpired}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !isWindowExpired) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  {isWindowExpired ? (
                    <Button 
                      onClick={() => setShowTemplateSelector(true)}
                      className="h-11 px-4"
                    >
                      <FileText className="w-5 h-5" />
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={!newMessage.trim() || sendingMessage}
                      className="h-11 px-4"
                    >
                      {sendingMessage ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Empty state */}
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma conversa selecionada</h3>
                  <p className="text-sm">Selecione uma conversa ou envie uma mensagem manual</p>
                </div>
              </div>
              
              {/* Manual Send Footer */}
              <div className="p-4 border-t border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex items-center justify-center px-3 h-10 bg-muted rounded-md border border-border text-sm font-medium text-muted-foreground shrink-0">
                      +55
                    </div>
                    <Input
                      placeholder="DDD + Número (ex: 11999999999)"
                      className="flex-1"
                      value={manualPhoneInput}
                      onChange={(e) => setManualPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    />
                  </div>
                  <Button 
                    onClick={() => setShowManualSendDialog(true)}
                    className="gap-2 shrink-0"
                    disabled={!manualPhoneInput.trim()}
                  >
                    <FileText className="w-4 h-4" />
                    Selecionar Template
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Responses Panel */}
        <QuickResponsesPanel
          isOpen={showQuickResponses}
          onClose={() => setShowQuickResponses(false)}
          onSelectResponse={(content) => setNewMessage(content)}
        />


        {/* Media Upload Dialog */}
        <MediaUploadDialog
          isOpen={showMediaDialog}
          onClose={() => setShowMediaDialog(false)}
          onSend={handleSendMedia}
        />

        {/* Template Selector */}
        <TemplateSelector
          isOpen={showTemplateSelector}
          onClose={() => setShowTemplateSelector(false)}
          onSend={handleSendTemplate}
          channelId={selectedChannel?.id || null}
        />

        {/* Sales Assistant */}
        <SalesAssistant
          isOpen={showSalesAssistant}
          onClose={() => setShowSalesAssistant(false)}
          customerName={selectedConversation?.name || selectedConversation?.phone}
          conversationContext={messages.map(m => 
            `${m.direction === 'inbound' ? (m.sender_name || 'Cliente') : 'Atendente'}: ${m.content || '[mídia]'}`
          ).join('\n')}
        />

        {/* Portfolio Dialog */}
        {selectedConversation && (
          <AddToPortfolioDialog
            open={showPortfolioDialog}
            onOpenChange={setShowPortfolioDialog}
            contactPhone={selectedConversation.phone}
            contactName={selectedConversation.name}
          />
        )}

        {/* Tags Dialog */}
        {selectedConversation && (
          <AssignTagsFromChatDialog
            open={showTagsDialog}
            onOpenChange={setShowTagsDialog}
            contactPhone={selectedConversation.phone}
            contactName={selectedConversation.name}
            onSuccess={() => {
              // Refresh contact tags
              const normalizedPhone = selectedConversation.phone.replace(/\D/g, '');
              supabase
                .from("leads")
                .select("tags")
                .eq("phone", normalizedPhone)
                .single()
                .then(({ data }) => {
                  if (data?.tags) {
                    setContactTags(data.tags);
                  }
                });
            }}
          />
        )}

        {/* Manual Send Dialog */}
        <ManualSendDialog
          isOpen={showManualSendDialog}
          onClose={() => {
            setShowManualSendDialog(false);
            setManualPhoneInput("");
          }}
          channels={channels}
          selectedChannel={selectedChannel}
          onChannelChange={setSelectedChannel}
          initialPhone={manualPhoneInput}
          onPhoneUsed={() => setManualPhoneInput("")}
        />
      </div>
    </MainLayout>
  );
};

export default WhatsAppChat;
