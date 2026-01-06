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
  Pencil,
  MessageSquare,
  Bot
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  user_id: string;
  organization_id: string | null;
  organization?: {
    id: string;
    name: string;
  } | null;
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
  const { isSuperAdmin } = useUserRole();
  const { organizations, isImpersonating } = useSuperAdmin();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [channels, setChannels] = useState<Channel[]>([]);
  
  // For Super Admin: select which organization to assign new channels
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showChannelConfig, setShowChannelConfig] = useState<Channel | null>(null);
  
  // Chatbot linking state
  const [showChatbotDialog, setShowChatbotDialog] = useState<Channel | null>(null);
  const [chatbotAgents, setChatbotAgents] = useState<{ id: string; name: string; nickname: string | null }[]>([]);
  const [selectedChatbotAgent, setSelectedChatbotAgent] = useState<string>("");
  const [isChatbotEnabled, setIsChatbotEnabled] = useState(true);
  const [isSavingChatbot, setIsSavingChatbot] = useState(false);
  const [channelChatbotConfig, setChannelChatbotConfig] = useState<{ agent_id: string | null; is_enabled: boolean } | null>(null);
  
  // Connection type selection
  const [connectionType, setConnectionType] = useState<'meta' | 'zapi' | null>(null);
  
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
  
  // Register phone state
  const [isRegistering, setIsRegistering] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);
  const [channelStatuses, setChannelStatuses] = useState<Record<string, any>>({});
  const [isCheckingStatus, setIsCheckingStatus] = useState<Record<string, boolean>>({});
  const [metaPhoneStatuses, setMetaPhoneStatuses] = useState<Record<string, {
    code: string;
    isConnected: boolean;
    message: string;
    qualityRating?: string;
    qualityInfo?: string;
    error?: string;
  }>>({});
  
  // Z-API form data
  const [zapiFormData, setZapiFormData] = useState({
    instanceId: "",
    token: "",
    name: "",
    phone: "",
  });
  
  const [formData, setFormData] = useState({
    wabaId: "",
    accessToken: "",
  });

  useEffect(() => {
    if (user) {
      fetchChannels();
    }
  }, [user]);

  // Check Meta phone status for all Meta channels when channels load
  useEffect(() => {
    if (channels.length > 0) {
      checkAllMetaChannelStatuses();
    }
  }, [channels]);

  const checkAllMetaChannelStatuses = async () => {
    const metaChannels = channels.filter(ch => ch.provider === 'meta' && ch.app_name && ch.access_token);
    
    for (const channel of metaChannels) {
      // Skip if already checking or recently checked
      if (isCheckingStatus[channel.id] || metaPhoneStatuses[channel.id]) continue;
      
      checkMetaPhoneStatus(channel);
    }
  };

  const checkMetaPhoneStatus = async (channel: Channel) => {
    if (!channel.app_name || !channel.access_token) return;
    
    setIsCheckingStatus(prev => ({ ...prev, [channel.id]: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('meta-check-phone-status', {
        body: {
          phoneNumberId: channel.app_name,
          accessToken: channel.access_token,
        },
      });

      if (error) {
        console.error(`Error checking status for ${channel.id}:`, error);
        setMetaPhoneStatuses(prev => ({
          ...prev,
          [channel.id]: {
            code: 'ERROR',
            isConnected: false,
            message: 'Erro ao verificar',
            error: error.message,
          }
        }));
        return;
      }

      if (data?.status) {
        setMetaPhoneStatuses(prev => ({
          ...prev,
          [channel.id]: data.status
        }));
        
        // Update channel.connected in database if status differs
        if (data.status.isConnected !== channel.connected) {
          await supabase
            .from("channels")
            .update({ connected: data.status.isConnected })
            .eq("id", channel.id);
          
          // Also update local state to reflect the change immediately
          setChannels(prev => prev.map(ch => 
            ch.id === channel.id ? { ...ch, connected: data.status.isConnected } : ch
          ));
        }
      }
    } catch (err) {
      console.error(`Exception checking status for ${channel.id}:`, err);
    } finally {
      setIsCheckingStatus(prev => ({ ...prev, [channel.id]: false }));
    }
  };

  const fetchChannels = async () => {
    setLoading(true);
    setMetaPhoneStatuses({}); // Reset statuses to trigger fresh check
    
    // If impersonating, filter by the impersonated organization
    if (isImpersonating && effectiveOrganizationId) {
      const { data, error } = await supabase
        .from("channels")
        .select(`
          *,
          organization:organizations(id, name)
        `)
        .eq("organization_id", effectiveOrganizationId)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar canais");
        setLoading(false);
        return;
      }

      setChannels((data as Channel[]) || []);
    } else if (isSuperAdmin) {
      // Super Admin not impersonating sees all channels
      const { data, error } = await supabase
        .from("channels")
        .select(`
          *,
          organization:organizations(id, name)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar canais");
        setLoading(false);
        return;
      }

      setChannels((data as Channel[]) || []);
    } else {
      // Regular user sees only their organization's channels
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
    }
    
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      wabaId: "",
      accessToken: "",
    });
    setZapiFormData({
      instanceId: "",
      token: "",
      name: "",
      phone: "",
    });
    setConnectionType(null);
    setShowAccessToken(false);
    setStep('credentials');
    setAvailablePhones([]);
    setSelectedPhones([]);
    setSharedVerifyToken('');
    setSelectedOrgId("");
  };

  // Handle opening chatbot dialog for a channel
  const handleOpenChatbotDialog = async (channel: Channel) => {
    setShowChatbotDialog(channel);
    setSelectedChatbotAgent("");
    setIsChatbotEnabled(true);
    setChannelChatbotConfig(null);
    
    try {
      // Fetch active agents
      const { data: agents, error: agentsError } = await supabase
        .from("ai_agents")
        .select("id, name, nickname")
        .eq("is_active", true);
      
      if (agentsError) throw agentsError;
      setChatbotAgents(agents || []);
      
      // Fetch existing config for this channel
      const { data: config } = await supabase
        .from("chatbot_config")
        .select("agent_id, is_enabled")
        .eq("channel_id", channel.id)
        .maybeSingle();
      
      if (config) {
        setChannelChatbotConfig(config);
        setSelectedChatbotAgent(config.agent_id || "");
        setIsChatbotEnabled(config.is_enabled ?? true);
      }
    } catch (error) {
      console.error("Erro ao carregar dados do chatbot:", error);
      toast.error("Erro ao carregar dados do chatbot");
    }
  };

  // Handle saving chatbot config for a channel
  const handleSaveChatbotConfig = async () => {
    if (!showChatbotDialog || !selectedChatbotAgent) {
      toast.error("Selecione um chatbot");
      return;
    }

    setIsSavingChatbot(true);
    try {
      const channel = showChatbotDialog;
      
      // Check if config exists
      const { data: existing } = await supabase
        .from("chatbot_config")
        .select("id")
        .eq("channel_id", channel.id)
        .maybeSingle();

      if (existing) {
        // Update existing config
        await supabase
          .from("chatbot_config")
          .update({
            agent_id: selectedChatbotAgent,
            is_enabled: isChatbotEnabled,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        // Create new config
        await supabase.from("chatbot_config").insert({
          channel_id: channel.id,
          agent_id: selectedChatbotAgent,
          user_id: channel.user_id,
          organization_id: channel.organization_id,
          is_enabled: isChatbotEnabled,
        });
      }

      toast.success("Chatbot vinculado com sucesso!");
      setShowChatbotDialog(null);
    } catch (error) {
      console.error("Erro ao vincular chatbot:", error);
      toast.error("Erro ao vincular chatbot");
    } finally {
      setIsSavingChatbot(false);
    }
  };

  // Handle removing chatbot from channel
  const handleRemoveChatbot = async () => {
    if (!showChatbotDialog) return;

    setIsSavingChatbot(true);
    try {
      await supabase
        .from("chatbot_config")
        .delete()
        .eq("channel_id", showChatbotDialog.id);

      toast.success("Chatbot desvinculado do canal");
      setShowChatbotDialog(null);
    } catch (error) {
      console.error("Erro ao desvincular chatbot:", error);
      toast.error("Erro ao desvincular chatbot");
    } finally {
      setIsSavingChatbot(false);
    }
  };

  // Handle Z-API connection
  const handleConnectZapi = async () => {
    if (!zapiFormData.instanceId.trim() || !zapiFormData.token.trim() || !zapiFormData.name.trim() || !zapiFormData.phone.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    // Super Admin must select an organization
    if (isSuperAdmin && !selectedOrgId) {
      toast.error("Selecione a organização para esta conexão");
      return;
    }

    setIsConnecting(true);

    try {
      let targetOrgId: string | null = null;
      
      if (isSuperAdmin && selectedOrgId) {
        // Super Admin assigns to selected organization
        targetOrgId = selectedOrgId;
      } else {
        // Regular user uses their own organization
        const { data: profileData } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", user?.id)
          .maybeSingle();
        targetOrgId = profileData?.organization_id || null;
      }

      // Format phone number
      let formattedPhone = zapiFormData.phone.replace(/\D/g, '');
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
      }

      const { error } = await supabase.from("channels").insert({
        user_id: user?.id,
        organization_id: targetOrgId,
        name: zapiFormData.name.trim(),
        phone: formattedPhone,
        provider: "zapi",
        app_name: zapiFormData.instanceId.trim(), // Instance ID
        access_token: zapiFormData.token.trim(),
        connected: true,
      });

      if (error) {
        console.error('Error inserting Z-API channel:', error);
        toast.error("Erro ao criar canal Z-API");
      } else {
        toast.success("Canal Z-API criado com sucesso!");
        setIsDialogOpen(false);
        resetForm();
        await fetchChannels();
      }
    } catch (err) {
      console.error('Z-API connect error:', err);
      toast.error("Erro ao conectar Z-API");
    } finally {
      setIsConnecting(false);
    }
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

  // Register phone number with Meta Cloud API
  const handleRegisterPhone = async (channel: Channel) => {
    if (!channel.app_name || !channel.access_token) {
      toast.error("Canal não possui Phone Number ID ou Access Token");
      return;
    }

    setIsRegistering(channel.id);

    try {
      console.log(`Registering phone ${channel.app_name}...`);
      const { data, error } = await supabase.functions.invoke('meta-register-phone', {
        body: {
          phoneNumberId: channel.app_name,
          accessToken: channel.access_token,
        },
      });

      if (error) {
        console.error('Error registering phone:', error);
        toast.error("Erro ao registrar número: " + (error.message || "Erro desconhecido"));
        return;
      }

      console.log('Register response:', data);

      if (data.error) {
        toast.error(data.error);
        if (data.suggestion) {
          toast.info(data.suggestion, { duration: 8000 });
        }
        return;
      }

      // Update local status
      if (data.status) {
        setChannelStatuses(prev => ({ ...prev, [channel.id]: data.status }));
        setMetaPhoneStatuses(prev => ({
          ...prev,
          [channel.id]: {
            isConnected: data.status.status === 'CONNECTED',
            code: data.status.status || 'UNKNOWN',
            message: data.message || 'Status atualizado',
            qualityRating: data.status.quality_rating,
          }
        }));
      }

      if (data.registered || data.success) {
        toast.success(data.message || "Número registrado com sucesso na Cloud API!");
        
        // Auto-subscribe to webhook after registration
        try {
          console.log(`Subscribing WABA ${channel.waba_id} to webhook after registration...`);
          const { data: subscribeData, error: subscribeError } = await supabase.functions.invoke('meta-subscribe-webhook', {
            body: {
              wabaId: channel.waba_id,
              phoneNumberId: channel.app_name,
              accessToken: channel.access_token,
            },
          });

          if (subscribeError) {
            console.error('Error subscribing to webhook:', subscribeError);
            toast.warning("Número registrado, mas falha na inscrição do webhook");
          } else if (subscribeData?.success) {
            console.log(`Phone ${channel.app_name} subscribed to webhook successfully`);
            toast.success("Webhook inscrito com sucesso!");
          } else {
            console.warn(`Webhook subscription response:`, subscribeData);
          }
        } catch (subErr) {
          console.error('Exception subscribing to webhook:', subErr);
        }
        
        // Update channel as connected
        await supabase
          .from("channels")
          .update({ connected: true })
          .eq("id", channel.id);
        
        // Update local state
        setChannels(prev => 
          prev.map(ch => ch.id === channel.id ? { ...ch, connected: true } : ch)
        );
        
        await fetchChannels();
      } else {
        toast.warning(data.message || "Número pode precisar de verificação adicional no Meta");
      }
    } catch (err) {
      console.error('Register error:', err);
      toast.error("Erro ao registrar número");
    } finally {
      setIsRegistering(null);
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

    // Super Admin must select an organization for Meta connections too
    if (isSuperAdmin && !selectedOrgId) {
      toast.error("Selecione a organização para esta conexão");
      return;
    }

    setIsConnecting(true);

    try {
      let targetOrgId: string | null = null;
      
      if (isSuperAdmin && selectedOrgId) {
        // Super Admin assigns to selected organization
        targetOrgId = selectedOrgId;
      } else {
        // Regular user uses their own organization
        const { data: profileData } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", user?.id)
          .maybeSingle();
        targetOrgId = profileData?.organization_id || null;
      }

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
          organization_id: targetOrgId,
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
          // Auto-subscribe to webhook after creating channel (use WABA level)
          console.log(`Subscribing WABA ${wabaId} to webhook...`);
          try {
            const { data: subscribeData, error: subscribeError } = await supabase.functions.invoke('meta-subscribe-webhook', {
              body: {
                wabaId: wabaId,
                phoneNumberId: phone.id,
                accessToken: formData.accessToken.trim(),
              },
            });

            if (subscribeError) {
              console.error('Error subscribing to webhook:', subscribeError);
            } else if (subscribeData?.success) {
              console.log(`Phone ${phone.id} subscribed to webhook successfully`);
            } else {
              console.warn(`Webhook subscription response:`, subscribeData);
            }
          } catch (subErr) {
            console.error('Exception subscribing to webhook:', subErr);
          }
          
          results.success++;
        }
      }

      if (results.success > 0) {
        toast.success(`${results.success} canal(is) criado(s) e inscrito(s) no webhook!`);
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
    const newConnectedState = !channel.connected;
    
    // Optimistic update
    setChannels(prev => prev.map(c => 
      c.id === channel.id ? { ...c, connected: newConnectedState } : c
    ));
    
    const { error } = await supabase
      .from("channels")
      .update({ connected: newConnectedState })
      .eq("id", channel.id);

    if (error) {
      console.error('Toggle connection error:', error);
      // Revert optimistic update
      setChannels(prev => prev.map(c => 
        c.id === channel.id ? { ...c, connected: channel.connected } : c
      ));
      toast.error("Erro ao atualizar canal");
      return;
    }

    toast.success(newConnectedState ? "Canal ativado" : "Canal desconectado");
  };

  const handleDeleteChannel = async (id: string) => {
    // Optimistic update - remove from UI immediately
    const channelToDelete = channels.find(c => c.id === id);
    setChannels(prev => prev.filter(c => c.id !== id));
    
    const { error } = await supabase.from("channels").delete().eq("id", id);

    if (error) {
      console.error('Delete channel error:', error);
      // Revert optimistic update
      if (channelToDelete) {
        setChannels(prev => [...prev, channelToDelete]);
      }
      toast.error("Erro ao excluir canal");
      return;
    }

    toast.success("Canal excluído");
  };

  // Subscribe channel to webhook manually
  const handleSubscribeWebhook = async (channel: Channel) => {
    if (!channel.access_token) {
      toast.error("Canal não possui Access Token");
      return;
    }

    if (!channel.waba_id && !channel.app_name) {
      toast.error("Canal não possui WABA ID ou Phone Number ID");
      return;
    }

    setIsSubscribing(channel.id);

    try {
      console.log(`Subscribing WABA ${channel.waba_id} / phone ${channel.app_name} to webhook...`);
      const { data, error } = await supabase.functions.invoke('meta-subscribe-webhook', {
        body: {
          wabaId: channel.waba_id,
          phoneNumberId: channel.app_name,
          accessToken: channel.access_token,
        },
      });

      if (error) {
        console.error('Error subscribing to webhook:', error);
        toast.error("Erro ao inscrever no webhook");
        return;
      }

      if (data?.success) {
        toast.success("Webhook inscrito com sucesso! Agora as mensagens devem chegar.");
        
        // Mark channel as connected
        await supabase
          .from("channels")
          .update({ connected: true })
          .eq("id", channel.id);
        
        await fetchChannels();
      } else {
        toast.error(data?.error || "Falha na inscrição do webhook");
      }
    } catch (err) {
      console.error('Subscribe error:', err);
      toast.error("Erro ao inscrever no webhook");
    } finally {
      setIsSubscribing(null);
    }
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
                Oficial
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
          <Button onClick={() => { resetForm(); setConnectionType('meta'); setIsDialogOpen(true); }}>
            Conectar
          </Button>
        </div>
      </div>

      {/* Z-API Info Card - Only visible to Super Admin */}
      {isSuperAdmin && (
        <div className="bg-card rounded-lg border border-emerald-500/30 p-6 animate-slide-up mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <MessageSquare className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-foreground">Z-API</h3>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">
                  Não Oficial
                </Badge>
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30 text-xs">
                  Super Admin
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm mb-3">
                Conexão via Z-API para WhatsApp tradicional. Disponível apenas para configuração por administradores.
              </p>
              <a 
                href="https://developer.z-api.io/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-500 text-sm hover:underline"
              >
                Acessar Z-API Developer
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <Button 
              variant="outline" 
              className="border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
              onClick={() => { resetForm(); setConnectionType('zapi'); setIsDialogOpen(true); }}
            >
              Conectar Z-API
            </Button>
          </div>
        </div>
      )}

      {/* Setup Guide with Video Tutorial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Instructions */}
        <div className="p-5 bg-muted/20 rounded-lg border border-border">
          <h4 className="font-medium text-foreground mb-3">Como configurar seu App Meta?</h4>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Acesse o <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Meta Developer Console</a> e crie um novo app (tipo: Business)</li>
            <li>Adicione o produto <strong>WhatsApp</strong> ao seu app</li>
            <li>Em <strong>API Setup</strong>, copie o <strong>WhatsApp Business Account ID</strong></li>
            <li>Gere um <strong>Access Token permanente</strong> em Business Settings → System Users</li>
            <li>Conecte aqui e selecione os números que deseja adicionar</li>
          </ol>
        </div>

        {/* Video Tutorial */}
        <div className="p-5 bg-muted/20 rounded-lg border border-border">
          <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Tutorial em Vídeo
          </h4>
          <div className="relative aspect-video bg-black/50 rounded-lg overflow-hidden border border-border/50">
            {/* Placeholder Video - Replace with actual video URL later */}
            <video 
              className="w-full h-full object-cover"
              controls
              poster="https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80"
            >
              {/* Add your video source here */}
              <source src="" type="video/mp4" />
              Seu navegador não suporta vídeos.
            </video>
            
            {/* Overlay for empty state */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white">
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="text-sm font-medium">Vídeo Tutorial</p>
              <p className="text-xs text-white/60 mt-1">Em breve</p>
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
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground truncate">{channel.name}</h4>
                      <p className="text-sm text-muted-foreground">{channel.phone}</p>
                      {isSuperAdmin && channel.organization && (
                        <p className="text-xs text-primary/80 truncate mt-0.5">
                          {channel.organization.name}
                        </p>
                      )}
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
                        onClick={() => handleOpenChatbotDialog(channel)}
                      >
                        <Bot className="w-4 h-4" />
                        Vincular Chatbot
                      </DropdownMenuItem>
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
                        className="gap-2 cursor-pointer"
                        onClick={() => handleSubscribeWebhook(channel)}
                        disabled={isSubscribing === channel.id}
                      >
                        <Webhook className="w-4 h-4" />
                        {isSubscribing === channel.id ? 'Inscrevendo...' : 'Inscrever Webhook'}
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
                    className={cn(
                      "text-xs",
                      channel.provider === 'zapi'
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                        : "bg-blue-500/10 text-blue-500 border-blue-500/30"
                    )}
                  >
                    {channel.provider === 'zapi' ? 'Z-API' : 'Meta Cloud API'}
                  </Badge>
                  {/* Status badge with real Meta API status for meta channels */}
                  {channel.provider === 'meta' ? (
                    isCheckingStatus[channel.id] ? (
                      <Badge variant="outline" className="text-xs bg-muted/50 text-muted-foreground border-border gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Verificando
                      </Badge>
                    ) : metaPhoneStatuses[channel.id] ? (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs",
                          metaPhoneStatuses[channel.id].isConnected 
                            ? metaPhoneStatuses[channel.id].qualityRating === 'RED'
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                              : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : metaPhoneStatuses[channel.id].code === 'RESTRICTED'
                              ? "bg-red-500/10 text-red-500 border-red-500/30"
                              : metaPhoneStatuses[channel.id].code === 'ERROR' || metaPhoneStatuses[channel.id].code === 'TOKEN_EXPIRED'
                                ? "bg-red-500/10 text-red-500 border-red-500/30"
                                : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                        )}
                      >
                        {metaPhoneStatuses[channel.id].message}
                      </Badge>
                    ) : (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs",
                          (metaPhoneStatuses[channel.id]?.isConnected ?? channel.connected)
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" 
                            : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                        )}
                      >
                        {(metaPhoneStatuses[channel.id]?.isConnected ?? channel.connected) ? "Ativo" : "Pendente"}
                      </Badge>
                    )
                  ) : (
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
                  )}
                </div>

                {/* Quality rating indicator for Meta channels */}
                {channel.provider === 'meta' && metaPhoneStatuses[channel.id]?.qualityInfo && (
                  <div className="mt-2">
                    <span className={cn(
                      "text-xs",
                      metaPhoneStatuses[channel.id].qualityRating === 'GREEN' ? "text-emerald-500" :
                      metaPhoneStatuses[channel.id].qualityRating === 'YELLOW' ? "text-amber-500" :
                      metaPhoneStatuses[channel.id].qualityRating === 'RED' ? "text-red-500" :
                      "text-muted-foreground"
                    )}>
                      ● {metaPhoneStatuses[channel.id].qualityInfo}
                    </span>
                  </div>
                )}

                {/* Connected status indicator */}
                {(channel.provider === 'zapi' ? channel.connected : (metaPhoneStatuses[channel.id]?.isConnected ?? channel.connected)) && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full animate-pulse",
                        metaPhoneStatuses[channel.id]?.qualityRating === 'RED' ? "bg-amber-500" : "bg-emerald-500"
                      )} />
                      <span className="text-xs text-muted-foreground">
                        {metaPhoneStatuses[channel.id]?.qualityRating === 'RED' 
                          ? "Ativo com qualidade baixa" 
                          : "Pronto para enviar e receber"}
                      </span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-2 text-xs"
                      onClick={() => handleSubscribeWebhook(channel)}
                      disabled={isSubscribing === channel.id}
                    >
                      {isSubscribing === channel.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Inscrevendo...
                        </>
                      ) : (
                        <>
                          <Webhook className="w-3 h-3" />
                          Reinscrever no Webhook
                        </>
                      )}
                    </Button>
                    {channel.provider === 'meta' && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full gap-2 text-xs"
                        onClick={() => checkMetaPhoneStatus(channel)}
                        disabled={isCheckingStatus[channel.id]}
                      >
                        {isCheckingStatus[channel.id] ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Verificando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3" />
                            Atualizar Status
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {/* Show registration button for disconnected Meta channels */}
                {channel.provider === 'meta' && !(metaPhoneStatuses[channel.id]?.isConnected ?? channel.connected) && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {/* Show error message if there's an issue */}
                    {metaPhoneStatuses[channel.id]?.code === 'TOKEN_EXPIRED' && (
                      <div className="p-2 bg-red-500/10 rounded border border-red-500/20 mb-2">
                        <p className="text-xs text-red-400">
                          Token expirado. Atualize o Access Token nas configurações.
                        </p>
                      </div>
                    )}
                    {metaPhoneStatuses[channel.id]?.code === 'RESTRICTED' && (
                      <div className="p-2 bg-red-500/10 rounded border border-red-500/20 mb-2">
                        <p className="text-xs text-red-400">
                          Este número está com restrições. Verifique no Meta Business Suite.
                        </p>
                      </div>
                    )}
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="w-full gap-2 text-xs"
                      onClick={() => handleRegisterPhone(channel)}
                      disabled={isRegistering === channel.id}
                    >
                      {isRegistering === channel.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Registrando...
                        </>
                      ) : (
                        <>
                          <Power className="w-3 h-3" />
                          Registrar na Cloud API
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-2 text-xs"
                      onClick={() => setShowChannelConfig(channel)}
                    >
                      <Info className="w-3 h-3" />
                      Ver Configuração Webhook
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full gap-2 text-xs"
                      onClick={() => checkMetaPhoneStatus(channel)}
                      disabled={isCheckingStatus[channel.id]}
                    >
                      {isCheckingStatus[channel.id] ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          Verificar Status
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Z-API channels use the simple connected check */}
                {channel.provider === 'zapi' && !channel.connected && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="w-full gap-2 text-xs"
                      onClick={() => handleToggleConnection(channel)}
                    >
                      <Power className="w-3 h-3" />
                      Ativar Canal
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
          className="sm:max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto" 
          onInteractOutside={(e) => (isFetchingPhones || isConnecting) && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {connectionType === 'zapi' 
                ? 'Conectar via Z-API'
                : step === 'credentials' 
                  ? 'Conectar WhatsApp Business' 
                  : 'Selecionar Números'
              }
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {connectionType === 'zapi'
                ? 'Configure a conexão Z-API para este cliente'
                : step === 'credentials' 
                  ? 'Insira as credenciais da sua WABA para buscar os números disponíveis'
                  : `Selecione os números que deseja conectar (${selectedPhones.length} selecionado${selectedPhones.length !== 1 ? 's' : ''})`
              }
            </DialogDescription>
          </DialogHeader>

          {/* Z-API Form - Only for Super Admin */}
          {connectionType === 'zapi' && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <p className="text-sm text-emerald-400">
                  <strong>Atenção:</strong> Esta é uma conexão não oficial via Z-API. 
                  Configure a instância no{" "}
                  <a href="https://developer.z-api.io/" target="_blank" className="underline">
                    painel Z-API
                  </a>.
                </p>
              </div>

              {/* Organization selector for Super Admin */}
              <div className="space-y-2">
                <Label className="text-foreground">Organização *</Label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger className="bg-muted/30 border-border">
                    <SelectValue placeholder="Selecione a organização" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border z-[100]">
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Selecione para qual cliente esta conexão será destinada
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Nome do Canal</Label>
                <Input 
                  placeholder="Ex: WhatsApp Vendas" 
                  className="bg-muted/30 border-border"
                  value={zapiFormData.name}
                  onChange={(e) => setZapiFormData({ ...zapiFormData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Número de Telefone</Label>
                <Input 
                  placeholder="Ex: 5511999999999" 
                  className="bg-muted/30 border-border"
                  value={zapiFormData.phone}
                  onChange={(e) => setZapiFormData({ ...zapiFormData, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Instance ID</Label>
                <Input 
                  placeholder="ID da instância Z-API" 
                  className="bg-muted/30 border-border"
                  value={zapiFormData.instanceId}
                  onChange={(e) => setZapiFormData({ ...zapiFormData, instanceId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Encontre no painel Z-API da instância
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Token</Label>
                <div className="relative">
                  <Input 
                    type={showAccessToken ? "text" : "password"}
                    placeholder="Token da instância Z-API"
                    className="bg-muted/30 border-border pr-10"
                    value={zapiFormData.token}
                    onChange={(e) => setZapiFormData({ ...zapiFormData, token: e.target.value })}
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
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleConnectZapi} 
                  disabled={isConnecting || !zapiFormData.instanceId || !zapiFormData.token || !zapiFormData.name || !zapiFormData.phone || !selectedOrgId}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Conectar Z-API
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Meta Cloud API Form */}
          {connectionType === 'meta' && step === 'credentials' && (
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

              {/* Organization selector for Super Admin */}
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label className="text-foreground">Organização *</Label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger className="bg-muted/30 border-border">
                      <SelectValue placeholder="Selecione a organização" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-[100]">
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Selecione para qual cliente esta conexão será destinada
                  </p>
                </div>
              )}

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
                  disabled={isFetchingPhones || !formData.wabaId || !formData.accessToken || (isSuperAdmin && !selectedOrgId)}
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

          {connectionType === 'meta' && step === 'select-numbers' && (
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

      {/* Chatbot Link Dialog */}
      <Dialog open={!!showChatbotDialog} onOpenChange={(open) => !isSavingChatbot && !open && setShowChatbotDialog(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Vincular Chatbot ao Canal
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Escolha qual chatbot será usado para atender as conversas deste canal.
            </DialogDescription>
          </DialogHeader>

          {showChatbotDialog && (
            <div className="space-y-4 py-2">
              {/* Channel Info */}
              <div className="p-3 bg-muted/20 rounded-lg border border-border flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{showChatbotDialog.name}</p>
                  <p className="text-sm text-muted-foreground">{showChatbotDialog.phone}</p>
                </div>
              </div>

              {/* Agent Selection */}
              <div className="space-y-2">
                <Label className="text-foreground">Chatbot</Label>
                <Select value={selectedChatbotAgent} onValueChange={setSelectedChatbotAgent}>
                  <SelectTrigger className="bg-muted/30 border-border">
                    <SelectValue placeholder="Selecione um chatbot" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border z-[100]">
                    {chatbotAgents.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        Nenhum chatbot ativo
                      </div>
                    ) : (
                      chatbotAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            <span>{agent.name}</span>
                            {agent.nickname && (
                              <span className="text-muted-foreground text-xs">
                                @{agent.nickname}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Enable Switch */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm font-medium text-foreground">Ativar chatbot</Label>
                  <p className="text-xs text-muted-foreground">
                    O chatbot responderá automaticamente neste canal
                  </p>
                </div>
                <Switch checked={isChatbotEnabled} onCheckedChange={setIsChatbotEnabled} />
              </div>

              {/* Current Config Info */}
              {channelChatbotConfig?.agent_id && (
                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <p className="text-sm text-emerald-400">
                    Este canal já possui um chatbot vinculado. Você pode atualizar ou remover.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between gap-3 pt-2">
                <div>
                  {channelChatbotConfig?.agent_id && (
                    <Button 
                      variant="outline" 
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleRemoveChatbot}
                      disabled={isSavingChatbot}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Desvincular
                    </Button>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowChatbotDialog(null)} disabled={isSavingChatbot}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleSaveChatbotConfig} 
                    disabled={isSavingChatbot || !selectedChatbotAgent}
                    className="gap-2"
                  >
                    {isSavingChatbot ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Vincular
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Conexoes;
