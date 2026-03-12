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
} from "lucide-react";
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
}

interface CampaignReportDialogProps {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecycleSuccess?: () => void;
}

// Recipient status display config
const recipientStatusConfig: Record<string, { label: string; className: string; icon: typeof MessageSquare }> = {
  pending: { label: "Na fila", className: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Aguardando Meta", className: "bg-amber-500/80 text-white", icon: Clock },
  delivered: { label: "Entregue", className: "bg-green-500/80 text-white", icon: CheckCheck },
  read: { label: "Lida", className: "bg-violet-600 text-white", icon: Eye },
  failed: { label: "Falha", className: "bg-destructive text-white", icon: XCircle },
  waiting_retry: { label: "Aguardando Retry", className: "bg-orange-500/80 text-white", icon: Clock },
  no_whatsapp: { label: "Sem WhatsApp", className: "bg-warning text-white", icon: PhoneOff },
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

export function CampaignReportDialog({ campaign, open, onOpenChange, onRecycleSuccess }: CampaignReportDialogProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [previewPhone, setPreviewPhone] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [showRecycleDialog, setShowRecycleDialog] = useState(false);
  const [campaignChannels, setCampaignChannels] = useState<Array<{ id: string; name: string; phone: string }>>([]);

  useEffect(() => {
    if (open && campaign) {
      fetchRecipients();
      
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
    }
  }, [open, campaign?.id]);

  const fetchRecipients = async () => {
    if (!campaign) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("campaign_recipients")
        .select("id, phone, name, status, error_message, last_error_code, sent_at, delivered_at, read_at, button_clicked, button_clicked_at, retry_count, next_retry_at")
        .eq("campaign_id", campaign.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setRecipients((data || []) as Recipient[]);
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

  // Filter recipients
  const filteredRecipients = useMemo(() => {
    return recipients.filter(r => {
      const matchesSearch = searchTerm === "" || 
        r.phone.includes(searchTerm) || 
        (r.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      
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
                className="gap-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
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
                          className="h-full bg-purple-600 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.processed / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-white font-medium">
                            {Math.round((metrics.processed / metrics.total) * 100)}%
                          </span>
                          <span className="text-xs text-white">{metrics.processed}</span>
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
                          className="h-full bg-teal-600 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.sent / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-white font-medium">
                            {metrics.sentPercent}%
                          </span>
                          <span className="text-xs text-white">{metrics.sent}</span>
                        </div>
                      )}
                    </div>
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Aguardando confirmação da Meta - THE KEY NEW METRIC */}
                  {metrics.awaitingConfirmation > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-amber-400 w-24 font-medium">⏳ Aguardando</span>
                      <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.awaitingConfirmation / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{metrics.awaitingPercent}%</span>
                          <span className="text-xs text-white">{metrics.awaitingConfirmation}</span>
                        </div>
                      </div>
                      <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                  )}
                  
                  {/* Delivered */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24">Entregues</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      {metrics.delivered > 0 && (
                        <div 
                          className="h-full bg-green-600 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.delivered / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{metrics.deliveredPercent}%</span>
                          <span className="text-xs text-white">{metrics.delivered}</span>
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
                          className="h-full bg-violet-700 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.read / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{metrics.readPercent}%</span>
                          <span className="text-xs text-white">{metrics.read}</span>
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
                          className="h-full bg-cyan-600 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.clicked / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{metrics.clickedPercent}%</span>
                          <span className="text-xs text-white">{metrics.clicked}</span>
                        </div>
                      )}
                    </div>
                    <MessageCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Waiting Retry Section - NEW */}
                  {metrics.waitingRetry > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-orange-400 w-24 font-medium">⏳ Retry Agend.</span>
                      <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                        <div 
                          className="h-full bg-orange-500 flex items-center justify-between px-2"
                          style={{ width: `${Math.max((metrics.waitingRetry / metrics.total) * 100, 15)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{metrics.waitingRetryPercent}%</span>
                          <span className="text-xs text-white">{metrics.waitingRetry}</span>
                        </div>
                      </div>
                      <Clock className="w-4 h-4 text-orange-400" />
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
                          <span className="text-xs text-white font-medium">{metrics.failedPercent}%</span>
                          <span className="text-xs text-white">{metrics.failed}</span>
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
                        <div className="flex justify-between bg-orange-500/20 text-orange-400 px-2 py-1 rounded">
                          <span>Número Inválido</span>
                          <span className="font-bold">{metrics.invalidNumber}</span>
                        </div>
                      )}
                      {metrics.blocked > 0 && (
                        <div className="flex justify-between bg-red-500/20 text-red-400 px-2 py-1 rounded">
                          <span>Bloqueado</span>
                          <span className="font-bold">{metrics.blocked}</span>
                        </div>
                      )}
                      {metrics.templateError > 0 && (
                        <div className="flex justify-between bg-pink-500/20 text-pink-400 px-2 py-1 rounded">
                          <span>Erro de Template</span>
                          <span className="font-bold">{metrics.templateError}</span>
                        </div>
                      )}
                      {metrics.apiError > 0 && (
                        <div className="flex justify-between bg-gray-500/20 text-gray-400 px-2 py-1 rounded">
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
                  <p className="text-2xl font-bold text-green-500">{metrics.deliveryRate}%</p>
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
                              onClick={() => {
                                setPreviewPhone(recipient.phone);
                                setPreviewName(recipient.name);
                              }}
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
                                      setPreviewPhone(recipient.phone);
                                      setPreviewName(recipient.name);
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
          </div>
        </ScrollArea>

        {/* Conversation Preview Dialog */}
        <ConversationPreviewDialog
          open={!!previewPhone}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewPhone(null);
              setPreviewName(null);
            }
          }}
          phone={previewPhone || ""}
          name={previewName}
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
