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
  RefreshCw,
  Loader2,
  CheckCircle2
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
  const [isValidating, setIsValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    appName: "",
    apiKey: "",
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
      apiKey: "",
      whatsappNumber: ""
    });
    setIsValidated(false);
  };

  const handleValidateCredentials = async () => {
    if (!formData.appName.trim()) {
      toast.error("Preencha o App Name do Gupshup");
      return;
    }
    if (!formData.apiKey.trim()) {
      toast.error("Preencha a API Key do Gupshup");
      return;
    }

    setIsValidating(true);

    try {
      const { data, error } = await supabase.functions.invoke('gupshup-validate', {
        body: {
          apiKey: formData.apiKey.trim(),
          appName: formData.appName.trim(),
          sourcePhone: formData.whatsappNumber.trim()
        }
      });

      if (error) {
        console.error('Validation error:', error);
        toast.error('Erro ao validar credenciais');
        setIsValidating(false);
        return;
      }

      if (data.success) {
        toast.success(data.message);
        setIsValidated(true);
        // Auto-fill phone if returned from API
        if (data.appInfo?.phone && !formData.whatsappNumber) {
          setFormData(prev => ({ ...prev, whatsappNumber: data.appInfo.phone }));
        }
      } else {
        toast.error(data.error || 'Credenciais inválidas');
      }
    } catch (err) {
      console.error('Validation error:', err);
      toast.error('Erro ao validar credenciais');
    }

    setIsValidating(false);
  };

  const handleConnect = async () => {
    if (!formData.name.trim()) {
      toast.error("Preencha o nome do canal");
      return;
    }
    if (!formData.appName.trim()) {
      toast.error("Preencha o App Name do Gupshup");
      return;
    }
    if (!formData.apiKey.trim()) {
      toast.error("Preencha a API Key do Gupshup");
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
      provider: "gupshup",
      app_name: formData.appName.trim(),
      access_token: formData.apiKey.trim(),
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
          <p className="text-muted-foreground">Gerencie suas conexões com o Gupshup</p>
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
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Link2 className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Integração Gupshup
            </h3>
            <p className="text-muted-foreground text-sm mb-3">
              O Gupshup é um provedor BSP oficial do WhatsApp Business API. Conecte sua conta para enviar e receber mensagens.
            </p>
            <a 
              href="https://www.gupshup.io/whatsapp-api" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-500 text-sm hover:underline"
            >
              Criar conta no Gupshup
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
        <h4 className="font-medium text-foreground mb-2">Como obter suas credenciais Gupshup?</h4>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Acesse o <a href="https://www.gupshup.io/developer/home" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">painel do Gupshup</a> e faça login</li>
          <li>Crie um novo App ou selecione um existente</li>
          <li>No dashboard do app, copie a <strong>API Key</strong> e o <strong>App Name</strong></li>
          <li>Cole as informações no formulário de conexão</li>
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
                    ? "border-emerald-500/30 hover:border-emerald-500/50" 
                    : "border-border opacity-60"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      channel.connected 
                        ? "bg-emerald-500/10 border border-emerald-500/20" 
                        : "bg-muted/50 border border-border"
                    )}>
                      <Smartphone className={cn(
                        "w-5 h-5",
                        channel.connected ? "text-emerald-500" : "text-muted-foreground"
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
                    Provedor: <span className="capitalize">{channel.provider}</span>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      channel.connected 
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" 
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {channel.connected ? "Conectado" : "Desconectado"}
                  </Badge>
                </div>

                {channel.connected && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
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
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Conectar Gupshup</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Configure sua conexão com a API do Gupshup WhatsApp Business
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
              <Label className="text-foreground">App Name (Gupshup)</Label>
              <Input 
                placeholder="meu-app-whatsapp" 
                className="bg-muted/30 border-border"
                value={formData.appName}
                onChange={(e) => { setFormData({ ...formData, appName: e.target.value }); setIsValidated(false); }}
              />
              <p className="text-xs text-muted-foreground">
                Nome do app criado no Gupshup Dashboard
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">API Key (Gupshup)</Label>
              <Input 
                type="password"
                placeholder="••••••••••"
                className="bg-muted/30 border-border"
                value={formData.apiKey}
                onChange={(e) => { setFormData({ ...formData, apiKey: e.target.value }); setIsValidated(false); }}
              />
              <p className="text-xs text-muted-foreground">
                Encontre sua API Key no painel do Gupshup
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Número WhatsApp (Source)</Label>
              <Input 
                placeholder="+5511999999999"
                className="bg-muted/30 border-border"
                value={formData.whatsappNumber}
                onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Número configurado no seu app Gupshup
              </p>
            </div>

            {/* Validation Button */}
            {!isValidated && (
              <Button 
                type="button" 
                variant="outline" 
                className="w-full gap-2"
                onClick={handleValidateCredentials}
                disabled={isValidating || !formData.appName || !formData.apiKey}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Validar Credenciais
                  </>
                )}
              </Button>
            )}

            {isValidated && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="text-sm text-emerald-500">Credenciais validadas com sucesso!</span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConnect} disabled={!isValidated}>
              Conectar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Conexoes;
