import { useState } from "react";
import { 
  Link2, 
  Plus, 
  Wifi, 
  WifiOff, 
  Phone, 
  QrCode,
  RefreshCw,
  Trash2,
  Settings,
  Copy,
  Check
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Connection {
  id: string;
  name: string;
  phone: string;
  status: "connected" | "disconnected" | "connecting";
  messagesCount: number;
}

const mockConnections: Connection[] = [
  { 
    id: "1", 
    name: "Número Principal", 
    phone: "+55 11 99999-0001", 
    status: "connected",
    messagesCount: 1234
  },
  { 
    id: "2", 
    name: "Suporte", 
    phone: "+55 11 99999-0002", 
    status: "connected",
    messagesCount: 567
  },
  { 
    id: "3", 
    name: "Vendas", 
    phone: "+55 11 99999-0003", 
    status: "disconnected",
    messagesCount: 890
  },
];

const statusConfig = {
  connected: { 
    label: "Conectado", 
    icon: Wifi,
    className: "bg-primary/10 text-primary border-primary/30"
  },
  disconnected: { 
    label: "Desconectado", 
    icon: WifiOff,
    className: "bg-destructive/10 text-destructive border-destructive/30"
  },
  connecting: { 
    label: "Conectando", 
    icon: Wifi,
    className: "bg-warning/10 text-warning border-warning/30"
  },
};

const Conexoes = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string) => {
    setCopiedId(id);
    toast.success("Copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Conexões</h1>
          <p className="text-muted-foreground">Gerencie seus números WhatsApp</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="default" className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Conexão
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Conexão</DialogTitle>
              <DialogDescription>
                Conecte um novo número WhatsApp
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input placeholder="Ex: Vendas, Suporte..." />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input placeholder="+55 11 99999-0000" />
              </div>
              <div className="flex justify-center p-6 bg-muted/30 rounded-lg border border-border">
                <div className="text-center">
                  <QrCode className="w-24 h-24 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Escaneie o QR Code
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline">Cancelar</Button>
              <Button>Conectar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-foreground">{mockConnections.length}</p>
            </div>
            <Link2 className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Conectadas</p>
              <p className="text-2xl font-bold text-primary">
                {mockConnections.filter(c => c.status === "connected").length}
              </p>
            </div>
            <Wifi className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Mensagens</p>
              <p className="text-2xl font-bold text-foreground">
                {mockConnections.reduce((acc, c) => acc + c.messagesCount, 0).toLocaleString()}
              </p>
            </div>
            <Phone className="w-6 h-6 text-warning" />
          </div>
        </div>
      </div>

      {/* Connections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockConnections.map((connection) => {
          const config = statusConfig[connection.status];
          const StatusIcon = config.icon;
          
          return (
            <div 
              key={connection.id}
              className="bg-card rounded-lg border border-border p-5 animate-fade-in"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                    <Phone className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{connection.name}</h3>
                    <p className="text-sm text-muted-foreground">{connection.phone}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <Badge variant="outline" className={cn("text-xs", config.className)}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {config.label}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {connection.messagesCount.toLocaleString()} msgs
                </span>
              </div>

              <div className="flex gap-2">
                {connection.status === "disconnected" ? (
                  <Button variant="default" size="sm" className="flex-1 gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Reconectar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="flex-1 gap-2">
                    <Settings className="w-4 h-4" />
                    Configurar
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </MainLayout>
  );
};

export default Conexoes;
