import { useState, useEffect, useRef, useCallback } from "react";
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
  CheckCheck,
  Clock
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

interface Message {
  id: string;
  channel_id: string | null;
  message_id: string;
  sender_phone: string;
  sender_name: string | null;
  message_type: string;
  content: string | null;
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
  unreadCount: number;
  channelId: string | null;
}

interface Channel {
  id: string;
  name: string;
  phone: string;
}

const WhatsAppChat = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

      // Play notification sound
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [notificationsEnabled]);

  // Fetch channels
  useEffect(() => {
    const fetchChannels = async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, phone")
        .eq("provider", "gupshup")
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

  // Fetch conversations
  useEffect(() => {
    const fetchConversations = async () => {
      if (!selectedChannel) return;

      setLoading(true);

      // Get unique conversations from messages
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("channel_id", selectedChannel.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversations:", error);
        setLoading(false);
        return;
      }

      // Group by sender phone
      const conversationsMap = new Map<string, Conversation>();
      
      data?.forEach((msg) => {
        if (!conversationsMap.has(msg.sender_phone)) {
          conversationsMap.set(msg.sender_phone, {
            phone: msg.sender_phone,
            name: msg.sender_name,
            lastMessage: msg.content || "",
            lastMessageTime: msg.created_at,
            unreadCount: msg.status === "received" ? 1 : 0,
            channelId: msg.channel_id
          });
        } else {
          const existing = conversationsMap.get(msg.sender_phone)!;
          if (msg.status === "received") {
            existing.unreadCount++;
          }
        }
      });

      setConversations(Array.from(conversationsMap.values()));
      setLoading(false);
    };

    fetchConversations();
  }, [selectedChannel]);

  // Fetch messages for selected conversation
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedConversation || !selectedChannel) return;

      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("channel_id", selectedChannel.id)
        .or(`sender_phone.eq.${selectedConversation.phone},and(direction.eq.outbound,metadata->>destination.eq.${selectedConversation.phone.replace(/\D/g, '')})`)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data as Message[]);
      }
    };

    fetchMessages();
  }, [selectedConversation, selectedChannel]);

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
          
          // Show notification
          showNotification(newMsg);
          
          // Update messages if in current conversation
          if (selectedConversation?.phone === newMsg.sender_phone) {
            setMessages(prev => [...prev, newMsg]);
          }

          // Update conversations list
          setConversations(prev => {
            const existing = prev.find(c => c.phone === newMsg.sender_phone);
            if (existing) {
              return prev.map(c => 
                c.phone === newMsg.sender_phone 
                  ? { 
                      ...c, 
                      lastMessage: newMsg.content || "", 
                      lastMessageTime: newMsg.created_at,
                      unreadCount: selectedConversation?.phone !== newMsg.sender_phone 
                        ? c.unreadCount + 1 
                        : c.unreadCount
                    }
                  : c
              ).sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
            } else {
              return [{
                phone: newMsg.sender_phone,
                name: newMsg.sender_name,
                lastMessage: newMsg.content || "",
                lastMessageTime: newMsg.created_at,
                unreadCount: 1,
                channelId: newMsg.channel_id
              }, ...prev];
            }
          });

          // Play sound for new incoming messages
          if (newMsg.direction === "inbound" && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannel, selectedConversation, showNotification]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !selectedChannel) return;

    setSendingMessage(true);

    try {
      const { data, error } = await supabase.functions.invoke('gupshup-send', {
        body: {
          channelId: selectedChannel.id,
          destination: selectedConversation.phone,
          message: newMessage.trim()
        }
      });

      if (error) {
        console.error('Send error:', error);
        toast.error('Erro ao enviar mensagem');
        setSendingMessage(false);
        return;
      }

      if (data.success) {
        setNewMessage("");
        toast.success("Mensagem enviada!");
        
        // Add message optimistically
        const optimisticMessage: Message = {
          id: `temp_${Date.now()}`,
          channel_id: selectedChannel.id,
          message_id: data.messageId,
          sender_phone: selectedChannel.phone,
          sender_name: null,
          message_type: "text",
          content: newMessage.trim(),
          direction: "outbound",
          status: "sent",
          created_at: new Date().toISOString(),
          metadata: { destination: selectedConversation.phone }
        };
        setMessages(prev => [...prev, optimisticMessage]);
      } else {
        toast.error(data.error || 'Erro ao enviar mensagem');
      }
    } catch (err) {
      console.error('Send error:', err);
      toast.error('Erro ao enviar mensagem');
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

  const filteredConversations = conversations.filter(c => 
    c.phone.includes(searchTerm) || 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout>
      {/* Hidden audio element for notifications */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0AT6jYzJxzKBJAn9/e04dXNzNpr+HOoXpTG0Si4d7PmXxXLz6r6eHCi2E9LGW07OPFkWg7KV235uS+hWAyI124" type="audio/wav"/>
      </audio>

      <div className="flex h-[calc(100vh-7rem)] bg-card rounded-lg border border-border overflow-hidden">
        {/* Conversations List */}
        <div className={cn(
          "w-80 border-r border-border flex flex-col",
          selectedConversation ? "hidden md:flex" : "flex"
        )}>
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-foreground">Conversas</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={notificationsEnabled ? () => setNotificationsEnabled(false) : requestNotificationPermission}
                className={cn(
                  "h-8 w-8",
                  notificationsEnabled ? "text-primary" : "text-muted-foreground"
                )}
              >
                {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                className="pl-9 bg-muted/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {channels.length > 1 && (
              <select
                className="mt-3 w-full p-2 rounded-md bg-muted/30 border border-border text-sm"
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
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Carregando...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma conversa ainda</p>
                <p className="text-sm mt-1">As mensagens recebidas aparecerão aqui</p>
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.phone}
                  onClick={() => setSelectedConversation(conversation)}
                  className={cn(
                    "flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors border-b border-border/50",
                    selectedConversation?.phone === conversation.phone && "bg-muted/50"
                  )}
                >
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <User className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground truncate">
                        {conversation.name || conversation.phone}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatConversationDate(conversation.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground truncate">
                        {conversation.lastMessage}
                      </p>
                      {conversation.unreadCount > 0 && (
                        <Badge className="ml-2 bg-primary text-primary-foreground text-xs px-1.5 min-w-[20px] justify-center">
                          {conversation.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col",
          !selectedConversation ? "hidden md:flex" : "flex"
        )}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">
                    {selectedConversation.name || selectedConversation.phone}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {selectedConversation.phone}
                  </p>
                </div>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="w-5 h-5" />
                </Button>
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
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <div className={cn(
                          "flex items-center justify-end gap-1 mt-1",
                          message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          <span className="text-xs">{formatMessageTime(message.created_at)}</span>
                          {message.direction === "outbound" && (
                            message.status === "sent" ? (
                              <CheckCheck className="w-3 h-3" />
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

              {/* Input */}
              <div className="p-4 border-t border-border">
                <div className="flex items-end gap-2">
                  <Textarea
                    placeholder="Digite sua mensagem..."
                    className="min-h-[44px] max-h-32 resize-none bg-muted/30"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
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
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma conversa selecionada</h3>
                <p className="text-sm">Selecione uma conversa para começar a responder</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default WhatsAppChat;
