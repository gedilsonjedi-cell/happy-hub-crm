import { useState, useEffect } from "react";
import { 
  History, 
  Phone,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Loader2,
  FileText,
  Image,
  Video,
  Music
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  content: string | null;
  message_type: string;
  direction: string;
  created_at: string;
  status: string | null;
}

interface ChannelConversation {
  channelId: string;
  channelName: string;
  channelPhone: string;
  messageCount: number;
  lastMessageTime: string;
  messages: Message[];
  isExpanded: boolean;
}

interface ChannelHistoryDialogProps {
  contactPhone: string;
  currentChannelId: string | null;
  organizationId: string | null;
  trigger?: React.ReactNode;
}

export const ChannelHistoryDialog = ({
  contactPhone,
  currentChannelId,
  organizationId,
  trigger
}: ChannelHistoryDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<ChannelConversation[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return `Ontem ${format(date, "HH:mm")}`;
    return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  const normalizePhone = (phone: string) => phone.replace(/\D/g, '');

  const fetchChannelHistory = async () => {
    if (!contactPhone || !organizationId) return;
    
    setLoading(true);
    const normalizedPhone = normalizePhone(contactPhone);
    const phoneWithPlus = `+${normalizedPhone}`;
    
    try {
      // Get all channels for this organization
      const { data: channels, error: channelsError } = await supabase
        .from('channels')
        .select('id, name, phone')
        .eq('organization_id', organizationId) as { data: { id: string; name: string; phone: string }[] | null; error: Error | null };
      
      if (channelsError || !channels) {
        console.error('Error fetching channels:', channelsError);
        setLoading(false);
        return;
      }
      
      // For each channel (except current), check if there are messages
      const channelConversations: ChannelConversation[] = [];
      
      for (const channel of channels) {
        if (channel.id === currentChannelId) continue;
        
        // Check for messages in this channel for this contact
        const { count, error: countError } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', channel.id)
          .or(
            `and(direction.eq.inbound,or(sender_phone.eq.${normalizedPhone},sender_phone.eq.${phoneWithPlus})),` +
            `and(direction.eq.outbound,or(metadata->>destination.eq.${normalizedPhone},metadata->>destination.eq.${phoneWithPlus}))`
          );
        
        if (countError) {
          console.error('Error counting messages:', countError);
          continue;
        }
        
        if (count && count > 0) {
          // Get last message time
          const { data: lastMsg } = await supabase
            .from('whatsapp_messages')
            .select('created_at')
            .eq('channel_id', channel.id)
            .or(
              `and(direction.eq.inbound,or(sender_phone.eq.${normalizedPhone},sender_phone.eq.${phoneWithPlus})),` +
              `and(direction.eq.outbound,or(metadata->>destination.eq.${normalizedPhone},metadata->>destination.eq.${phoneWithPlus}))`
            )
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          channelConversations.push({
            channelId: channel.id,
            channelName: channel.name,
            channelPhone: channel.phone,
            messageCount: count,
            lastMessageTime: lastMsg?.created_at || new Date().toISOString(),
            messages: [],
            isExpanded: false
          });
        }
      }
      
      // Sort by last message time (most recent first)
      channelConversations.sort((a, b) => 
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      );
      
      setConversations(channelConversations);
    } catch (err) {
      console.error('Error fetching channel history:', err);
    }
    
    setLoading(false);
  };

  const loadChannelMessages = async (channelId: string) => {
    const normalizedPhone = normalizePhone(contactPhone);
    const phoneWithPlus = `+${normalizedPhone}`;
    
    setLoadingMessages(channelId);
    
    try {
      const [inboundResult, outboundResult] = await Promise.all([
        supabase
          .from('whatsapp_messages')
          .select('id, content, message_type, direction, created_at, status')
          .eq('channel_id', channelId)
          .eq('direction', 'inbound')
          .or(`sender_phone.eq.${normalizedPhone},sender_phone.eq.${phoneWithPlus}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('whatsapp_messages')
          .select('id, content, message_type, direction, created_at, status')
          .eq('channel_id', channelId)
          .eq('direction', 'outbound')
          .or(`metadata->>destination.eq.${normalizedPhone},metadata->>destination.eq.${phoneWithPlus}`)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);
      
      const allMessages = [
        ...(inboundResult.data || []),
        ...(outboundResult.data || [])
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setConversations(prev => prev.map(conv => 
        conv.channelId === channelId 
          ? { ...conv, messages: allMessages as Message[], isExpanded: true }
          : conv
      ));
    } catch (err) {
      console.error('Error loading channel messages:', err);
    }
    
    setLoadingMessages(null);
  };

  const toggleChannel = (channelId: string) => {
    const conv = conversations.find(c => c.channelId === channelId);
    if (!conv) return;
    
    if (conv.isExpanded) {
      // Just collapse
      setConversations(prev => prev.map(c => 
        c.channelId === channelId ? { ...c, isExpanded: false } : c
      ));
    } else if (conv.messages.length === 0) {
      // Load messages first, then expand
      loadChannelMessages(channelId);
    } else {
      // Already loaded, just expand
      setConversations(prev => prev.map(c => 
        c.channelId === channelId ? { ...c, isExpanded: true } : c
      ));
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'image':
      case 'sticker':
        return <Image className="w-3 h-3" />;
      case 'video':
        return <Video className="w-3 h-3" />;
      case 'audio':
        return <Music className="w-3 h-3" />;
      case 'document':
      case 'file':
        return <FileText className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getMessagePreview = (msg: Message) => {
    if (msg.message_type === 'template' || msg.content?.startsWith('Template:')) {
      return msg.content || '[Template]';
    }
    if (['image', 'sticker'].includes(msg.message_type)) return '[Imagem]';
    if (msg.message_type === 'video') return '[Vídeo]';
    if (msg.message_type === 'audio') return '[Áudio]';
    if (['document', 'file'].includes(msg.message_type)) return '[Documento]';
    return msg.content || '';
  };

  useEffect(() => {
    if (isOpen && contactPhone && organizationId) {
      fetchChannelHistory();
    }
  }, [isOpen, contactPhone, organizationId]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <History className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Histórico em Outros Números
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Phone className="w-4 h-4" />
            <span>Contato: {contactPhone}</span>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum histórico encontrado em outros números</p>
              <p className="text-xs mt-1">Este contato só tem conversas no número atual</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] -mx-2 px-2">
              <div className="space-y-2">
                {conversations.map(conv => (
                  <div key={conv.channelId} className="border border-border rounded-lg overflow-hidden">
                    <button
                      className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      onClick={() => toggleChannel(conv.channelId)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Phone className="w-5 h-5 text-primary" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-sm">{conv.channelName}</p>
                          <p className="text-xs text-muted-foreground">{conv.channelPhone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {conv.messageCount} msgs
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(conv.lastMessageTime)}
                        </span>
                        {loadingMessages === conv.channelId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : conv.isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                    </button>
                    
                    {conv.isExpanded && conv.messages.length > 0 && (
                      <div className="border-t border-border bg-muted/30 p-2 space-y-1 max-h-[200px] overflow-y-auto">
                        {conv.messages.slice(0, 20).map(msg => (
                          <div 
                            key={msg.id}
                            className={cn(
                              "flex items-start gap-2 p-2 rounded text-xs",
                              msg.direction === 'inbound' 
                                ? "bg-muted" 
                                : "bg-primary/10 ml-4"
                            )}
                          >
                            {getMessageIcon(msg.message_type)}
                            <div className="flex-1 min-w-0">
                              <p className="truncate">{getMessagePreview(msg)}</p>
                            </div>
                            <span className="text-muted-foreground shrink-0">
                              {format(new Date(msg.created_at), "dd/MM HH:mm")}
                            </span>
                          </div>
                        ))}
                        {conv.messages.length > 20 && (
                          <p className="text-center text-xs text-muted-foreground py-2">
                            +{conv.messages.length - 20} mensagens anteriores
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
