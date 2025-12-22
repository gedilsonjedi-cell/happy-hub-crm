import { useState, useEffect } from "react";
import { 
  Link2, 
  Plus, 
  ExternalLink,
  Smartphone,
  MoreVertical,
  Trash2,
  Power,
  PowerOff,
  RefreshCw
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Channel {
  id: string;
  name: string;
  phone: string;
  provider: string;
  app_name: string | null;
  access_token: string | null;
  connected: boolean;
  created_at: string;
}

const Conexoes = () => {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    appName: "",
    accessToken: "",
    whatsappNumber: ""
  });

  useEffect(() => {
    if (user) {
      fetchChannels();
    }
  }, [user]);

  const fetchChannels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("channels")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar canais");
      setLoading(false);
      return;
    }

    setChannels(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      appName: "",
      accessToken: "",
      whatsappNumber: ""
    });
  };

  const handleConnect = async () => {
    if (!formData.name.trim()) {
      toast.error("Preencha o nome do canal");
      return;
    }
    if (!formData.appName.trim()) {
      toast.error("Preencha o nome do app");
      return;
    }
    if (!formData.accessToken.trim()) {
      toast.error("Preencha o token de acesso");
      return;
    }
    if (!formData.whatsappNumber.trim()) {
      toast.error("Preencha o número do WhatsApp");
      return;
    }

    // Validate phone format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleanPhone = formData.whatsappNumber.replace(/\s/g, "");
    if (!phoneRegex.test(cleanPhone)) {
      toast.error("Número de telefone inválido. Use o formato: +5511999999999");
      return;
    }

    const { error } = await supabase.from("channels").insert({
      user_id: user?.id,
      name: formData.name.trim(),
      phone: cleanPhone,
      provider: "notificame",
      app_name: formData.appName.trim(),
      access_token: formData.accessToken.trim(),
      connected: true,
    });

    if (error) {
      toast.error("Erro ao conectar canal");
      return;
    }

    toast.success("Canal conectado com sucesso!");
    setIsDialogOpen(false);
    resetForm();
    fetchChannels();
  };

  const handleToggleConnection = async (channel: Channel) => {
    const { error } = await supabase
      .from("channels")
      .update({ connected: !channel.connected })
      .eq("id", channel.id);

    if (error) {
      toast.error("Erro ao atualizar canal");
      return;
    }

    toast.success(channel.connected ? "Canal desconectado" : "Canal reconectado");
    fetchChannels();
  };

  const handleDeleteChannel = async (id: string) => {
    const { error } = await supabase.from("channels").delete().eq("id", id);

    if (error) {
      toast.error("Erro ao excluir canal");
      return;
    }

    toast.success("Canal excluído");
    fetchChannels();
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Conexões WhatsApp</h1>
          <p className="text-muted-foreground">Gerencie suas conexões com provedores BSP</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={fetchChannels}>
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
          <Button className="gap-2" onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="w-4 h-4" />
            Nova Conexão
          </Button>
        </div>
      </div>

      {/* Integration Card */}
      <div className="bg-card rounded-lg border border-border p-6 animate-slide-up">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-muted/30 flex items-center justify-center border border-border">
            <Link2 className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Integração Notifica.me
            </h3>
            <p className="text-muted-foreground text-sm mb-3">
              O Notifica.me é um provedor BSP oficial do WhatsApp. Conecte sua conta para enviar e receber mensagens.
            </p>
            <a 
              href="https://notifica.me" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
            >
              Criar conta no Notifica.me
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <Button variant="outline" onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            Configurar
          </Button>
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-6 p-4 bg-muted/20 rounded-lg border border-border">
        <h4 className="font-medium text-foreground mb-2">Como obter suas credenciais?</h4>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Acesse o painel do Notifica.me e faça login</li>
          <li>Vá em Configurações → API</li>
          <li>Copie o Token de Acesso e o Nome do App</li>
          <li>Cole as informações no formulário acima</li>
        </ol>
      </div>

      {/* Connected Numbers Section */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Números Conectados ({channels.length})
        </h3>
        
        {loading ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : channels.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <Link2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Nenhum número conectado ainda</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Configure uma integração acima para começar a enviar mensagens
            </p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              Conectar primeiro número
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((channel) => (
              <div 
                key={channel.id}
                className={cn(
                  "bg-card rounded-lg border p-5 transition-all",
                  channel.connected 
                    ? "border-primary/30 hover:border-primary/50" 
                    : "border-border opacity-60"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      channel.connected 
                        ? "bg-primary/10 border border-primary/20" 
                        : "bg-muted/50 border border-border"
                    )}>
                      <Smartphone className={cn(
                        "w-5 h-5",
                        channel.connected ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">{channel.name}</h4>
                      <p className="text-sm text-muted-foreground">{channel.phone}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border z-50">
                      <DropdownMenuItem 
                        className="gap-2 cursor-pointer"
                        onClick={() => handleToggleConnection(channel)}
                      >
                        {channel.connected ? (
                          <>
                            <PowerOff className="w-4 h-4" />
                            Desconectar
                          </>
                        ) : (
                          <>
                            <Power className="w-4 h-4" />
                            Reconectar
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="gap-2 cursor-pointer text-destructive"
                        onClick={() => handleDeleteChannel(channel.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Provedor: {channel.provider}
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      channel.connected 
                        ? "bg-primary/10 text-primary border-primary/30" 
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {channel.connected ? "Conectado" : "Desconectado"}
                  </Badge>
                </div>

                {channel.connected && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span className="text-xs text-muted-foreground">Pronto para enviar</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connect Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Conectar Notifica.me</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Configure sua conexão com a API do Notifica.me para enviar e receber mensagens
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-foreground">Nome do Canal</Label>
              <Input 
                placeholder="Ex: WhatsApp Vendas" 
                className="bg-muted/30 border-border"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Um nome para identificar este canal
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Nome do App</Label>
              <Input 
                placeholder="seu-email@exemplo.com" 
                className="bg-muted/30 border-border"
                value={formData.appName}
                onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Token de Acesso</Label>
              <Input 
                type="password"
                placeholder="••••••••••"
                className="bg-muted/30 border-border"
                value={formData.accessToken}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Número WhatsApp</Label>
              <Input 
                placeholder="+5511999999999"
                className="bg-muted/30 border-border"
                value={formData.whatsappNumber}
                onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Formato internacional com código do país
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConnect}>
              Conectar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Conexoes;
