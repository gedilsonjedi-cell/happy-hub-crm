import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  MessageSquare,
  AlertTriangle,
  PhoneOff,
  Ban,
  TrendingUp,
  Calendar,
  Timer,
  Play,
  Pause,
  Loader2,
  AlertCircle,
  Building2,
  Save,
} from "lucide-react";
import { SectorFilter } from "@/components/whatsapp/SectorFilter";
import { toast } from "sonner";
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
  sector_id?: string | null;
}

interface FailedMessage {
  destination: string;
  error: string;
  timestamp: string;
}

interface CampaignDetailsDialogProps {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCampaignUpdated?: () => void;
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof MessageSquare }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground border-border", icon: MessageSquare },
  scheduled: { label: "Agendada", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  running: { label: "Enviando", className: "bg-blue-500/10 text-blue-400 border-blue-400/30", icon: Play },
  paused: { label: "Pausada", className: "bg-yellow-500/10 text-yellow-400 border-yellow-400/30", icon: Pause },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle },
  failed: { label: "Falhou", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
};

// Categorize error messages
function categorizeError(error: string): { category: string; icon: typeof AlertCircle } {
  const lowerError = error.toLowerCase();
  
  if (lowerError.includes('não possui whatsapp') || lowerError.includes('not on whatsapp') || lowerError.includes('no whatsapp')) {
    return { category: 'Sem WhatsApp', icon: PhoneOff };
  }
  if (lowerError.includes('número inválido') || lowerError.includes('invalid number') || lowerError.includes('invalid phone')) {
    return { category: 'Número Inválido', icon: XCircle };
  }
  if (lowerError.includes('bloqueado') || lowerError.includes('blocked') || lowerError.includes('blacklist')) {
    return { category: 'Bloqueado', icon: Ban };
  }
  if (lowerError.includes('timeout') || lowerError.includes('tempo esgotado')) {
    return { category: 'Timeout', icon: Clock };
  }
  if (lowerError.includes('saldo') || lowerError.includes('balance') || lowerError.includes('insufficient')) {
    return { category: 'Saldo Insuficiente', icon: AlertCircle };
  }
  if (lowerError.includes('template') || lowerError.includes('not approved')) {
    return { category: 'Erro de Template', icon: MessageSquare };
  }
  
  return { category: 'Erro de API', icon: AlertTriangle };
}

interface ButtonClickData {
  total: number;
  byButton: Record<string, number>;
}

