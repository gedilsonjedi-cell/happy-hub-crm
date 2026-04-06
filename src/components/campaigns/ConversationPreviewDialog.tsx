import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink,
  Loader2,
  Check,
  CheckCheck,
  Clock,
  MessageSquare,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  content: string | null;
  direction: string;
  created_at: string;
  status: string | null;
  message_type: string;
  media_url: string | null;
  channel_id: string | null;
}

interface ConversationPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  name: string | null;
  channelId?: string | null;
  organizationId?: string | null;
}

export function ConversationPreviewDialog({
  open,
  onOpenChange,
  phone,
  name,
  channelId,
  organizationId,
}: ConversationPreviewDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [foundChannelId, setFoundChannelId] = useState<string | null>(null);

  const normalizedPhone = phone.replace(/\D/g, "");
  const phoneEnd = normalizedPhone.slice(-8);

  useEffect(() => {
    if (open && phone) {
      fetchMessages();
    } else {
      setMessages([]);
      setFoundChannelId(null);
    }
  }, [open, phone]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      // Use provided organizationId or fetch from user profile
      let orgId = organizationId;
      
      if (!orgId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", user?.id)
          .single();
        
        orgId = profile?.organization_id;
      }

      if (!orgId) return;

      // Get channels for this organization
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", orgId);

      if (!channels || channels.length === 0) return;

      const channelIds = channels.map((c) => c.id);

      // Query inbound messages by sender_phone suffix
      const inboundPromise = supabase
        .from("whatsapp_messages")
        .select("id, content, direction, created_at, status, message_type, media_url, channel_id, sender_phone, metadata")
        .in("channel_id", channelIds)
        .eq("direction", "inbound")
        .like("sender_phone", `%${phoneEnd}`)
        .order("created_at", { ascending: true })
        .limit(200);

      // Query outbound messages by metadata destination suffix
      const outboundPromise = supabase
        .from("whatsapp_messages")
        .select("id, content, direction, created_at, status, message_type, media_url, channel_id, sender_phone, metadata")
        .in("channel_id", channelIds)
        .eq("direction", "outbound")
        .like("metadata->>destination", `%${phoneEnd}`)
        .order("created_at", { ascending: true })
        .limit(200);

      const [inboundResult, outboundResult] = await Promise.all([inboundPromise, outboundPromise]);

      if (inboundResult.error) throw inboundResult.error;
      if (outboundResult.error) throw outboundResult.error;

      // Merge and sort by created_at ascending
      const filteredMessages = [...(inboundResult.data || []), ...(outboundResult.data || [])]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Map to remove metadata from the display object but keep content
      const displayMessages = filteredMessages.map((msg) => {
        const msgMetadata = msg.metadata as Record<string, unknown> | null;
        const templateContent = msgMetadata?.templateContent as string | undefined;
        
        return {
          id: msg.id,
          content: templateContent || msg.content,
          direction: msg.direction,
          created_at: msg.created_at,
          status: msg.status,
          message_type: msg.message_type,
          media_url: msg.media_url,
          channel_id: msg.channel_id,
        };
      });

      setMessages(displayMessages);
      
      // Store the channel_id from the most recent message
      if (displayMessages.length > 0) {
        const lastMessage = displayMessages[displayMessages.length - 1];
        setFoundChannelId(lastMessage.channel_id);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "HH:mm", { locale: ptBR });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return "Hoje";
    if (isYesterday(date)) return "Ontem";
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "read":
        return <CheckCheck className="w-3 h-3 text-blue-400" />;
      case "delivered":
        return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
      case "sent":
        return <Check className="w-3 h-3 text-muted-foreground" />;
      default:
        return <Clock className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const handleOpenChat = () => {
    onOpenChange(false);
    // Navigate to AtendimentoV2 with phone filter and channel if found
    const params = new URLSearchParams({ phone: normalizedPhone });
    if (foundChannelId) {
      params.set("channelId", foundChannelId);
    }
    navigate(`/atendimento-v2?${params.toString()}`);
  };

  const formatPhoneDisplay = (p: string) => {
    const cleaned = p.replace(/\D/g, "");
    if (cleaned.length >= 12) {
      const ddd = cleaned.slice(2, 4);
      const firstPart = cleaned.slice(4, cleaned.length - 4);
      const lastPart = cleaned.slice(-4);
      return `(${ddd}) ${firstPart}-${lastPart}`;
    }
    return p;
  };

  // Group messages by date
  const groupedMessages = messages.reduce<Record<string, Message[]>>((acc, msg) => {
    const dateKey = formatDate(msg.created_at);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(msg);
    return acc;
  }, {});

  // Find first message date for header info
  const firstMessageDate = messages.length > 0 
    ? format(new Date(messages[0].created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 bg-muted">
              <AvatarFallback className="text-sm font-medium">
                {(name || "N")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-lg text-foreground flex items-center gap-2">
                {name?.startsWith("LeadWhats-") ? "[NOVO]" : ""} {formatPhoneDisplay(phone)}
                <Badge variant="secondary" className="ml-2">
                  <MessageSquare className="w-3 h-3 mr-1" />
                  WhatsApp
                </Badge>
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
              <p>Nenhuma mensagem encontrada</p>
            </div>
          ) : (
            <>
              {/* Timeline header */}
              {firstMessageDate && (
                <div className="flex items-center justify-center gap-2 py-3 px-4">
                  <Separator className="flex-1" />
                  <Button variant="outline" size="sm" className="text-xs h-7 gap-1" disabled>
                    Ver conversa anterior
                  </Button>
                  <Separator className="flex-1" />
                </div>
              )}

              {firstMessageDate && (
                <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  Atendimento iniciado em <span className="font-medium text-foreground">{firstMessageDate}</span> no canal
                </div>
              )}

              <ScrollArea className="flex-1 px-4">
                <div className="space-y-4 py-4">
                  {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
                    <div key={dateKey}>
                      <div className="flex justify-center mb-3">
                        <Badge variant="outline" className="text-xs">
                          {dateKey}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {msgs.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex",
                              msg.direction === "outbound" ? "justify-end" : "justify-start"
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[80%] rounded-lg px-3 py-2 shadow-sm",
                                msg.direction === "outbound"
                                  ? "bg-primary text-primary-foreground rounded-br-none"
                                  : "bg-muted text-foreground rounded-bl-none"
                              )}
                            >
                              {msg.message_type === "image" && msg.media_url ? (
                                <img 
                                  src={msg.media_url} 
                                  alt="Imagem" 
                                  className="max-w-full rounded mb-1"
                                />
                              ) : msg.message_type === "audio" ? (
                                <div className="flex items-center gap-2 text-sm">
                                  🎵 Áudio
                                </div>
                              ) : msg.message_type === "video" ? (
                                <div className="flex items-center gap-2 text-sm">
                                  🎬 Vídeo
                                </div>
                              ) : msg.message_type === "document" ? (
                                <div className="flex items-center gap-2 text-sm">
                                  📄 Documento
                                </div>
                              ) : null}
                              
                              {msg.content && (
                                <p className="text-sm whitespace-pre-wrap break-words">
                                  {msg.content}
                                </p>
                              )}
                              
                              <div className={cn(
                                "flex items-center gap-1 mt-1",
                                msg.direction === "outbound" ? "justify-end" : "justify-start"
                              )}>
                                <span className="text-[10px] opacity-70">
                                  {formatTime(msg.created_at)}
                                </span>
                                {msg.direction === "outbound" && getStatusIcon(msg.status)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handleOpenChat} className="gap-2">
            <ExternalLink className="w-4 h-4" />
            Abrir atendimento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
