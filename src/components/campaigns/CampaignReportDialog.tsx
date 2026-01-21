import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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
}

interface CampaignReportDialogProps {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Recipient status display config
const recipientStatusConfig: Record<string, { label: string; className: string; icon: typeof MessageSquare }> = {
  pending: { label: "Pendente", className: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Enviado", className: "bg-purple-500/80 text-white", icon: CheckCircle },
  delivered: { label: "Entregue", className: "bg-green-500/80 text-white", icon: CheckCheck },
  read: { label: "Lida", className: "bg-violet-600 text-white", icon: Eye },
  failed: { label: "Falha", className: "bg-destructive text-white", icon: XCircle },
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

export function CampaignReportDialog({ campaign, open, onOpenChange }: CampaignReportDialogProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");

  useEffect(() => {
    if (open && campaign) {
      fetchRecipients();
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
        .select("id, phone, name, status, error_message, last_error_code, sent_at, delivered_at, read_at, button_clicked, button_clicked_at")
        .eq("campaign_id", campaign.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setRecipients(data || []);
    } catch (error) {
      console.error("Error fetching recipients:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = recipients.length;
    const sent = recipients.filter(r => r.status === "sent" || r.status === "delivered" || r.status === "read").length;
    const delivered = recipients.filter(r => r.status === "delivered" || r.status === "read" || r.delivered_at).length;
    const read = recipients.filter(r => r.status === "read" || r.read_at).length;
    const clicked = recipients.filter(r => r.button_clicked).length;
    const failed = recipients.filter(r => r.status === "failed").length;
    const noWhatsApp = recipients.filter(r => classifyError(r.error_message, r.last_error_code) === "no_whatsapp").length;

    return {
      total,
      sent,
      delivered,
      read,
      clicked,
      failed,
      noWhatsApp,
      sentPercent: total > 0 ? Math.round((sent / total) * 100) : 0,
      deliveredPercent: total > 0 ? Math.round((delivered / total) * 100) : 0,
      readPercent: total > 0 ? Math.round((read / total) * 100) : 0,
      clickedPercent: total > 0 ? Math.round((clicked / total) * 100) : 0,
      failedPercent: total > 0 ? Math.round((failed / total) * 100) : 0,
      engagementRate: total > 0 ? Math.round((clicked / total) * 100) : 0,
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
    if (recipient.read_at) return recipientStatusConfig.read;
    if (recipient.delivered_at) return recipientStatusConfig.delivered;
    return recipientStatusConfig[recipient.status] || recipientStatusConfig.pending;
  };

  if (!campaign) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl bg-card border-border max-h-[95vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl text-foreground">{campaign.name}</DialogTitle>
            <Badge variant="outline" className="text-xs">
              Relatório Detalhado
            </Badge>
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
                    <span className="text-sm text-muted-foreground w-20">Total</span>
                    <div className="flex-1 h-7 bg-primary/80 rounded flex items-center px-2">
                      <span className="text-xs text-primary-foreground font-medium">100%</span>
                    </div>
                    <Send className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Sent */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-20">Envio</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      {metrics.sentPercent > 0 && (
                        <div 
                          className="h-full bg-rose-500 flex items-center px-2"
                          style={{ width: `${Math.max(metrics.failedPercent, 15)}%` }}
                        >
                          {metrics.failedPercent >= 10 && (
                            <span className="text-xs text-white font-medium">{metrics.failedPercent}%</span>
                          )}
                        </div>
                      )}
                      {metrics.noWhatsApp > 0 && (
                        <div 
                          className="h-full bg-warning flex items-center px-2"
                          style={{ width: `${Math.max(Math.round((metrics.noWhatsApp / metrics.total) * 100), 10)}%` }}
                        >
                          {Math.round((metrics.noWhatsApp / metrics.total) * 100) >= 10 && (
                            <span className="text-xs text-white font-medium">{Math.round((metrics.noWhatsApp / metrics.total) * 100)}%</span>
                          )}
                        </div>
                      )}
                      <div 
                        className="h-full bg-teal-600 flex items-center px-2"
                        style={{ width: `${Math.max(metrics.sentPercent - metrics.failedPercent, 20)}%` }}
                      >
                        <span className="text-xs text-white font-medium">{metrics.sentPercent - metrics.failedPercent}%</span>
                      </div>
                    </div>
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Delivered */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-20">Entregue</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      <div 
                        className="h-full bg-green-600 flex items-center px-2"
                        style={{ width: `${Math.max(metrics.deliveredPercent, 10)}%` }}
                      >
                        <span className="text-xs text-white font-medium">{metrics.deliveredPercent}%</span>
                      </div>
                    </div>
                    <CheckCheck className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Read */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-20">Lido</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      <div 
                        className="h-full bg-violet-700 flex items-center px-2"
                        style={{ width: `${Math.max(metrics.readPercent, 10)}%` }}
                      >
                        <span className="text-xs text-white font-medium">{metrics.readPercent}%</span>
                      </div>
                    </div>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Interacted */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-20">Interagido</span>
                    <div className="flex-1 h-7 bg-muted rounded flex items-center overflow-hidden">
                      <div 
                        className="h-full bg-amber-600 flex items-center px-2"
                        style={{ width: `${Math.max(metrics.clickedPercent, 5)}%` }}
                      >
                        <span className="text-xs text-white font-medium">{metrics.clickedPercent}%</span>
                      </div>
                    </div>
                    <MessageCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* Engagement Card */}
              <div className="bg-muted/20 rounded-lg p-4 border border-border flex flex-col items-center justify-center text-center">
                <Target className="w-10 h-10 text-primary mb-2" />
                <p className="text-5xl font-bold text-primary">{metrics.engagementRate}%</p>
                <p className="text-sm font-medium text-foreground mt-1">Engajamento</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.clicked} pessoas que engajaram com sua campanha
                </p>

                {/* Button clicks breakdown */}
                {buttonClicks.length > 0 && (
                  <div className="mt-4 w-full">
                    <p className="text-xs text-muted-foreground mb-2">Cliques por botão:</p>
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
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="sent">Enviado</SelectItem>
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
                            <TableRow key={recipient.id}>
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
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
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
      </DialogContent>
    </Dialog>
  );
}