export function CampaignDetailsDialog({ campaign, open, onOpenChange }: CampaignDetailsDialogProps) {
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [buttonClicks, setButtonClicks] = useState<ButtonClickData>({ total: 0, byButton: {} });
  const [loadingClicks, setLoadingClicks] = useState(false);

  useEffect(() => {
    if (open && campaign) {
      fetchButtonClicks();
      if (campaign.failed_count > 0) {
        fetchFailedMessages();
      } else {
        setFailedMessages([]);
      }
    } else {
      setFailedMessages([]);
      setButtonClicks({ total: 0, byButton: {} });
    }
  }, [open, campaign?.id]);

  const fetchButtonClicks = async () => {
    if (!campaign) return;
    setLoadingClicks(true);
    try {
      const { data } = await supabase
        .from('campaign_recipients')
        .select('button_clicked')
        .eq('campaign_id', campaign.id)
        .not('button_clicked', 'is', null);

      if (data) {
        const byButton: Record<string, number> = {};
        data.forEach(r => {
          const btn = r.button_clicked || 'Desconhecido';
          byButton[btn] = (byButton[btn] || 0) + 1;
        });
        setButtonClicks({ total: data.length, byButton });
      }
    } catch (err) {
      console.error('Error fetching button clicks:', err);
    } finally {
      setLoadingClicks(false);
    }
  };

  const fetchFailedMessages = async () => {
    if (!campaign) return;
    
    setLoadingErrors(true);
    try {
      // Fetch failed messages from whatsapp_messages table
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('metadata, created_at')
        .eq('status', 'failed')
        .gte('created_at', campaign.started_at || campaign.created_at)
        .lte('created_at', campaign.completed_at || new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        const errors: FailedMessage[] = data
          .filter(msg => msg.metadata && typeof msg.metadata === 'object')
          .map(msg => {
            const metadata = msg.metadata as Record<string, unknown>;
            return {
              destination: String(metadata.destination || 'Desconhecido'),
              error: String(metadata.error || metadata.errorMessage || 'Erro desconhecido'),
              timestamp: msg.created_at
            };
          });
        setFailedMessages(errors);
      }
    } catch (error) {
      console.error('Error fetching failed messages:', error);
    } finally {
      setLoadingErrors(false);
    }
  };

  if (!campaign) return null;

  const config = statusConfig[campaign.status];
  const StatusIcon = config.icon;

  // Calculate analytics
  const deliveryRate = campaign.sent_count > 0 
    ? Math.round((campaign.delivered_count / campaign.sent_count) * 100) 
    : 0;
  
  const failureRate = campaign.sent_count > 0 
    ? Math.round((campaign.failed_count / campaign.sent_count) * 100) 
    : 0;

  const progress = campaign.total_recipients > 0 
    ? Math.round((campaign.sent_count / campaign.total_recipients) * 100) 
    : 0;

  // Group failure reasons from real data
  const groupedErrors: Record<string, { count: number; icon: typeof AlertCircle; samples: string[] }> = {};
  
  failedMessages.forEach(msg => {
    const { category, icon } = categorizeError(msg.error);
    if (!groupedErrors[category]) {
      groupedErrors[category] = { count: 0, icon, samples: [] };
    }
    groupedErrors[category].count++;
    if (groupedErrors[category].samples.length < 3) {
      groupedErrors[category].samples.push(msg.error);
    }
  });

  // If no real data, use estimated distribution
  const hasRealErrorData = failedMessages.length > 0;
  const estimatedFailureReasons = !hasRealErrorData && campaign.failed_count > 0 ? {
    'Erro de API': { count: campaign.failed_count, icon: AlertTriangle, samples: ['Verifique os logs para mais detalhes'] }
  } : {};

  const displayErrors = hasRealErrorData ? groupedErrors : estimatedFailureReasons;

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDuration = () => {
    if (!campaign.started_at) return "-";
    const start = new Date(campaign.started_at);
    const end = campaign.completed_at ? new Date(campaign.completed_at) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    if (diffMins === 0) return `${diffSecs}s`;
    return `${diffMins}m ${diffSecs}s`;
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl text-foreground">{campaign.name}</DialogTitle>
            <Badge variant="outline" className={cn("text-xs gap-1", config.className)}>
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </Badge>
          </div>
          <DialogDescription className="text-muted-foreground">
            Detalhes e estatísticas da campanha
          </DialogDescription>
        </DialogHeader>

        {/* Progress Section (for running campaigns) */}
        {campaign.status === "running" && (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-blue-400 font-medium">Progresso do Disparo</span>
              <span className="text-sm text-foreground">{campaign.sent_count} / {campaign.total_recipients}</span>
            </div>
            <Progress value={progress} className="h-2 bg-muted" />
            <p className="text-xs text-muted-foreground mt-2">
              {progress}% concluído • Estimativa: {Math.ceil((campaign.total_recipients - campaign.sent_count) * ((campaign.min_interval || 5) + (campaign.max_interval || 120)) / 2 / 60)} min restantes
            </p>
          </div>
        )}

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted/30 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs">Destinatários</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{campaign.total_recipients}</p>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Send className="w-4 h-4" />
              <span className="text-xs">Enviadas</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{campaign.sent_count}</p>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 text-primary mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs">Entregues</span>
            </div>
            <p className="text-2xl font-bold text-primary">{campaign.delivered_count}</p>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <XCircle className="w-4 h-4" />
              <span className="text-xs">Falhas</span>
            </div>
            <p className="text-2xl font-bold text-destructive">{campaign.failed_count}</p>
          </div>
        </div>

        {/* Rates */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-foreground">Taxa de Entrega</span>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-primary">{deliveryRate}%</span>
              <span className="text-sm text-muted-foreground mb-1">de sucesso</span>
            </div>
            <Progress value={deliveryRate} className="h-1.5 mt-2 bg-muted" />
          </div>
          
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <span className="text-sm font-medium text-foreground">Taxa de Falha</span>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-destructive">{failureRate}%</span>
              <span className="text-sm text-muted-foreground mb-1">de falha</span>
            </div>
            <Progress value={failureRate} className="h-1.5 mt-2 bg-muted [&>div]:bg-destructive" />
          </div>
        </div>

        {/* Button Click Metrics */}
        {(buttonClicks.total > 0 || loadingClicks) && (
          <>
            <Separator className="my-4" />
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Cliques nos Botões
                {loadingClicks && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </h3>

              {/* Total */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground font-medium">Total de Cliques</span>
                  <span className="text-2xl font-bold text-primary">{buttonClicks.total}</span>
                </div>
                {campaign.delivered_count > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Taxa de interação: {Math.round((buttonClicks.total / campaign.delivered_count) * 100)}% das entregues
                  </p>
                )}
              </div>

              {/* Per-button breakdown */}
              {Object.keys(buttonClicks.byButton).length > 0 && (
                <div className="grid gap-2">
                  {Object.entries(buttonClicks.byButton)
                    .sort(([, a], [, b]) => b - a)
                    .map(([buttonName, count], idx) => (
                      <div key={buttonName} className="bg-muted/20 rounded-lg p-3 border border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {idx + 1}
                          </div>
                          <div>
                            <span className="text-sm text-foreground font-medium">{buttonName}</span>
                            <p className="text-xs text-muted-foreground">
                              Botão {idx + 1}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-foreground">{count}</span>
                          <p className="text-xs text-muted-foreground">
                            {buttonClicks.total > 0 ? Math.round((count / buttonClicks.total) * 100) : 0}% dos cliques
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}

        <Separator className="my-4" />

        {/* Failure Reasons */}
        {campaign.failed_count > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Motivos das Falhas
              {loadingErrors && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </h3>
            
            <div className="grid gap-2">
              {Object.entries(displayErrors).map(([category, data]) => {
                const Icon = data.icon;
                return (
                  <div key={category} className="bg-muted/20 rounded-lg p-3 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground font-medium">{category}</span>
                      </div>
                      <Badge variant="secondary">{data.count}</Badge>
                    </div>
                    {data.samples.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {data.samples.map((sample, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground truncate">
                            • {sample}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Detailed error list */}
            {failedMessages.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Detalhes ({failedMessages.length} erros)
                </h4>
                <ScrollArea className="h-32 rounded-lg border border-border">
                  <div className="p-2 space-y-1">
                    {failedMessages.map((msg, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs p-2 bg-muted/10 rounded">
                        <XCircle className="w-3 h-3 text-destructive mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-muted-foreground">{formatPhone(msg.destination)}</span>
                          <p className="text-destructive/80 truncate">{msg.error}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <Separator className="my-4" />

        {/* Campaign Details */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Informações da Campanha</h3>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Criada em:</span>
              <span className="text-foreground">{formatDate(campaign.created_at)}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Iniciada em:</span>
              <span className="text-foreground">{formatDate(campaign.started_at)}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Concluída em:</span>
              <span className="text-foreground">{formatDate(campaign.completed_at)}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Duração:</span>
              <span className="text-foreground">{getDuration()}</span>
            </div>
            
            {campaign.team && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Equipe:</span>
                <span className="text-foreground capitalize">{campaign.team}</span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Cadência:</span>
              <span className="text-foreground">{campaign.min_interval || 5}s - {campaign.max_interval || 120}s</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}