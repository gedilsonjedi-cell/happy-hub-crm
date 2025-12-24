import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "completed" | "failed";
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

interface CampaignDetailsDialogProps {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground border-border", icon: MessageSquare },
  scheduled: { label: "Agendada", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  running: { label: "Enviando", className: "bg-blue-500/10 text-blue-400 border-blue-400/30", icon: Play },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle },
  failed: { label: "Falhou", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
};

export function CampaignDetailsDialog({ campaign, open, onOpenChange }: CampaignDetailsDialogProps) {
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

  // Simulated failure reasons (in production, this would come from the database)
  const failureReasons = {
    noWhatsApp: Math.floor(campaign.failed_count * 0.4),
    invalidNumber: Math.floor(campaign.failed_count * 0.25),
    blocked: Math.floor(campaign.failed_count * 0.2),
    timeout: Math.floor(campaign.failed_count * 0.1),
    other: campaign.failed_count - Math.floor(campaign.failed_count * 0.4) - Math.floor(campaign.failed_count * 0.25) - Math.floor(campaign.failed_count * 0.2) - Math.floor(campaign.failed_count * 0.1),
  };

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

        <Separator className="my-4" />

        {/* Failure Reasons */}
        {campaign.failed_count > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Motivos das Falhas
            </h3>
            
            <div className="grid gap-2">
              {failureReasons.noWhatsApp > 0 && (
                <div className="flex items-center justify-between bg-muted/20 rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-3">
                    <PhoneOff className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Sem WhatsApp</span>
                  </div>
                  <Badge variant="secondary">{failureReasons.noWhatsApp}</Badge>
                </div>
              )}
              
              {failureReasons.invalidNumber > 0 && (
                <div className="flex items-center justify-between bg-muted/20 rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-3">
                    <XCircle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Número Inválido</span>
                  </div>
                  <Badge variant="secondary">{failureReasons.invalidNumber}</Badge>
                </div>
              )}
              
              {failureReasons.blocked > 0 && (
                <div className="flex items-center justify-between bg-muted/20 rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-3">
                    <Ban className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Bloqueado</span>
                  </div>
                  <Badge variant="secondary">{failureReasons.blocked}</Badge>
                </div>
              )}
              
              {failureReasons.timeout > 0 && (
                <div className="flex items-center justify-between bg-muted/20 rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Timeout</span>
                  </div>
                  <Badge variant="secondary">{failureReasons.timeout}</Badge>
                </div>
              )}
              
              {failureReasons.other > 0 && (
                <div className="flex items-center justify-between bg-muted/20 rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Outros Erros</span>
                  </div>
                  <Badge variant="secondary">{failureReasons.other}</Badge>
                </div>
              )}
            </div>
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
