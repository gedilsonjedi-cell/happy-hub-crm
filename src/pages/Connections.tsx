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
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
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
  apiKey: string;
  messagesCount: number;
  createdAt: string;
}

const mockConnections: Connection[] = [
  { 
    id: "1", 
    name: "Número Principal", 
    phone: "+55 11 99999-0001", 
    status: "connected",
    apiKey: "wh_sk_1234567890abcdef",
    messagesCount: 1234,
    createdAt: "2024-01-01"
  },
  { 
    id: "2", 
    name: "Suporte", 
    phone: "+55 11 99999-0002", 
    status: "connected",
    apiKey: "wh_sk_abcdef1234567890",
    messagesCount: 567,
    createdAt: "2024-01-05"
  },
  { 
    id: "3", 
    name: "Vendas", 
    phone: "+55 11 99999-0003", 
    status: "disconnected",
    apiKey: "wh_sk_fedcba0987654321",
    messagesCount: 890,
    createdAt: "2024-01-10"
  },
];

const statusConfig = {
  connected: { 
    label: "Conectado", 
    icon: Wifi,
    className: "bg-primary/10 text-primary border-primary/20",
    dotClassName: "bg-primary"
  },
  disconnected: { 
    label: "Desconectado", 
    icon: WifiOff,
    className: "bg-destructive/10 text-destructive border-destructive/20",
    dotClassName: "bg-destructive"
  },
  connecting: { 
    label: "Conectando", 
    icon: Wifi,
    className: "bg-warning/10 text-warning border-warning/20",
    dotClassName: "bg-warning animate-pulse"
  },
};

const Connections = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyApiKey = (id: string, apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    setCopiedId(id);
    toast.success("API Key copiada!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Conexões</h1>
          <p className="text-muted-foreground">
            Gerencie seus números WhatsApp conectados via API oficial
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="whatsapp" className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Conexão
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Nova Conexão</DialogTitle>
              <DialogDescription>
                Conecte um novo número WhatsApp usando a API oficial
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Conexão</Label>
                <Input id="name" placeholder="Ex: Vendas, Suporte..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Número do WhatsApp</Label>
                <Input id="phone" placeholder="+55 11 99999-0000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input id="apiKey" placeholder="wh_sk_..." />
              </div>
              <div className="flex justify-center p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <QrCode className="w-32 h-32 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Escaneie o QR Code no seu WhatsApp
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline">Cancelar</Button>
              <Button variant="whatsapp">Conectar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Conexões</p>
                <p className="text-3xl font-bold text-card-foreground">{mockConnections.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10">
                <Link2 className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conectadas</p>
                <p className="text-3xl font-bold text-primary">
                  {mockConnections.filter(c => c.status === "connected").length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10">
                <Wifi className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Mensagens Enviadas</p>
                <p className="text-3xl font-bold text-card-foreground">
                  {mockConnections.reduce((acc, c) => acc + c.messagesCount, 0).toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-warning/10">
                <Phone className="w-6 h-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockConnections.map((connection, index) => {
          const config = statusConfig[connection.status];
          const StatusIcon = config.icon;
          
          return (
            <Card 
              key={connection.id}
              className="border-border/50 hover:shadow-glass-lg transition-all duration-300 animate-scale-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl gradient-whatsapp flex items-center justify-center shadow-whatsapp">
                      <Phone className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{connection.name}</CardTitle>
                      <CardDescription>{connection.phone}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full", config.dotClassName)} />
                    <Badge variant="outline" className={cn("text-xs", config.className)}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Mensagens</span>
                  <span className="font-medium text-card-foreground">
                    {connection.messagesCount.toLocaleString()}
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">API Key</span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg truncate">
                      {connection.apiKey}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="shrink-0"
                      onClick={() => handleCopyApiKey(connection.id, connection.apiKey)}
                    >
                      {copiedId === connection.id ? (
                        <Check className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  {connection.status === "disconnected" ? (
                    <Button variant="whatsapp" className="flex-1 gap-2">
                      <RefreshCw className="w-4 h-4" />
                      Reconectar
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1 gap-2">
                      <Settings className="w-4 h-4" />
                      Configurar
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </MainLayout>
  );
};

export default Connections;
