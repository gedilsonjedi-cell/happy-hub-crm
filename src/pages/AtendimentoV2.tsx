import { useState, useEffect, useRef, useMemo } from "react";
import { 
  MessageSquare, 
  Send, 
  Search,
  MoreVertical,
  Loader2,
  Check,
  CheckCheck,
  Clock,
  Archive,
  Filter,
  ArrowUpDown,
  Settings,
  Plus,
  Mic,
  File
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
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}

interface Conversation {
  phone: string;
  name: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  channelId: string | null;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  sectorId: string | null;
}

interface Channel {
  id: string;
  name: string;
  phone: string;
  provider: string;
}

type FilterTab = "new" | "mine" | "others";

const AtendimentoV2 = () => {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const { hasFullAccess, canSeeSector } = useUserSectors();
  const { isAdmin, isSupervisor } = useUserRole();
  
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("new");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const canSeeOthers = hasFullAccess || isAdmin || isSupervisor;

  const conversations = useMemo(() => {
    // First filter by sector visibility (using RLS on backend, but also filter on frontend for security)
    let filtered = allConversations.filter(conv => canSeeSector(conv.sectorId));
    
    // Then apply user access filter
    if (!canSeeOthers) {
      filtered = filtered.filter(conv => !conv.assignedTo || conv.assignedTo === user?.id);
    }
    switch (filterTab) {
      case "new": return filtered.filter(c => !c.assignedTo);
      case "mine": return filtered.filter(c => c.assignedTo === user?.id);
      case "others": return canSeeOthers ? filtered.filter(c => c.assignedTo && c.assignedTo !== user?.id) : [];
      default: return filtered;
    }
  }, [allConversations, filterTab, user?.id, canSeeOthers, canSeeSector]);

  const counts = useMemo(() => {
    // Filter by sector visibility first
    const sectorFiltered = allConversations.filter(conv => canSeeSector(conv.sectorId));
    const accessible = canSeeOthers ? sectorFiltered : sectorFiltered.filter(conv => !conv.assignedTo || conv.assignedTo === user?.id);
    return {
      new: accessible.filter(c => !c.assignedTo).length,
      mine: accessible.filter(c => c.assignedTo === user?.id).length,
      others: canSeeOthers ? accessible.filter(c => c.assignedTo && c.assignedTo !== user?.id).length : 0,
    };
  }, [allConversations, user?.id, canSeeOthers, canSeeSector]);

  useEffect(() => {
    const fetchChannels = async () => {
      if (!effectiveOrganizationId) return;
      const { data } = await supabase
        .from("channels")
        .select("id, name, phone, provider")
        .eq("organization_id", effectiveOrganizationId)
        .in("provider", ["meta", "zapi"])
        .eq("connected", true);
      if (data) {
        setChannels(data);
        if (data.length > 0) setSelectedChannel(data[0]);
      }
    };
    if (user && effectiveOrganizationId) fetchChannels();
  }, [user, effectiveOrganizationId]);

  useEffect(() => {
    const fetchConversations = async () => {
      if (!selectedChannel) return;
      setLoading(true);
      const { data: messagesData } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("channel_id", selectedChannel.id)
        .order("created_at", { ascending: false });

      const { data: assignments } = await supabase
        .from("conversation_assignments")
        .select("conversation_phone, assigned_to, status, sector_id")
        .eq("channel_id", selectedChannel.id);

      const assignmentMap = new Map(assignments?.map(a => [a.conversation_phone, { assignedTo: a.assigned_to, status: a.status, sectorId: a.sector_id }]) || []);
      const conversationMap = new Map<string, Conversation>();
      
      messagesData?.forEach(msg => {
        const phone = msg.sender_phone;
        const assignment = assignmentMap.get(phone);
        if (!conversationMap.has(phone)) {
          conversationMap.set(phone, {
            phone,
            name: msg.sender_name,
            lastMessage: msg.content || `[${msg.message_type}]`,
            lastMessageTime: msg.created_at,
            unreadCount: msg.direction === "inbound" && msg.status !== "read" ? 1 : 0,
            channelId: selectedChannel.id,
            status: assignment?.status || "pending",
            assignedTo: assignment?.assignedTo || null,
            assignedToName: null,
            sectorId: assignment?.sectorId || null,
          });
        } else if (msg.direction === "inbound" && msg.status !== "read") {
          conversationMap.get(phone)!.unreadCount++;
        }
      });

      setAllConversations(Array.from(conversationMap.values()).sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()));
      setLoading(false);
    };
    fetchConversations();
  }, [selectedChannel]);

  useEffect(() => {
    if (!selectedConversation || !selectedChannel) { setMessages([]); return; }
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("channel_id", selectedChannel.id)
        .eq("sender_phone", selectedConversation.phone)
        .order("created_at", { ascending: true });
      setMessages((data as Message[]) || []);
    };
    fetchMessages();
  }, [selectedConversation, selectedChannel]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !selectedChannel || sendingMessage) return;
    setSendingMessage(true);
    const content = newMessage;
    setNewMessage("");
    try {
      const fn = selectedChannel.provider === "zapi" ? "zapi-send" : "meta-send";
      await supabase.functions.invoke(fn, { body: { channelId: selectedChannel.id, to: selectedConversation.phone, type: "text", content } });
    } catch { toast.error("Erro ao enviar"); setNewMessage(content); }
    finally { setSendingMessage(false); }
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return "Ontem";
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  };

  const filtered = conversations.filter(c => c.phone.includes(searchTerm) || c.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <TopNavLayout>
      <div className="h-8 bg-primary/10 border-b border-primary/20 flex items-center px-4 text-sm text-primary shrink-0">
        <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-xs">i</span>Ative as notificações na web</span>
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="w-[380px] border-r border-border flex flex-col bg-card min-h-0">
          <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
            <Button variant={filterTab === "new" ? "default" : "ghost"} size="sm" onClick={() => setFilterTab("new")} className="gap-1">Novos{counts.new > 0 && <Badge className="bg-destructive text-destructive-foreground text-[10px] px-1.5 rounded-full">{counts.new}</Badge>}</Button>
            <Button variant={filterTab === "mine" ? "default" : "ghost"} size="sm" onClick={() => setFilterTab("mine")}>Meus</Button>
            {canSeeOthers && <Button variant={filterTab === "others" ? "default" : "ghost"} size="sm" onClick={() => setFilterTab("others")}>Outros</Button>}
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8"><Archive className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
          </div>
          <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar atendimento" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-background border-border h-9" /></div>
            <Button variant="ghost" size="icon" className="h-9 w-9"><Filter className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9"><ArrowUpDown className="w-4 h-4" /></Button>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><MessageSquare className="w-12 h-12 mb-2 opacity-50" /><p className="text-sm">Nenhuma conversa</p></div> : filtered.map(conv => (
              <div key={conv.phone} onClick={() => setSelectedConversation(conv)} className={cn("flex items-start gap-3 p-3 border-b border-border cursor-pointer hover:bg-muted/50", selectedConversation?.phone === conv.phone && "bg-muted")}>
                <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary/10 text-primary text-sm">{(conv.name || conv.phone)?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="font-medium text-foreground truncate">{conv.name || conv.phone}</span></div><p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p></div>
                <div className="flex flex-col items-end gap-1"><Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-primary text-primary-foreground border-primary">Geral</Badge><div className="flex items-center gap-1"><span className="text-xs text-muted-foreground">{formatTime(conv.lastMessageTime)}</span>{conv.unreadCount > 0 && <Badge className="bg-destructive text-destructive-foreground text-[10px] px-1.5 h-5 min-w-[20px] flex items-center justify-center rounded-full">{conv.unreadCount}</Badge>}</div></div>
              </div>
            ))}
          </ScrollArea>
          <div className="p-3 border-t border-border flex items-center gap-2 shrink-0"><Select defaultValue="+55"><SelectTrigger className="w-20 h-9"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-border"><SelectItem value="+55">+55</SelectItem></SelectContent></Select><Input placeholder="(00) 0000-0000" className="flex-1 h-9 bg-background border-border" /><Button size="sm" variant="outline" className="h-9">Conversar</Button></div>
        </div>
        <div className="flex-1 flex flex-col bg-background min-h-0">
          {selectedConversation ? (
            <>
              <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
                <div className="flex items-center gap-3"><Avatar className="h-9 w-9"><AvatarFallback className="bg-primary/10 text-primary">{(selectedConversation.name || selectedConversation.phone)?.[0]?.toUpperCase()}</AvatarFallback></Avatar><div><p className="font-medium text-foreground">{selectedConversation.name || selectedConversation.phone}</p><p className="text-xs text-muted-foreground">{selectedConversation.phone}</p></div></div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <div className="space-y-3 max-w-3xl mx-auto">
                  {messages.map(msg => {
                    const out = msg.direction === "outbound";
                    return (<div key={msg.id} className={cn("flex", out ? "justify-end" : "justify-start")}><div className={cn("max-w-[70%] rounded-lg px-3 py-2", out ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}{msg.media_url && <img src={msg.media_url} alt="" className="max-w-full rounded max-h-48" />}<div className={cn("flex items-center gap-1 mt-1 text-[10px]", out ? "text-primary-foreground/70 justify-end" : "text-muted-foreground")}><span>{format(new Date(msg.created_at), "HH:mm")}</span>{out && (msg.status === "read" ? <CheckCheck className="w-3 h-3 text-blue-400" /> : msg.status === "delivered" ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}</div></div></div>);
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>
              <div className="border-t border-border p-3 bg-card shrink-0">
                <div className="flex items-center gap-2 max-w-3xl mx-auto">
                  <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} placeholder="Digite sua mensagem..." className="flex-1 min-h-[40px] max-h-32 resize-none bg-background border-border" rows={1} />
                  <Button onClick={handleSendMessage} disabled={sendingMessage || !newMessage.trim()} size="icon">{sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground"><MessageSquare className="w-16 h-16 mb-4 opacity-30" /><p className="text-lg">Escolha um atendimento para iniciar a conversa</p></div>
          )}
        </div>
      </div>
    </TopNavLayout>
  );
};

export default AtendimentoV2;
