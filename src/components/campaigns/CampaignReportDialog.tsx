import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorInfo, extractErrorCode } from "@/lib/metaErrorMessages";
import {
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  MessageSquare,
  AlertTriangle,
  PhoneOff,
  TrendingUp,
  Calendar,
  Timer,
  Play,
  Pause,
  Loader2,
  Download,
  Search,
  RefreshCw,
  ExternalLink,
  Eye,
  CheckCheck,
  MessageCircle,
  Target,
  RotateCcw,
  Smartphone,
  Building2,
  Save,
} from "lucide-react";
import { SectorFilter } from "@/components/whatsapp/SectorFilter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ConversationPreviewDialog } from "./ConversationPreviewDialog";
import { RecycleFailuresDialog } from "./RecycleFailuresDialog";

interface Campaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  scheduled_at?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  min_interval?: number;
  max_interval?: number;
  team?: string | null;
  chatbot_enabled?: boolean;
  organization_id?: string | null;
  sector_id?: string | null;
}

interface Recipient {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  error_message: string | null;
  last_error_code: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  button_clicked: string | null;
  button_clicked_at: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
  channel_id: string | null;
}

interface CampaignReportDialogProps {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecycleSuccess?: () => void;
  onCampaignUpdated?: () => void;
}

// Recipient status display config
const recipientStatusConfig: Record<string, { label: string; className: string; icon: typeof MessageSquare }> = {
  pending: { label: "Na fila", className: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Aguardando Meta", className: "bg-warning/80 text-warning-foreground", icon: Clock },
  delivered: { label: "Entregue", className: "bg-success/80 text-success-foreground", icon: CheckCheck },
  read: { label: "Lida", className: "bg-chart-3 text-chart-foreground", icon: Eye },
  failed: { label: "Falha", className: "bg-destructive text-destructive-foreground", icon: XCircle },
  waiting_retry: { label: "Aguardando Retry", className: "bg-chart-4/80 text-chart-foreground", icon: Clock },
  no_whatsapp: { label: "Sem WhatsApp", className: "bg-warning text-warning-foreground", icon: PhoneOff },
};

// Classification based on error codes
function classifyError(errorMessage: string | null, errorCode: string | null): string {
  if (!errorMessage && !errorCode) return "normal";
  
  const lowerError = (errorMessage || "").toLowerCase();
  const code = errorCode || "";
  
  if (lowerError.includes("não possui whatsapp") || lowerError.includes("not on whatsapp") || code === "131026") {
    return "no_whatsapp";
  }
  if (lowerError.includes("número inválido") || lowerError.includes("invalid") || code === "131021") {
    return "invalid_number";
  }
  if (lowerError.includes("bloqueado") || lowerError.includes("blocked") || code === "131047") {
    return "blocked";
  }
  if (lowerError.includes("template") || code === "132001" || code === "132000") {
    return "template_error";
  }
  
  return "api_error";
}

const classificationLabels: Record<string, string> = {
  normal: "Normal",
  no_whatsapp: "Sem WhatsApp",
  invalid_number: "Número Inválido",
  blocked: "Bloqueado",
  template_error: "Erro de Template",
  api_error: "Erro de API",
};

export function CampaignReportDialog({ campaign, open, onOpenChange, onRecycleSuccess, onCampaignUpdated }: CampaignReportDialogProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [previewPhone, setPreviewPhone] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewChannelId, setPreviewChannelId] = useState<string | null>(null);
  const [previewSentAt, setPreviewSentAt] = useState<string | null>(null);

  const openPreview = (r: { phone: string; name: string | null; channel_id?: string | null; sent_at?: string | null }) => {
    setPreviewPhone(r.phone);
    setPreviewName(r.name);
    setPreviewChannelId(r.channel_id ?? null);
    setPreviewSentAt(r.sent_at ?? null);
  };
  const [showRecycleDialog, setShowRecycleDialog] = useState(false);
  const [campaignChannels, setCampaignChannels] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [savingSector, setSavingSector] = useState(false);
  const [sectorChanged, setSectorChanged] = useState(false);

  useEffect(() => {
    if (campaign) {
      setSelectedSectorId(campaign.sector_id || null);
      setSectorChanged(false);
    }
  }, [campaign?.id, open]);

  const handleSectorChange = useCallback((sectorId: string | null) => {
    setSelectedSectorId(sectorId);
    setSectorChanged(sectorId !== (campaign?.sector_id || null));
  }, [campaign?.sector_id]);

  const handleSaveSector = useCallback(async () => {
    if (!campaign) return;
    setSavingSector(true);
    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ sector_id: selectedSectorId })
        .eq('id', campaign.id);

      if (error) throw error;

      toast.success('Departamento atualizado com sucesso!');
      setSectorChanged(false);
      onCampaignUpdated?.();
    } catch (err) {
      console.error('Error updating sector:', err);
      toast.error('Erro ao atualizar departamento');
    } finally {
      setSavingSector(false);
    }
  }, [campaign, selectedSectorId, onCampaignUpdated]);

  useEffect(() => {
    if (open && campaign) {
      fetchRecipients();
      fetchCampaignChannels();
      
      // Set up realtime subscription for live updates
      const channel = supabase
        .channel(`campaign-recipients-${campaign.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'campaign_recipients',
            filter: `campaign_id=eq.${campaign.id}`,
          },
          (payload) => {
            console.log('Realtime update:', payload);
            
            if (payload.eventType === 'UPDATE') {
              setRecipients((prev) =>
                prev.map((r) =>
                  r.id === payload.new.id
                    ? { ...r, ...payload.new as Recipient }
                    : r
                )
              );
            } else if (payload.eventType === 'INSERT') {
              setRecipients((prev) => [...prev, payload.new as Recipient]);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setRecipients([]);
      setSearchTerm("");
      setStatusFilter("all");
      setClassificationFilter("all");
      setCampaignChannels([]);
    }
  }, [open, campaign?.id]);

  const fetchCampaignChannels = async () => {
    if (!campaign) return;
    try {
      const { data: ccData } = await supabase
        .from("campaign_channels")
        .select("channel_id")
        .eq("campaign_id", campaign.id);

      if (ccData && ccData.length > 0) {
        const channelIds = ccData.map(cc => cc.channel_id);
        const { data: channelsData } = await (supabase as any)
          .from("channels_public")
          .select("id, name, phone")
          .in("id", channelIds);

        setCampaignChannels(channelsData || []);
      }
    } catch (error) {
      console.error("Error fetching campaign channels:", error);
    }
  };

  const fetchRecipients = async () => {
    if (!campaign) return;

    setLoading(true);
    try {
      // Pagina em lotes de 1000 (limite default do PostgREST). Sem isso,
      // campanhas grandes ficam truncadas e a exportação/reciclagem perde
      // destinatários — exatamente o que causa "números faltando" ou
      // discrepâncias entre a planilha original e a exportada.
      const PAGE = 1000;
      const all: Recipient[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("campaign_recipients")
          .select("id, phone, name, status, error_message, last_error_code, sent_at, delivered_at, read_at, button_clicked, button_clicked_at, retry_count, next_retry_at, channel_id")
          .eq("campaign_id", campaign.id)
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);

        if (error) throw error;
        const batch = (data || []) as Recipient[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      setRecipients(all);
    } catch (error) {
      console.error("Error fetching recipients:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = recipients.length;
    const pending = recipients.filter(r => r.status === "pending").length;
    
    // NEW: Waiting for retry (scheduled to retry later)
    const waitingRetry = recipients.filter(r => r.status === "waiting_retry").length;
    
    // "sent" means Meta accepted the message - includes delivered and read
    const sentToMeta = recipients.filter(r => r.status === "sent" || r.status === "delivered" || r.status === "read").length;
    
    // Actually delivered (confirmed by Meta webhook)
    const delivered = recipients.filter(r => r.status === "delivered" || r.status === "read" || r.delivered_at).length;
    
    // Waiting for Meta confirmation (sent but not delivered/failed yet)
    const awaitingConfirmation = recipients.filter(r => 
      r.status === "sent" && !r.delivered_at && !r.read_at
    ).length;
    
    const read = recipients.filter(r => r.status === "read" || r.read_at).length;
    const clicked = recipients.filter(r => r.button_clicked).length;
    const failed = recipients.filter(r => r.status === "failed").length;
    const noWhatsApp = recipients.filter(r => classifyError(r.error_message, r.last_error_code) === "no_whatsapp").length;
    const invalidNumber = recipients.filter(r => classifyError(r.error_message, r.last_error_code) === "invalid_number").length;
    const blocked = recipients.filter(r => classifyError(r.error_message, r.last_error_code) === "blocked").length;
    const templateError = recipients.filter(r => classifyError(r.error_message, r.last_error_code) === "template_error").length;
    const apiError = recipients.filter(r => classifyError(r.error_message, r.last_error_code) === "api_error").length;
    const processed = sentToMeta + failed + waitingRetry;

    return {
      total,
      pending,
      waitingRetry,
      sent: sentToMeta,
      awaitingConfirmation,
      delivered,
      read,
      clicked,
      failed,
      noWhatsApp,
      invalidNumber,
      blocked,
      templateError,
      apiError,
      processed,
      pendingPercent: total > 0 ? Math.round((pending / total) * 100) : 0,
      waitingRetryPercent: total > 0 ? Math.round((waitingRetry / total) * 100) : 0,
      sentPercent: total > 0 ? Math.round((sentToMeta / total) * 100) : 0,
      awaitingPercent: total > 0 ? Math.round((awaitingConfirmation / total) * 100) : 0,
      deliveredPercent: total > 0 ? Math.round((delivered / total) * 100) : 0,
      readPercent: total > 0 ? Math.round((read / total) * 100) : 0,
      clickedPercent: total > 0 ? Math.round((clicked / total) * 100) : 0,
      failedPercent: total > 0 ? Math.round((failed / total) * 100) : 0,
      engagementRate: sentToMeta > 0 ? Math.round((clicked / sentToMeta) * 100) : 0,
      deliveryRate: sentToMeta > 0 ? Math.round((delivered / sentToMeta) * 100) : 0,
    };
  }, [recipients]);

  // Button click breakdown
  const buttonClicks = useMemo(() => {
    const clicks: Record<string, number> = {};
    recipients.forEach(r => {
      if (r.button_clicked) {
        clicks[r.button_clicked] = (clicks[r.button_clicked] || 0) + 1;
      }
    });
    return Object.entries(clicks).map(([button, count]) => ({
      button,
      count,
      percent: recipients.length > 0 ? Math.round((count / recipients.length) * 100) : 0,
    }));
  }, [recipients]);

  // Per-channel breakdown
  const channelBreakdown = useMemo(() => {
    const map = new Map<string, {
      channelId: string;
      total: number; sent: number; delivered: number; read: number;
      failed: number; pending: number; awaiting: number; clicked: number;
    }>();
    const ensure = (id: string) => {
      if (!map.has(id)) map.set(id, {
        channelId: id, total: 0, sent: 0, delivered: 0, read: 0,
        failed: 0, pending: 0, awaiting: 0, clicked: 0,
      });
      return map.get(id)!;
    };
    recipients.forEach(r => {
      const id = r.channel_id || "__unassigned__";
      const e = ensure(id);
      e.total++;
      if (r.status === "pending") e.pending++;
      if (r.status === "failed") e.failed++;
      if (r.status === "sent" || r.status === "delivered" || r.status === "read") e.sent++;
      if (r.status === "sent" && !r.delivered_at && !r.read_at) e.awaiting++;
      if (r.status === "delivered" || r.status === "read" || r.delivered_at) e.delivered++;
      if (r.status === "read" || r.read_at) e.read++;
      if (r.button_clicked) e.clicked++;
    });
    return Array.from(map.values());
  }, [recipients]);

  // Detailed error breakdown by Meta error code
  const errorBreakdown = useMemo(() => {
    const map = new Map<string, {
      code: string; title: string; description: string; suggestion: string; link?: string;
      count: number; samples: Recipient[];
    }>();
    recipients.filter(r => r.status === "failed").forEach(r => {
      const code = r.last_error_code || extractErrorCode(r.error_message) || "UNKNOWN";
      if (!map.has(code)) {
        const info = getErrorInfo(r.error_message || `Erro ${code}`);
        map.set(code, {
          code,
          title: info.title,
          description: info.description,
          suggestion: info.suggestion || "Sem sugestão disponível.",
          link: info.link,
          count: 0,
          samples: [],
        });
      }
      const entry = map.get(code)!;
      entry.count++;
      if (entry.samples.length < 5) entry.samples.push(r);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [recipients]);

  // Filter recipients
  const filteredRecipients = useMemo(() => {
    return recipients.filter(r => {
      const matchesSearch = searchTerm === "" || 
        r.phone.includes(searchTerm) || 
        (r.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || 
        r.status === statusFilter ||
        (statusFilter === "clicked" && !!r.button_clicked);
      
      const classification = classifyError(r.error_message, r.last_error_code);
      const effectiveStatus = classification === "no_whatsapp" ? "no_whatsapp" : r.status;
      
      const matchesClassification = classificationFilter === "all" || 
        classification === classificationFilter ||
        (classificationFilter === "no_whatsapp" && effectiveStatus === "no_whatsapp");
      
      return matchesSearch && matchesStatus && matchesClassification;
    });
  }, [recipients, searchTerm, statusFilter, classificationFilter]);

  // Export functions
  const exportToCSV = (data: Recipient[], filename: string) => {
    const headers = ["Telefone", "Nome", "Status", "Erro", "Enviado em", "Entregue em", "Lido em", "Botão Clicado", "Clicado em"];
    const rows = data.map(r => [
      r.phone,
      r.name || "",
      r.status,
      r.error_message || "",
      r.sent_at || "",
      r.delivered_at || "",
      r.read_at || "",
      r.button_clicked || "",
      r.button_clicked_at || "",
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  };

  const handleExportAll = () => {
    exportToCSV(recipients, `campanha-${campaign?.name || "relatorio"}-todos`);
  };

  const handleExportFiltered = () => {
    let suffix = "";
    if (statusFilter !== "all") suffix += `-${statusFilter}`;
    if (classificationFilter !== "all") suffix += `-${classificationFilter}`;
    exportToCSV(filteredRecipients, `campanha-${campaign?.name || "relatorio"}${suffix}`);
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length >= 12) {
      const ddd = cleaned.slice(2, 4);
      const firstPart = cleaned.slice(4, cleaned.length - 4);
      const lastPart = cleaned.slice(-4);
      return `(${ddd}) ${firstPart}-${lastPart}`;
    }
    return phone;
  };

  const getRecipientDisplayStatus = (recipient: Recipient) => {
    const classification = classifyError(recipient.error_message, recipient.last_error_code);
    if (classification === "no_whatsapp") return recipientStatusConfig.no_whatsapp;
    if (recipient.status === "waiting_retry") return recipientStatusConfig.waiting_retry;
    if (recipient.read_at) return recipientStatusConfig.read;
    if (recipient.delivered_at) return recipientStatusConfig.delivered;
    return recipientStatusConfig[recipient.status] || recipientStatusConfig.pending;
  };
  
  // Format next retry time for display
  const formatNextRetry = (nextRetryAt: string | null) => {
    if (!nextRetryAt) return "";
    const retryDate = new Date(nextRetryAt);
    const now = new Date();
    const hoursUntil = Math.round((retryDate.getTime() - now.getTime()) / 3600000);
    if (hoursUntil <= 0) return "Em breve";
    if (hoursUntil < 24) return `Em ${hoursUntil}h`;
    const days = Math.round(hoursUntil / 24);
    return `Em ${days}d`;
  };

  if (!campaign) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl bg-card border-border max-h-[95vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl text-foreground">{campaign.name}</DialogTitle>
              <Badge variant="outline" className="text-xs">
                Relatório Detalhado
              </Badge>
            </div>
            {/* Recycle Button - Show when campaign is completed and has failures OR awaiting messages */}
            {(campaign.status === "completed" || campaign.status === "paused") && 
              (metrics.failed > 0 || metrics.awaitingConfirmation > 0) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-warning/50 text-warning hover:bg-warning/10 hover:text-warning"
                onClick={() => setShowRecycleDialog(true)}
              >
                <RotateCcw className="w-4 h-4" />
                Reenviar {metrics.failed + metrics.awaitingConfirmation} não entregues
              </Button>
            )}
          </div>
          <DialogDescription className="text-muted-foreground">
            Métricas de conversão e lista de destinatários
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0" viewportClassName="max-h-[calc(95vh-120px)]">
          <div className="space-y-6">
            {/* Campaign Channels Used */}
            {campaignChannels.length > 0 && (
              <div className="bg-muted/20 rounded-lg p-4 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">Canais utilizados no disparo</h3>
                  <Badge variant="outline" className="text-xs">{campaignChannels.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {campaignChannels.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 border border-border"
                    >
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <div>
                        <p className="text-xs font-medium text-foreground">{ch.name}</p>
                        <p className="text-[10px] text-muted-foreground">{ch.phone}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Visão geral</TabsTrigger>
                <TabsTrigger value="channels">
                  Por canal {channelBreakdown.length > 0 && `(${channelBreakdown.length})`}
                </TabsTrigger>
                <TabsTrigger value="errors">
                  Falhas detalhadas {errorBreakdown.length > 0 && `(${errorBreakdown.length})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 mt-4">
            {/* Conversion Funnel + Engagement Card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Conversion Funnel */}
              <div className="lg:col-span-2 bg-muted/20 rounded-lg p-4 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Funil de conversão</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">Confira a efetividade desta campanha</p>
                
                <div className="space-y-3">
                  {/* Total */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24">Total</span>
                    <div className="flex-1 h-7 bg-primary/80 rounded flex items-center justify-between px-2">
                      <span className="text-xs text-primary-foreground font-medium">100%</span>
                      <span className="text-xs text-primary-foreground">{metrics.total}</span>
                    </div>
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Processadas (Sent + Failed) */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24">Processadas</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      {metrics.processed > 0 && (
                        <div 
                          className="h-full bg-chart-3 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.processed / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-chart-foreground font-medium">
                            {Math.round((metrics.processed / metrics.total) * 100)}%
                          </span>
                          <span className="text-xs text-chart-foreground">{metrics.processed}</span>
                        </div>
                      )}
                    </div>
                    <Send className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Enviadas (successfully sent to Meta) */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24">Enviadas</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      {metrics.sent > 0 && (
                        <div 
                          className="h-full bg-chart-2 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.sent / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-chart-foreground font-medium">
                            {metrics.sentPercent}%
                          </span>
                          <span className="text-xs text-chart-foreground">{metrics.sent}</span>
                        </div>
                      )}
                    </div>
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Aguardando confirmação da Meta - THE KEY NEW METRIC */}
                  {metrics.awaitingConfirmation > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-warning w-24 font-medium">⏳ Aguardando</span>
                      <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                        <div 
                          className="h-full bg-warning flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.awaitingConfirmation / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-warning-foreground font-medium">{metrics.awaitingPercent}%</span>
                          <span className="text-xs text-warning-foreground">{metrics.awaitingConfirmation}</span>
                        </div>
                      </div>
                      <Clock className="w-4 h-4 text-warning" />
                    </div>
                  )}
                  
                  {/* Delivered */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24">Entregues</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      {metrics.delivered > 0 && (
                        <div 
                          className="h-full bg-success flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.delivered / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-success-foreground font-medium">{metrics.deliveredPercent}%</span>
                          <span className="text-xs text-success-foreground">{metrics.delivered}</span>
                        </div>
                      )}
                    </div>
                    <CheckCheck className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Read */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24">Lidas</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      {metrics.read > 0 && (
                        <div 
                          className="h-full bg-chart-3 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.read / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-chart-foreground font-medium">{metrics.readPercent}%</span>
                          <span className="text-xs text-chart-foreground">{metrics.read}</span>
                        </div>
                      )}
                    </div>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Interacted */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24">Engajadas</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      {metrics.clicked > 0 && (
                        <div 
                          className="h-full bg-chart-5 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.clicked / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-chart-foreground font-medium">{metrics.clickedPercent}%</span>
                          <span className="text-xs text-chart-foreground">{metrics.clicked}</span>
                        </div>
                      )}
                    </div>
                    <MessageCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Waiting Retry Section - NEW */}
                  {metrics.waitingRetry > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-chart-4 w-24 font-medium">⏳ Retry Agend.</span>
                      <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                        <div 
                          className="h-full bg-chart-4 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.waitingRetry / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-chart-foreground font-medium">{metrics.waitingRetryPercent}%</span>
                          <span className="text-xs text-chart-foreground">{metrics.waitingRetry}</span>
                        </div>
                      </div>
                      <Clock className="w-4 h-4 text-chart-4" />
                    </div>
                  )}
                  
                  {/* Failed Section */}
                  {metrics.failed > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-24">Falhas</span>
                      <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                        <div 
                          className="h-full bg-destructive flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.failed / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-destructive-foreground font-medium">{metrics.failedPercent}%</span>
                          <span className="text-xs text-destructive-foreground">{metrics.failed}</span>
                        </div>
                      </div>
                      <XCircle className="w-4 h-4 text-destructive" />
                    </div>
                  )}
                </div>
                
                {/* Failure breakdown */}
                {metrics.failed > 0 && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Detalhes das falhas:</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {metrics.noWhatsApp > 0 && (
                        <div className="flex justify-between bg-warning/20 text-warning px-2 py-1 rounded">
                          <span>Sem WhatsApp</span>
                          <span className="font-bold">{metrics.noWhatsApp}</span>
                        </div>
                      )}
                      {metrics.invalidNumber > 0 && (
                        <div className="flex justify-between bg-chart-4/20 text-chart-4 px-2 py-1 rounded">
                          <span>Número Inválido</span>
                          <span className="font-bold">{metrics.invalidNumber}</span>
                        </div>
                      )}
                      {metrics.blocked > 0 && (
                        <div className="flex justify-between bg-destructive/20 text-destructive px-2 py-1 rounded">
                          <span>Bloqueado</span>
                          <span className="font-bold">{metrics.blocked}</span>
                        </div>
                      )}
                      {metrics.templateError > 0 && (
                        <div className="flex justify-between bg-destructive/20 text-destructive px-2 py-1 rounded">
                          <span>Erro de Template</span>
                          <span className="font-bold">{metrics.templateError}</span>
                        </div>
                      )}
                      {metrics.apiError > 0 && (
                        <div className="flex justify-between bg-neutral/20 text-neutral px-2 py-1 rounded">
                          <span>Erro de API</span>
                          <span className="font-bold">{metrics.apiError}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Engagement Card */}
              <div className="bg-muted/20 rounded-lg p-4 border border-border flex flex-col text-center">
                <Target className="w-8 h-8 text-primary mb-2 mx-auto" />
                <p className="text-4xl font-bold text-primary">{metrics.engagementRate}%</p>
                <p className="text-sm font-medium text-foreground mt-1">Taxa de Engajamento</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.clicked} de {metrics.sent} engajaram
                </p>
                
                {/* Delivery Rate */}
                <div className="mt-4 pt-3 border-t border-border">
                  <p className="text-2xl font-bold text-success">{metrics.deliveryRate}%</p>
                  <p className="text-xs text-muted-foreground">Taxa de Entrega</p>
                  <p className="text-xs text-muted-foreground">
                    {metrics.delivered} de {metrics.sent} entregues
                  </p>
                </div>

                {/* Button clicks breakdown */}
                {buttonClicks.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border w-full text-left">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Cliques por botão:</p>
                    <div className="space-y-1">
                      {buttonClicks.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="truncate">{item.button}</span>
                          <span className="text-primary font-medium">{item.count} ({item.percent}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Department Assignment */}
            <div className="bg-muted/20 rounded-lg p-4 border border-border space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Departamento da Campanha
              </h3>
              <p className="text-xs text-muted-foreground">
                As conversas geradas serão direcionadas para o departamento selecionado.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 max-w-xs">
                  <SectorFilter value={selectedSectorId} onChange={handleSectorChange} />
                </div>
                {sectorChanged && (
                  <Button
                    size="sm"
                    onClick={handleSaveSector}
                    disabled={savingSector}
                    className="gap-1.5"
                  >
                    {savingSector ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Salvar
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Recipients Table Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Disparos</h3>
                  <p className="text-xs text-muted-foreground">Veja todos os disparos</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={fetchRecipients} disabled={loading}>
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportFiltered} className="gap-2">
                    <Download className="w-4 h-4" />
                    Exportar
                  </Button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Pesquisar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Todas as situações" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as situações</SelectItem>
                    <SelectItem value="pending">Na fila</SelectItem>
                    <SelectItem value="sent">Aguardando Meta</SelectItem>
                    <SelectItem value="waiting_retry">Aguardando Retry</SelectItem>
                    <SelectItem value="delivered">Entregue</SelectItem>
                    <SelectItem value="read">Lida</SelectItem>
                    <SelectItem value="clicked">Interagiram (clicaram botão)</SelectItem>
                    <SelectItem value="failed">Falha</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todas as classificações" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as classificações</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="no_whatsapp">Sem WhatsApp</SelectItem>
                    <SelectItem value="invalid_number">Número Inválido</SelectItem>
                    <SelectItem value="blocked">Bloqueado</SelectItem>
                    <SelectItem value="template_error">Erro de Template</SelectItem>
                    <SelectItem value="api_error">Erro de API</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quick export buttons */}
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs"
                  onClick={() => {
                    setStatusFilter("failed");
                    setClassificationFilter("all");
                  }}
                >
                  Ver falhas ({metrics.failed})
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs"
                  onClick={() => {
                    setStatusFilter("all");
                    setClassificationFilter("no_whatsapp");
                  }}
                >
                  Ver sem WhatsApp ({metrics.noWhatsApp})
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs"
                  onClick={() => {
                    const noWA = recipients.filter(r => classifyError(r.error_message, r.last_error_code) === "no_whatsapp");
                    exportToCSV(noWA, `campanha-${campaign?.name}-sem-whatsapp`);
                  }}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Exportar sem WhatsApp
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs"
                  onClick={() => {
                    const failed = recipients.filter(r => r.status === "failed");
                    exportToCSV(failed, `campanha-${campaign?.name}-falhas`);
                  }}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Exportar falhas
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs text-cyan-400"
                  onClick={() => {
                    setStatusFilter("clicked");
                    setClassificationFilter("all");
                  }}
                >
                  <MessageCircle className="w-3 h-3 mr-1" />
                  Ver interações ({metrics.clicked})
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs"
                  onClick={() => {
                    const clicked = recipients.filter(r => !!r.button_clicked);
                    exportToCSV(clicked, `campanha-${campaign?.name}-interacoes`);
                  }}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Exportar interações
                </Button>
              </div>

              {/* Table */}
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Classificação</TableHead>
                        <TableHead className="text-right">Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecipients.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                            Nenhum destinatário encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRecipients.slice(0, 100).map((recipient) => {
                          const statusConfig = getRecipientDisplayStatus(recipient);
                          const StatusIcon = statusConfig.icon;
                          const classification = classifyError(recipient.error_message, recipient.last_error_code);
                          
                          return (
                            <TableRow 
                              key={recipient.id} 
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => openPreview(recipient)}
                            >
                              <TableCell>
                                <div>
                                  <p className="font-mono text-sm">{formatPhone(recipient.phone)}</p>
                                  {recipient.name && (
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {recipient.name}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {classification !== "normal" && (
                                  <span className="text-xs text-muted-foreground">
                                    {classificationLabels[classification]}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <StatusIcon className="w-4 h-4 text-muted-foreground" />
                                  <Badge className={cn("text-xs", statusConfig.className)}>
                                    {statusConfig.label}
                                  </Badge>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPreview(recipient);
                                    }}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                  {filteredRecipients.length > 100 && (
                    <div className="p-2 text-center text-xs text-muted-foreground border-t">
                      Exibindo 100 de {filteredRecipients.length} destinatários. Exporte para ver todos.
                    </div>
                  )}
                </div>
              )}
            </div>
              </TabsContent>

              {/* Per Channel Tab */}
              <TabsContent value="channels" className="space-y-4 mt-4">
                <div className="bg-muted/20 rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Desempenho por canal</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Veja exatamente quanto cada número enviou, entregou e falhou.
                  </p>

                  {channelBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Ainda não há dados de envio por canal.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {channelBreakdown.map((cb) => {
                        const ch = campaignChannels.find(c => c.id === cb.channelId);
                        const label = ch
                          ? `${ch.name} • ${ch.phone}`
                          : cb.channelId === "__unassigned__"
                            ? "Sem canal atribuído (na fila)"
                            : `Canal ${cb.channelId.slice(0, 8)}`;
                        const deliveryRate = cb.sent > 0 ? Math.round((cb.delivered / cb.sent) * 100) : 0;
                        const failureRate = cb.total > 0 ? Math.round((cb.failed / cb.total) * 100) : 0;
                        return (
                          <div key={cb.channelId} className="bg-card rounded-lg p-3 border border-border">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                <p className="text-sm font-medium text-foreground">{label}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">{cb.total} destinatários</Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className="bg-muted/40 rounded px-2 py-1.5">
                                <p className="text-muted-foreground">Na fila</p>
                                <p className="font-bold text-foreground">{cb.pending}</p>
                              </div>
                              <div className="bg-chart-2/10 rounded px-2 py-1.5">
                                <p className="text-chart-2">Enviadas</p>
                                <p className="font-bold text-chart-2">{cb.sent}</p>
                              </div>
                              <div className="bg-warning/10 rounded px-2 py-1.5">
                                <p className="text-warning">Aguardando</p>
                                <p className="font-bold text-warning">{cb.awaiting}</p>
                              </div>
                              <div className="bg-success/10 rounded px-2 py-1.5">
                                <p className="text-success">Entregues</p>
                                <p className="font-bold text-success">{cb.delivered}</p>
                              </div>
                              <div className="bg-chart-3/10 rounded px-2 py-1.5">
                                <p className="text-chart-3">Lidas</p>
                                <p className="font-bold text-chart-3">{cb.read}</p>
                              </div>
                              <div className="bg-chart-5/10 rounded px-2 py-1.5">
                                <p className="text-chart-5">Engajadas</p>
                                <p className="font-bold text-chart-5">{cb.clicked}</p>
                              </div>
                              <div className="bg-destructive/10 rounded px-2 py-1.5">
                                <p className="text-destructive">Falhas</p>
                                <p className="font-bold text-destructive">{cb.failed}</p>
                              </div>
                              <div className="bg-primary/10 rounded px-2 py-1.5">
                                <p className="text-primary">Entrega</p>
                                <p className="font-bold text-primary">{deliveryRate}%</p>
                              </div>
                            </div>
                            {cb.failed > 0 && (
                              <div className="mt-2 flex items-center justify-between text-[11px]">
                                <span className="text-destructive flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Taxa de falha: {failureRate}%
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[11px]"
                                  onClick={() => {
                                    const ids = recipients.filter(r => r.channel_id === cb.channelId && r.status === "failed");
                                    exportToCSV(ids, `campanha-${campaign?.name}-${ch?.phone || cb.channelId}-falhas`);
                                  }}
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Exportar falhas
                                </Button>
                              </div>
                            )}

                            {/* Listas detalhadas por status para este canal */}
                            <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                              {(() => {
                                const matchChannel = (r: Recipient) =>
                                  (r.channel_id || "__unassigned__") === cb.channelId;
                                const sentList = recipients.filter(r => matchChannel(r) && (r.status === "sent" || r.status === "delivered" || r.status === "read"));
                                const failedList = recipients.filter(r => matchChannel(r) && r.status === "failed");
                                const pendingList = recipients.filter(r => matchChannel(r) && (r.status === "pending" || r.status === "waiting_retry"));

                                const renderList = (
                                  list: Recipient[],
                                  opts: { showError?: boolean; showSentAt?: boolean; showRetry?: boolean } = {}
                                ) => (
                                  <div className="mt-2 max-h-64 overflow-y-auto rounded border border-border/50 divide-y divide-border/40">
                                    {list.length === 0 ? (
                                      <p className="text-[11px] text-muted-foreground text-center py-3">Nenhum registro.</p>
                                    ) : list.slice(0, 200).map(r => {
                                      const sc = getRecipientDisplayStatus(r);
                                      return (
                                        <div
                                          key={r.id}
                                          className="flex items-start justify-between gap-2 px-2 py-1.5 text-[11px] hover:bg-muted/40 cursor-pointer"
                                          onClick={() => openPreview(r)}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="font-mono">{formatPhone(r.phone)}</p>
                                            {r.name && <p className="text-muted-foreground truncate">{r.name}</p>}
                                            {opts.showError && (r.error_message || r.last_error_code) && (
                                              <p className="text-destructive/90 mt-0.5 break-words">
                                                <span className="font-mono">[{r.last_error_code || extractErrorCode(r.error_message) || "—"}]</span>{" "}
                                                {r.error_message || "Sem detalhes"}
                                              </p>
                                            )}
                                            {opts.showSentAt && r.sent_at && (
                                              <p className="text-muted-foreground/80 mt-0.5">
                                                Enviado: {new Date(r.sent_at).toLocaleString("pt-BR")}
                                              </p>
                                            )}
                                            {opts.showRetry && r.next_retry_at && (
                                              <p className="text-chart-4/90 mt-0.5">
                                                Retry: {formatNextRetry(r.next_retry_at)} (tentativa {(r.retry_count || 0) + 1})
                                              </p>
                                            )}
                                          </div>
                                          <Badge className={cn("text-[10px] shrink-0", sc.className)}>{sc.label}</Badge>
                                        </div>
                                      );
                                    })}
                                    {list.length > 200 && (
                                      <p className="text-[10px] text-muted-foreground text-center py-1.5">
                                        Mostrando 200 de {list.length}. Exporte para ver todos.
                                      </p>
                                    )}
                                  </div>
                                );

                                return (
                                  <>
                                    <details className="group">
                                      <summary className="flex items-center justify-between cursor-pointer text-xs font-medium text-chart-2 hover:text-chart-2/80 px-1 py-1">
                                        <span className="flex items-center gap-1.5">
                                          <CheckCircle className="w-3 h-3" /> Enviados ({sentList.length})
                                        </span>
                                        <Button
                                          asChild
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 text-[10px] px-1.5"
                                        >
                                          <span
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              exportToCSV(sentList, `campanha-${campaign?.name}-${ch?.phone || cb.channelId}-enviados`);
                                            }}
                                          >
                                            <Download className="w-3 h-3 mr-1" /> CSV
                                          </span>
                                        </Button>
                                      </summary>
                                      {renderList(sentList, { showSentAt: true })}
                                    </details>

                                    <details className="group">
                                      <summary className="flex items-center justify-between cursor-pointer text-[11px] font-medium text-destructive hover:text-destructive/80 px-1 py-1">
                                        <span className="flex items-center gap-1.5">
                                          <XCircle className="w-3 h-3" /> Falhas ({failedList.length})
                                        </span>
                                        <Button
                                          asChild
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 text-[10px] px-1.5"
                                        >
                                          <span
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              exportToCSV(failedList, `campanha-${campaign?.name}-${ch?.phone || cb.channelId}-falhas`);
                                            }}
                                          >
                                            <Download className="w-3 h-3 mr-1" /> CSV
                                          </span>
                                        </Button>
                                      </summary>
                                      {renderList(failedList, { showError: true })}
                                    </details>

                                    <details className="group">
                                      <summary className="flex items-center justify-between cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground px-1 py-1">
                                        <span className="flex items-center gap-1.5">
                                          <Clock className="w-3 h-3" /> Pendentes / Retry ({pendingList.length})
                                        </span>
                                        <Button
                                          asChild
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 text-[10px] px-1.5"
                                        >
                                          <span
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              exportToCSV(pendingList, `campanha-${campaign?.name}-${ch?.phone || cb.channelId}-pendentes`);
                                            }}
                                          >
                                            <Download className="w-3 h-3 mr-1" /> CSV
                                          </span>
                                        </Button>
                                      </summary>
                                      {renderList(pendingList, { showRetry: true })}
                                    </details>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Detailed Errors Tab */}
              <TabsContent value="errors" className="space-y-4 mt-4">
                <div className="bg-muted/20 rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    <h3 className="font-semibold text-foreground">Falhas detalhadas por motivo</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Cada motivo lista o código retornado pela Meta, a explicação e como resolver.
                  </p>

                  {errorBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhuma falha registrada nesta campanha. 🎉
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {errorBreakdown.map((eb) => (
                        <div key={eb.code} className="bg-card rounded-lg p-3 border border-border">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="font-mono text-[11px]">
                                  {eb.code}
                                </Badge>
                                <h4 className="text-sm font-semibold text-foreground">{eb.title}</h4>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{eb.description}</p>
                            </div>
                            <Badge className="bg-destructive/20 text-destructive border-destructive/30 shrink-0">
                              {eb.count} {eb.count === 1 ? "falha" : "falhas"}
                            </Badge>
                          </div>
                          <div className="bg-muted/40 rounded px-3 py-2 text-xs text-foreground/90 mb-2">
                            <span className="font-semibold text-primary">Como resolver:</span> {eb.suggestion}
                          </div>
                          {eb.link && (
                            <a
                              href={eb.link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mb-2"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Documentação oficial da Meta
                            </a>
                          )}
                          <details className="mt-2">
                            <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                              Ver exemplos de números afetados ({Math.min(eb.samples.length, 5)})
                            </summary>
                            <div className="mt-2 space-y-1">
                              {eb.samples.map(s => (
                                <div
                                  key={s.id}
                                  className="flex items-center justify-between text-[11px] bg-muted/30 rounded px-2 py-1 cursor-pointer hover:bg-muted/60"
                                  onClick={() => openPreview(s)}
                                >
                                  <span className="font-mono">{formatPhone(s.phone)}</span>
                                  <span className="text-muted-foreground truncate max-w-[60%]">{s.name || "—"}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                          <div className="flex justify-end mt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => {
                                const failed = recipients.filter(r => (r.last_error_code || extractErrorCode(r.error_message) || "UNKNOWN") === eb.code);
                                exportToCSV(failed, `campanha-${campaign?.name}-erro-${eb.code}`);
                              }}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Exportar todos com este erro
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>

        {/* Conversation Preview Dialog */}
        <ConversationPreviewDialog
          open={!!previewPhone}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewPhone(null);
              setPreviewName(null);
              setPreviewChannelId(null);
              setPreviewSentAt(null);
            }
          }}
          phone={previewPhone || ""}
          name={previewName}
          channelId={previewChannelId}
          sentAt={previewSentAt}
          organizationId={campaign?.organization_id}
        />

        {/* Recycle Failures Dialog */}
        <RecycleFailuresDialog
          campaign={campaign ? {
            id: campaign.id,
            name: campaign.name,
            failed_count: metrics.failed,
            sector_id: undefined, // Not available in this interface
            chatbot_enabled: campaign.chatbot_enabled,
            chatbot_id: undefined,
            min_interval: campaign.min_interval,
            max_interval: campaign.max_interval,
          } : null}
          open={showRecycleDialog}
          onOpenChange={setShowRecycleDialog}
          onSuccess={() => {
            setShowRecycleDialog(false);
            onRecycleSuccess?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
