import { useState } from "react";
import { 
  Send, 
  Plus, 
  Calendar,
  Users,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  MoreVertical,
  Play,
  Pause
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "completed" | "failed";
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  scheduledAt?: string;
  createdAt: string;
}

const mockCampaigns: Campaign[] = [
  { 
    id: "1", 
    name: "Promoção Black Friday", 
    status: "completed", 
    recipients: 500, 
    sent: 500, 
    delivered: 485, 
    failed: 15,
    createdAt: "2024-01-15"
  },
  { 
    id: "2", 
    name: "Novidades de Janeiro", 
    status: "running", 
    recipients: 300, 
    sent: 150, 
    delivered: 148, 
    failed: 2,
    createdAt: "2024-01-14"
  },
  { 
    id: "3", 
    name: "Lembrete de Pagamento", 
    status: "scheduled", 
    recipients: 200, 
    sent: 0, 
    delivered: 0, 
    failed: 0,
    scheduledAt: "2024-01-20 10:00",
    createdAt: "2024-01-13"
  },
  { 
    id: "4", 
    name: "Boas-vindas", 
    status: "draft", 
    recipients: 0, 
    sent: 0, 
    delivered: 0, 
    failed: 0,
    createdAt: "2024-01-12"
  },
];

const statusConfig = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground border-border", icon: MessageSquare },
  scheduled: { label: "Agendada", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  running: { label: "Enviando", className: "bg-blue-500/10 text-blue-400 border-blue-400/30", icon: Play },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle },
  failed: { label: "Falhou", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
};

const Disparos = () => {
  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Disparos</h1>
          <p className="text-muted-foreground">Gerencie suas campanhas de mensagens</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total de Campanhas</p>
              <p className="text-2xl font-bold text-foreground">{mockCampaigns.length}</p>
            </div>
            <Send className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Em Execução</p>
              <p className="text-2xl font-bold text-blue-400">
                {mockCampaigns.filter(c => c.status === "running").length}
              </p>
            </div>
            <Play className="w-6 h-6 text-blue-400" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Mensagens Enviadas</p>
              <p className="text-2xl font-bold text-foreground">
                {mockCampaigns.reduce((acc, c) => acc + c.sent, 0).toLocaleString()}
              </p>
            </div>
            <MessageSquare className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Taxa de Entrega</p>
              <p className="text-2xl font-bold text-primary">97%</p>
            </div>
            <CheckCircle className="w-6 h-6 text-primary" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-slide-up">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-muted/30">
              <TableHead className="text-muted-foreground">Campanha</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Destinatários</TableHead>
              <TableHead className="text-muted-foreground">Enviadas</TableHead>
              <TableHead className="text-muted-foreground">Entregues</TableHead>
              <TableHead className="text-muted-foreground">Falhas</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockCampaigns.map((campaign) => {
              const config = statusConfig[campaign.status];
              const StatusIcon = config.icon;
              
              return (
                <TableRow 
                  key={campaign.id}
                  className="border-border hover:bg-muted/20"
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {campaign.scheduledAt ? `Agendada: ${campaign.scheduledAt}` : `Criada: ${campaign.createdAt}`}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs gap-1", config.className)}>
                      <StatusIcon className="w-3 h-3" />
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground">{campaign.recipients}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground">{campaign.sent}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-primary">{campaign.delivered}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-destructive">{campaign.failed}</span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                        <DropdownMenuItem>Duplicar</DropdownMenuItem>
                        {campaign.status === "running" && (
                          <DropdownMenuItem>Pausar</DropdownMenuItem>
                        )}
                        {campaign.status === "draft" && (
                          <DropdownMenuItem>Enviar agora</DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </MainLayout>
  );
};

export default Disparos;
