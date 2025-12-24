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
  CheckCircle2,
  Copy,
  FileText,
  Webhook,
  Eye,
  EyeOff,
  Info
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface Channel {
  id: string;
  name: string;
  phone: string;
  provider: string;
  app_name: string | null;
  access_token: string | null;
  webhook_verify_token: string | null;
  connected: boolean;
  created_at: string;
}

const GUPSHUP_WEBHOOK_URL = `https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/gupshup-webhook`;
const META_WEBHOOK_URL = `https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/meta-webhook`;

// Generate a random verify token
const generateVerifyToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const Conexoes = () => {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncingTemplates, setIsSyncingTemplates] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<"meta" | "gupshup">("meta");
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showChannelConfig, setShowChannelConfig] = useState<Channel | null>(null);
  
  // Gupshup form
  const [gupshupForm, setGupshupForm] = useState({
    name: "",
    appName: "",
    apiKey: "",
    whatsappNumber: ""
  });
  
  // Meta form - simplified
  const [metaForm, setMetaForm] = useState({
    name: "",
    phoneNumberId: "",
    accessToken: "",
    whatsappNumber: "",
    verifyToken: generateVerifyToken()
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

    setChannels((data as Channel[]) || []);
    setLoading(false);
  };

  const resetForm = () => {
    setGupshupForm({
      name: "",
      appName: "",
      apiKey: "",
      whatsappNumber: ""
    });
    setMetaForm({
      name: "",
      phoneNumberId: "",
      accessToken: "",
      whatsappNumber: "",
      verifyToken: generateVerifyToken()
    });
    setIsValidated(false);
    setShowAccessToken(false);
  };

  const handleValidateGupshup = async () => {
    if (!gupshupForm.appName.trim()) {
      toast.error("Preencha o App Name do Gupshup");
      return;
    }
    if (!gupshupForm.apiKey.trim()) {
      toast.error("Preencha a API Key do Gupshup");
      return;
    }

    setIsValidating(true);

    try {
      const { error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError) {
        toast.error('Sessão expirada. Por favor, faça login novamente.');
        setIsValidating(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('gupshup-validate', {
        body: {
          apiKey: gupshupForm.apiKey.trim(),
          appName: gupshupForm.appName.trim(),
          sourcePhone: gupshupForm.whatsappNumber.trim()
        }
      });

      if (error) {
        toast.error('Erro ao validar credenciais');
        setIsValidating(false);
        return;
      }

      if (data.success) {
        toast.success(data.message);
        setIsValidated(true);
        if (data.appInfo?.phone && !gupshupForm.whatsappNumber) {
          setGupshupForm(prev => ({ ...prev, whatsappNumber: data.appInfo.phone }));
        }
      } else {
        toast.error(data.error || 'Credenciais inválidas');
      }
    } catch (err) {
      toast.error('Erro ao validar credenciais');
    }

    setIsValidating(false);
  };

  const handleConnectGupshup = async () => {
    if (!gupshupForm.name.trim() || !gupshupForm.appName.trim() || !gupshupForm.apiKey.trim() || !gupshupForm.whatsappNumber.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleanPhone = gupshupForm.whatsappNumber.replace(/\s/g, "");
    if (!phoneRegex.test(cleanPhone)) {
      toast.error("Número de telefone inválido. Use o formato: +5511999999999");
      return;
    }

    setIsConnecting(true);

    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .maybeSingle();

      const { error } = await supabase.from("channels").insert({
        user_id: user?.id,
        organization_id: profileData?.organization_id || null,
        name: gupshupForm.name.trim(),
        phone: cleanPhone,
        provider: "gupshup",
        app_name: gupshupForm.appName.trim(),
        access_token: gupshupForm.apiKey.trim(),
        connected: true,
      });

      if (error) {
        toast.error("Erro ao conectar canal");
        setIsConnecting(false);
        return;
      }

      toast.success("Canal conectado com sucesso!");
      setIsDialogOpen(false);
      setTimeout(() => {
        resetForm();
        setIsConnecting(false);
      }, 100);
      await fetchChannels();
      
    } catch (err) {
      toast.error("Erro ao conectar canal");
      setIsConnecting(false);
    }
  };

  const handleConnectMeta = async () => {
    if (!metaForm.name.trim()) {
      toast.error("Preencha o nome do canal");
      return;
    }
    if (!metaForm.phoneNumberId.trim()) {
      toast.error("Preencha o Phone Number ID");
      return;
    }
    if (!metaForm.accessToken.trim()) {
      toast.error("Preencha o Access Token");
      return;
    }
    if (!metaForm.whatsappNumber.trim()) {
      toast.error("Preencha o número do WhatsApp");
      return;
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleanPhone = metaForm.whatsappNumber.replace(/\s/g, "");
    if (!phoneRegex.test(cleanPhone)) {
      toast.error("Número de telefone inválido. Use o formato: +5511999999999");
      return;
    }

    setIsConnecting(true);

    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .maybeSingle();

      const { data: newChannel, error } = await supabase.from("channels").insert({
        user_id: user?.id,
        organization_id: profileData?.organization_id || null,
        name: metaForm.name.trim(),
        phone: cleanPhone,
        provider: "meta",
        app_name: metaForm.phoneNumberId.trim(), // Phone Number ID stored in app_name
        access_token: metaForm.accessToken.trim(),
        webhook_verify_token: metaForm.verifyToken,
        connected: false, // Start as false until webhook is verified
      }).select().single();

      if (error) {
        toast.error("Erro ao criar canal");
        setIsConnecting(false);
        return;
      }

      toast.success("Canal criado! Configure o webhook no Meta Developer Console.");
      setIsDialogOpen(false);
      
      // Show config dialog for the new channel
      setTimeout(() => {
        resetForm();
        setIsConnecting(false);
        if (newChannel) {
          setShowChannelConfig(newChannel as Channel);
        }
      }, 100);
      
      await fetchChannels();
      
    } catch (err) {
      toast.error("Erro ao criar canal");
      setIsConnecting(false);
    }
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

  const handleSyncTemplates = async (channel: Channel) => {
    if (!channel.access_token || !channel.app_name) {
      toast.error("Canal não possui credenciais configuradas");
      return;
    }

    if (channel.provider !== 'gupshup') {
      toast.info("Sincronização de templates disponível apenas para Gupshup");
      return;
    }

    setIsSyncingTemplates(channel.id);

    try {
      const { data, error } = await supabase.functions.invoke('gupshup-templates', {
        body: {
          apiKey: channel.access_token,
          appName: channel.app_name,
          channelId: channel.id
        }
      });

      if (error) {
        toast.error('Erro ao sincronizar templates');
        return;
      }

      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.error || 'Erro ao sincronizar templates');
      }
    } catch (err) {
      toast.error('Erro ao sincronizar templates');
    }

    setIsSyncingTemplates(null);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Conexões WhatsApp</h1>
          <p className="text-muted-foreground">Conecte seus números via Meta Cloud API ou Gupshup</p>
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

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Meta Cloud API Card */}
        <div className="bg-card rounded-lg border border-border p-6 animate-slide-up">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-foreground">Meta Cloud API</h3>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                  Recomendado
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm mb-3">
                Conexão direta com a API oficial do WhatsApp. Sem custos de provedor, pague apenas pelo uso.
              </p>
              <a 
                href="https://developers.facebook.com/apps/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-500 text-sm hover:underline"
              >
                Meta Developer Console
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Gupshup Card */}
        <div className="bg-card rounded-lg border border-border p-6 animate-slide-up">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Link2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground mb-1">Gupshup</h3>
              <p className="text-muted-foreground text-sm mb-3">
                Provedor BSP oficial do WhatsApp. Configuração simplificada, mas com custos adicionais.
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
          </div>
        </div>
      </div>

      {/* Connected Numbers Section */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Números Conectados ({channels.length})
        </h3>
        
        {loading ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto text-muted-foreground/50 animate-spin mb-2" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : channels.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <Link2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Nenhum número conectado ainda</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Clique em "Nova Conexão" para começar
            </p>
            <Button className="mt-4" onClick={() => { resetForm(); setIsDialogOpen(true); }}>
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
                        ? channel.provider === 'meta' ? "bg-blue-500/10 border border-blue-500/20" : "bg-emerald-500/10 border border-emerald-500/20"
                        : "bg-muted/50 border border-border"
                    )}>
                      <Smartphone className={cn(
                        "w-5 h-5",
                        channel.connected 
                          ? channel.provider === 'meta' ? "text-blue-500" : "text-emerald-500"
                          : "text-muted-foreground"
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
                      {channel.provider === 'meta' && (
                        <DropdownMenuItem 
                          className="gap-2 cursor-pointer"
                          onClick={() => setShowChannelConfig(channel)}
                        >
                          <Webhook className="w-4 h-4" />
                          Ver Configuração
                        </DropdownMenuItem>
                      )}
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
                      {channel.provider === 'gupshup' && (
                        <DropdownMenuItem 
                          className="gap-2 cursor-pointer"
                          onClick={() => handleSyncTemplates(channel)}
                          disabled={isSyncingTemplates === channel.id}
                        >
                          {isSyncingTemplates === channel.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Sincronizando...
                            </>
                          ) : (
                            <>
                              <FileText className="w-4 h-4" />
                              Sincronizar Templates
                            </>
                          )}
                        </DropdownMenuItem>
                      )}
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
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      channel.provider === 'meta' 
                        ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                    )}
                  >
                    {channel.provider === 'meta' ? 'Meta Cloud API' : 'Gupshup'}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      channel.connected 
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" 
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {channel.connected ? "Conectado" : "Pendente"}
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

                {!channel.connected && channel.provider === 'meta' && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-2 text-xs"
                      onClick={() => setShowChannelConfig(channel)}
                    >
                      <Info className="w-3 h-3" />
                      Configurar Webhook
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connect Dialog */}
      <Dialog 
        open={isDialogOpen} 
        onOpenChange={(open) => { 
          if (!isConnecting) {
            setIsDialogOpen(open); 
            if (!open) resetForm(); 
          }
        }}
      >
        <DialogContent className="sm:max-w-lg bg-card border-border" onInteractOutside={(e) => isConnecting && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-foreground">Nova Conexão WhatsApp</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Escolha o provedor e configure suas credenciais
            </DialogDescription>
          </DialogHeader>

          <Tabs value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as "meta" | "gupshup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="meta" className="gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
                Meta Cloud API
              </TabsTrigger>
              <TabsTrigger value="gupshup" className="gap-2">
                <Link2 className="w-4 h-4" />
                Gupshup
              </TabsTrigger>
            </TabsList>

            {/* Meta Tab */}
            <TabsContent value="meta" className="space-y-4 mt-4">
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-sm text-blue-400">
                  <strong>Passo 1:</strong> Crie um app no{" "}
                  <a href="https://developers.facebook.com/apps/" target="_blank" className="underline">
                    Meta Developer Console
                  </a>
                  {" "}e adicione o produto WhatsApp.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Nome do Canal</Label>
                <Input 
                  placeholder="Ex: WhatsApp Vendas" 
                  className="bg-muted/30 border-border"
                  value={metaForm.name}
                  onChange={(e) => setMetaForm({ ...metaForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Número WhatsApp</Label>
                <Input 
                  placeholder="+5511999999999"
                  className="bg-muted/30 border-border"
                  value={metaForm.whatsappNumber}
                  onChange={(e) => setMetaForm({ ...metaForm, whatsappNumber: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  O número conectado ao seu app Meta
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Phone Number ID</Label>
                <Input 
                  placeholder="Ex: 123456789012345" 
                  className="bg-muted/30 border-border"
                  value={metaForm.phoneNumberId}
                  onChange={(e) => setMetaForm({ ...metaForm, phoneNumberId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Encontre em: WhatsApp → API Setup → Phone number ID
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Access Token (Permanente)</Label>
                <div className="relative">
                  <Input 
                    type={showAccessToken ? "text" : "password"}
                    placeholder="EAAG..."
                    className="bg-muted/30 border-border pr-10"
                    value={metaForm.accessToken}
                    onChange={(e) => setMetaForm({ ...metaForm, accessToken: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowAccessToken(!showAccessToken)}
                  >
                    {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Gere um token permanente em: Business Settings → System Users
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleConnectMeta} 
                  disabled={isConnecting || !metaForm.name || !metaForm.phoneNumberId || !metaForm.accessToken || !metaForm.whatsappNumber}
                  className="gap-2"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    "Criar Canal"
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Gupshup Tab */}
            <TabsContent value="gupshup" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-foreground">Nome do Canal</Label>
                <Input 
                  placeholder="Ex: WhatsApp Vendas" 
                  className="bg-muted/30 border-border"
                  value={gupshupForm.name}
                  onChange={(e) => setGupshupForm({ ...gupshupForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">App Name (Gupshup)</Label>
                <Input 
                  placeholder="meu-app-whatsapp" 
                  className="bg-muted/30 border-border"
                  value={gupshupForm.appName}
                  onChange={(e) => { setGupshupForm({ ...gupshupForm, appName: e.target.value }); setIsValidated(false); }}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">API Key (Gupshup)</Label>
                <Input 
                  type="password"
                  placeholder="••••••••••"
                  className="bg-muted/30 border-border"
                  value={gupshupForm.apiKey}
                  onChange={(e) => { setGupshupForm({ ...gupshupForm, apiKey: e.target.value }); setIsValidated(false); }}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Número WhatsApp</Label>
                <Input 
                  placeholder="+5511999999999"
                  className="bg-muted/30 border-border"
                  value={gupshupForm.whatsappNumber}
                  onChange={(e) => setGupshupForm({ ...gupshupForm, whatsappNumber: e.target.value })}
                />
              </div>

              {!isValidated && (
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full gap-2"
                  onClick={handleValidateGupshup}
                  disabled={isValidating || !gupshupForm.appName || !gupshupForm.apiKey}
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
                  <span className="text-sm text-emerald-500">Credenciais validadas!</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleConnectGupshup} 
                  disabled={!isValidated || isConnecting}
                  className="gap-2"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    "Conectar"
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Channel Config Dialog (for Meta) */}
      <Dialog open={!!showChannelConfig} onOpenChange={(open) => !open && setShowChannelConfig(null)}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Webhook className="w-5 h-5" />
              Configuração do Webhook
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Configure estes dados no seu app Meta Developer Console
            </DialogDescription>
          </DialogHeader>

          {showChannelConfig && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <p className="text-sm text-amber-400 mb-2">
                  <strong>Passo 2:</strong> No Meta Developer Console, vá em:
                </p>
                <p className="text-xs text-muted-foreground">
                  WhatsApp → Configuration → Webhook → Edit
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground text-sm">Callback URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted/50 px-3 py-2.5 rounded border border-border font-mono overflow-x-auto">
                    {META_WEBHOOK_URL}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(META_WEBHOOK_URL, "URL")} className="gap-1.5">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground text-sm">Verify Token</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted/50 px-3 py-2.5 rounded border border-border font-mono overflow-x-auto">
                    {showChannelConfig.webhook_verify_token}
                  </code>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => copyToClipboard(showChannelConfig.webhook_verify_token || '', "Token")} 
                    className="gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground text-sm">Webhook Fields (selecione todos)</Label>
                <div className="flex flex-wrap gap-2">
                  {['messages', 'message_template_status_update'].map((field) => (
                    <Badge key={field} variant="outline" className="text-xs">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <p className="text-sm text-emerald-400">
                  <strong>Passo 3:</strong> Após configurar, clique em "Verify and Save" no Meta. 
                  Depois, ative o canal aqui.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowChannelConfig(null)}>
                  Fechar
                </Button>
                {!showChannelConfig.connected && (
                  <Button 
                    onClick={async () => {
                      await handleToggleConnection(showChannelConfig);
                      setShowChannelConfig(null);
                    }}
                    className="gap-2"
                  >
                    <Power className="w-4 h-4" />
                    Ativar Canal
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Conexoes;
