import { useState, useEffect } from "react";
import { 
  Plus, 
  ExternalLink,
  Smartphone,
  MoreVertical,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Loader2,
  Copy,
  Webhook,
  Eye,
  EyeOff,
  Info,
  Check,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Pencil
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
import { Checkbox } from "@/components/ui/checkbox";
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
  webhook_verify_token: string | null;
  waba_id: string | null;
  connected: boolean;
  created_at: string;
}

interface MetaPhoneNumber {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string;
  codeVerificationStatus?: string;
  customName?: string;
}

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
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showChannelConfig, setShowChannelConfig] = useState<Channel | null>(null);
  
  // Step-based flow
  const [step, setStep] = useState<'credentials' | 'select-numbers'>('credentials');
  const [isFetchingPhones, setIsFetchingPhones] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [availablePhones, setAvailablePhones] = useState<MetaPhoneNumber[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [sharedVerifyToken, setSharedVerifyToken] = useState<string>('');
  const [showWabaConfig, setShowWabaConfig] = useState<{ wabaId: string; verifyToken: string } | null>(null);
  
  // Sync dialog state
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFormData, setSyncFormData] = useState({ wabaId: "", accessToken: "" });
  const [showSyncToken, setShowSyncToken] = useState(false);
  
  const [formData, setFormData] = useState({
    wabaId: "",
    accessToken: "",
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
    setFormData({
      wabaId: "",
      accessToken: "",
    });
    setShowAccessToken(false);
    setStep('credentials');
    setAvailablePhones([]);
    setSelectedPhones([]);
    setSharedVerifyToken('');
  };

  // Sync existing channels with Meta API data
  const handleSyncChannels = async () => {
    if (!syncFormData.wabaId.trim() || !syncFormData.accessToken.trim()) {
      toast.error("Preencha WABA ID e Access Token");
      return;
    }

    setIsSyncing(true);

    try {
      // Fetch phones from Meta API
      const { data, error } = await supabase.functions.invoke('meta-fetch-phones', {
        body: {
          wabaId: syncFormData.wabaId.trim(),
          accessToken: syncFormData.accessToken.trim(),
        },
      });

      if (error || data.error) {
        toast.error(data?.error || "Erro ao buscar números do Meta");
        setIsSyncing(false);
        return;
      }

      if (!data.phones || data.phones.length === 0) {
        toast.error("Nenhum número encontrado nesta WABA");
        setIsSyncing(false);
        return;
      }

      // Match phones with existing channels and update
      let updatedCount = 0;
      for (const metaPhone of data.phones) {
        const cleanMetaPhone = metaPhone.displayPhoneNumber.replace(/\D/g, '');
        
        // Find matching channel by phone number
        const matchingChannel = channels.find(ch => {
          const cleanChannelPhone = ch.phone.replace(/\D/g, '');
          return cleanChannelPhone === cleanMetaPhone || 
                 cleanChannelPhone.endsWith(cleanMetaPhone) || 
                 cleanMetaPhone.endsWith(cleanChannelPhone);
        });

        if (matchingChannel) {
          // Update channel with correct Phone Number ID and other data
          const { error: updateError } = await supabase
            .from("channels")
            .update({
              app_name: metaPhone.id, // Phone Number ID
              waba_id: syncFormData.wabaId.trim(),
              access_token: syncFormData.accessToken.trim(),
            })
            .eq("id", matchingChannel.id);

          if (!updateError) {
            updatedCount++;
            console.log(`Updated channel ${matchingChannel.name} with Phone Number ID: ${metaPhone.id}`);
          }
        }
      }

      if (updatedCount > 0) {
        toast.success(`${updatedCount} canal(is) atualizado(s) com sucesso!`);
        setShowSyncDialog(false);
        setSyncFormData({ wabaId: "", accessToken: "" });
        await fetchChannels();
      } else {
        toast.warning("Nenhum canal foi encontrado para sincronizar. Verifique se os números correspondem.");
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast.error("Erro ao sincronizar canais");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFetchPhones = async () => {
    if (!formData.wabaId.trim()) {
      toast.error("Preencha o WABA ID");
      return;
    }
    if (!formData.accessToken.trim()) {
      toast.error("Preencha o Access Token");
      return;
    }

    setIsFetchingPhones(true);

    try {
      const { data, error } = await supabase.functions.invoke('meta-fetch-phones', {
        body: {
          wabaId: formData.wabaId.trim(),
          accessToken: formData.accessToken.trim(),
        },
      });

      if (error) {
        console.error('Error invoking function:', error);
        toast.error("Erro ao buscar números. Verifique suas credenciais.");
        setIsFetchingPhones(false);
        return;
      }

      if (data.error) {
        toast.error(data.error);
        setIsFetchingPhones(false);
        return;
      }

      if (!data.phones || data.phones.length === 0) {
        toast.error("Nenhum número encontrado nesta WABA");
        setIsFetchingPhones(false);
        return;
      }

      // Filter out phones that are already connected and add customName
      const existingPhones = channels.map(c => c.phone.replace(/\D/g, ''));
      const newPhones = data.phones
        .filter((phone: MetaPhoneNumber) => {
          const cleanPhone = phone.displayPhoneNumber.replace(/\D/g, '');
          return !existingPhones.includes(cleanPhone);
        })
        .map((phone: MetaPhoneNumber) => ({
          ...phone,
          customName: phone.verifiedName || `WhatsApp ${phone.displayPhoneNumber}`,
        }));

      if (newPhones.length === 0) {
        toast.error("Todos os números desta WABA já estão conectados");
        setIsFetchingPhones(false);
        return;
      }

      setAvailablePhones(newPhones);
      // Generate ONE shared verify token for all numbers in this WABA
      setSharedVerifyToken(generateVerifyToken());
      setStep('select-numbers');
      toast.success(`${newPhones.length} número(s) disponível(is) encontrado(s)`);
    } catch (err) {
      console.error('Fetch phones error:', err);
      toast.error("Erro ao buscar números");
    } finally {
      setIsFetchingPhones(false);
    }
  };

  const handlePhoneSelection = (phoneId: string) => {
    setSelectedPhones(prev => 
      prev.includes(phoneId) 
        ? prev.filter(id => id !== phoneId)
        : [...prev, phoneId]
    );
  };

  const handlePhoneNameChange = (phoneId: string, newName: string) => {
    setAvailablePhones(prev => 
      prev.map(phone => 
        phone.id === phoneId 
          ? { ...phone, customName: newName }
          : phone
      )
    );
  };

  const handleSelectAll = () => {
    if (selectedPhones.length === availablePhones.length) {
      setSelectedPhones([]);
    } else {
      setSelectedPhones(availablePhones.map(p => p.id));
    }
  };

  const handleConnectSelected = async () => {
    if (selectedPhones.length === 0) {
      toast.error("Selecione pelo menos um número");
      return;
    }

    setIsConnecting(true);

    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .maybeSingle();

      const phonesToConnect = availablePhones.filter(p => selectedPhones.includes(p.id));
      const results = { success: 0, failed: 0 };
      const wabaId = formData.wabaId.trim();

      for (const phone of phonesToConnect) {
        // Format phone number
        let formattedPhone = phone.displayPhoneNumber.replace(/\D/g, '');
        if (!formattedPhone.startsWith('+')) {
          formattedPhone = '+' + formattedPhone;
        }

        const { error } = await supabase.from("channels").insert({
          user_id: user?.id,
          organization_id: profileData?.organization_id || null,
          name: phone.customName || phone.verifiedName || `WhatsApp ${phone.displayPhoneNumber}`,
          phone: formattedPhone,
          provider: "meta",
          app_name: phone.id, // Phone Number ID
          access_token: formData.accessToken.trim(),
          webhook_verify_token: sharedVerifyToken, // Use shared token for all numbers in this WABA
          waba_id: wabaId, // Store WABA ID to group channels
          connected: false,
        });

        if (error) {
          console.error('Error inserting channel:', error);
          results.failed++;
        } else {
          results.success++;
        }
      }

      if (results.success > 0) {
        toast.success(`${results.success} canal(is) criado(s) com sucesso!`);
        if (results.failed > 0) {
          toast.warning(`${results.failed} canal(is) falhou(aram)`);
        }
        setIsDialogOpen(false);
        // Show unified webhook config
        setShowWabaConfig({ wabaId, verifyToken: sharedVerifyToken });
        resetForm();
        await fetchChannels();
      } else {
        toast.error("Erro ao criar canais");
      }
    } catch (err) {
      console.error('Connect error:', err);
      toast.error("Erro ao conectar números");
    } finally {
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

    toast.success(channel.connected ? "Canal desconectado" : "Canal ativado");
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
          <p className="text-muted-foreground">Conecte seus números via Meta Cloud API</p>
        </div>
        <div className="flex items-center gap-2">
      <Button variant="outline" className="gap-2" onClick={fetchChannels}>
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
          {channels.length > 0 && (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setShowSyncDialog(true)}
            >
              <RefreshCw className="w-4 h-4" />
              Sincronizar com Meta
            </Button>
          )}
          <Button className="gap-2" onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="w-4 h-4" />
            Nova Conexão
          </Button>
        </div>
      </div>

      {/* Meta Cloud API Info Card */}
      <div className="bg-card rounded-lg border border-border p-6 animate-slide-up mb-6">
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
                Gratuito
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mb-3">
              Conexão direta com a API oficial do WhatsApp. Sem custos de provedor intermediário.
            </p>
            <a 
              href="https://developers.facebook.com/apps/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-500 text-sm hover:underline"
            >
              Acessar Meta Developer Console
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            Conectar
          </Button>
        </div>
      </div>

      {/* Setup Guide */}
      <div className="p-4 bg-muted/20 rounded-lg border border-border mb-6">
        <h4 className="font-medium text-foreground mb-3">Como configurar seu App Meta?</h4>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Acesse o <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Meta Developer Console</a> e crie um novo app (tipo: Business)</li>
          <li>Adicione o produto <strong>WhatsApp</strong> ao seu app</li>
          <li>Em <strong>API Setup</strong>, copie o <strong>WhatsApp Business Account ID</strong></li>
          <li>Gere um <strong>Access Token permanente</strong> em Business Settings → System Users</li>
          <li>Conecte aqui e selecione os números que deseja adicionar</li>
        </ol>
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
            <Smartphone className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
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
                    : "border-amber-500/30 hover:border-amber-500/50"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      channel.connected 
                        ? "bg-blue-500/10 border border-blue-500/20"
                        : "bg-amber-500/10 border border-amber-500/20"
                    )}>
                      <Smartphone className={cn(
                        "w-5 h-5",
                        channel.connected ? "text-blue-500" : "text-amber-500"
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
                        onClick={() => setShowChannelConfig(channel)}
                      >
                        <Webhook className="w-4 h-4" />
                        Ver Configuração
                      </DropdownMenuItem>
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
                            Ativar
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
                  <Badge 
                    variant="outline" 
                    className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30"
                  >
                    Meta Cloud API
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      channel.connected 
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" 
                        : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                    )}
                  >
                    {channel.connected ? "Ativo" : "Pendente"}
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

                {!channel.connected && (
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

      {/* Connect Dialog - Step-based */}
      <Dialog 
        open={isDialogOpen} 
        onOpenChange={(open) => { 
          if (!isFetchingPhones && !isConnecting) {
            setIsDialogOpen(open); 
            if (!open) resetForm(); 
          }
        }}
      >
        <DialogContent 
          className="sm:max-w-lg bg-card border-border" 
          onInteractOutside={(e) => (isFetchingPhones || isConnecting) && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {step === 'credentials' ? 'Conectar WhatsApp Business' : 'Selecionar Números'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {step === 'credentials' 
                ? 'Insira as credenciais da sua WABA para buscar os números disponíveis'
                : `Selecione os números que deseja conectar (${selectedPhones.length} selecionado${selectedPhones.length !== 1 ? 's' : ''})`
              }
            </DialogDescription>
          </DialogHeader>

          {step === 'credentials' && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-sm text-blue-400">
                  <strong>Pré-requisito:</strong> Crie um app no{" "}
                  <a href="https://developers.facebook.com/apps/" target="_blank" className="underline">
                    Meta Developer Console
                  </a>
                  {" "}e adicione o produto WhatsApp.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">WhatsApp Business Account ID (WABA ID)</Label>
                <Input 
                  placeholder="Ex: 123456789012345" 
                  className="bg-muted/30 border-border"
                  value={formData.wabaId}
                  onChange={(e) => setFormData({ ...formData, wabaId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Encontre em: WhatsApp → API Setup → WhatsApp Business Account ID
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Access Token (Permanente)</Label>
                <div className="relative">
                  <Input 
                    type={showAccessToken ? "text" : "password"}
                    placeholder="EAAG..."
                    className="bg-muted/30 border-border pr-10"
                    value={formData.accessToken}
                    onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
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
                  onClick={handleFetchPhones} 
                  disabled={isFetchingPhones || !formData.wabaId || !formData.accessToken}
                  className="gap-2"
                >
                  {isFetchingPhones ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      Buscar Números
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 'select-numbers' && (
            <div className="space-y-4 py-2">
              {/* Select All */}
              <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="select-all"
                    checked={selectedPhones.length === availablePhones.length}
                    onCheckedChange={handleSelectAll}
                  />
                  <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Selecionar todos ({availablePhones.length})
                  </Label>
                </div>
                <Badge variant="outline" className="text-xs">
                  {selectedPhones.length} selecionado{selectedPhones.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Phone List */}
              <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
                {availablePhones.map((phone) => (
                  <div 
                    key={phone.id}
                    className={cn(
                      "rounded-lg border transition-all",
                      selectedPhones.includes(phone.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div 
                      className="flex items-center gap-3 p-3 cursor-pointer"
                      onClick={() => handlePhoneSelection(phone.id)}
                    >
                      <Checkbox 
                        checked={selectedPhones.includes(phone.id)}
                        onCheckedChange={() => handlePhoneSelection(phone.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {phone.displayPhoneNumber}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {phone.qualityRating && (
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-xs",
                              phone.qualityRating === 'GREEN' 
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                : phone.qualityRating === 'YELLOW'
                                ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                : "bg-red-500/10 text-red-500 border-red-500/30"
                            )}
                          >
                            {phone.qualityRating === 'GREEN' ? 'Alta' : phone.qualityRating === 'YELLOW' ? 'Média' : 'Baixa'}
                          </Badge>
                        )}
                        {selectedPhones.includes(phone.id) && (
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </div>
                    
                    {/* Editable name field */}
                    <div className="px-3 pb-3 pt-0">
                      <div className="flex items-center gap-2">
                        <Pencil className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <Input
                          value={phone.customName || ''}
                          onChange={(e) => handlePhoneNameChange(phone.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Nome do canal"
                          className="h-8 text-sm bg-muted/30 border-border"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep('credentials')}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </Button>
                <Button 
                  onClick={handleConnectSelected} 
                  disabled={isConnecting || selectedPhones.length === 0}
                  className="gap-2"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Conectar {selectedPhones.length} Número{selectedPhones.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Channel Config Dialog */}
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
                  <strong>No Meta Developer Console, vá em:</strong>
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
                  <strong>Após configurar:</strong> Clique em "Verify and Save" no Meta, depois ative o canal aqui.
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

      {/* WABA Unified Webhook Config Dialog */}
      <Dialog open={!!showWabaConfig} onOpenChange={(open) => !open && setShowWabaConfig(null)}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Webhook className="w-5 h-5" />
              Configuração do Webhook
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Configure o webhook para a WABA <strong>{showWabaConfig?.wabaId}</strong>. 
              Este token serve para todos os números conectados.
            </DialogDescription>
          </DialogHeader>

          {showWabaConfig && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-sm text-blue-400 mb-2">
                  <strong>Importante:</strong> Todos os números desta WABA usam o mesmo webhook.
                </p>
                <p className="text-xs text-muted-foreground">
                  Configure apenas uma vez no Meta Developer Console.
                </p>
              </div>

              <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <p className="text-sm text-amber-400 mb-2">
                  <strong>No Meta Developer Console, vá em:</strong>
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
                <Label className="text-foreground text-sm">Verify Token (único para todos os números)</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted/50 px-3 py-2.5 rounded border border-border font-mono overflow-x-auto">
                    {showWabaConfig.verifyToken}
                  </code>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => copyToClipboard(showWabaConfig.verifyToken, "Token")} 
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
                  <strong>Após configurar:</strong> Clique em "Verify and Save" no Meta, depois ative os canais.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowWabaConfig(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sync Dialog */}
      <Dialog open={showSyncDialog} onOpenChange={(open) => !isSyncing && setShowSyncDialog(open)}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Sincronizar Canais com Meta
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Atualize os Phone Number IDs dos canais existentes buscando os dados mais recentes da API do Meta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <p className="text-sm text-blue-400">
                Esta função atualiza os canais existentes com os IDs corretos da API do Meta, corrigindo erros de "Account not registered".
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">WhatsApp Business Account ID (WABA ID)</Label>
              <Input 
                placeholder="Ex: 123456789012345" 
                className="bg-muted/30 border-border"
                value={syncFormData.wabaId}
                onChange={(e) => setSyncFormData({ ...syncFormData, wabaId: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Access Token</Label>
              <div className="relative">
                <Input 
                  type={showSyncToken ? "text" : "password"}
                  placeholder="EAAG..."
                  className="bg-muted/30 border-border pr-10"
                  value={syncFormData.accessToken}
                  onChange={(e) => setSyncFormData({ ...syncFormData, accessToken: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowSyncToken(!showSyncToken)}
                >
                  {showSyncToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowSyncDialog(false)} disabled={isSyncing}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSyncChannels} 
                disabled={isSyncing || !syncFormData.wabaId || !syncFormData.accessToken}
                className="gap-2"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sincronizar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Conexoes;
