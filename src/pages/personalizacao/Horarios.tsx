import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";

import { toast } from "sonner";
import { Clock, Save, PartyPopper, Moon, ShieldBan, ThumbsDown } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

interface BusinessHour {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface AwayMessageConfig {
  id?: string;
  is_enabled: boolean;
  message: string;
}

interface WelcomeMessageConfig {
  id?: string;
  is_enabled: boolean;
  message: string;
}

export default function Horarios() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();

  // Organização efetiva (respeita impersonação de super admin)
  const profile = effectiveOrganizationId
    ? { organization_id: effectiveOrganizationId }
    : null;


  const { data: businessHours, isLoading: loadingHours } = useQuery({
    queryKey: ["business-hours", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("business_hours")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("day_of_week");
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });

  const { data: awayConfig, isLoading: loadingAway } = useQuery({
    queryKey: ["away-message-config", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("away_message_config")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .single();
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  const { data: welcomeConfig, isLoading: loadingWelcome } = useQuery({
    queryKey: ["welcome-message-config", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("welcome_message_config")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .single();
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  const { data: orgFlags, isLoading: loadingOrgFlags } = useQuery({
    queryKey: ["org-auto-reply-flags", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("auto_blacklist_enabled, decline_message_enabled")
        .eq("id", profile!.organization_id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  const defaultHours = DAYS_OF_WEEK.map((day) => ({
    day_of_week: day.value,
    start_time: "09:00",
    end_time: "18:00",
    is_active: day.value >= 1 && day.value <= 5,
  }));

  const [formHours, setFormHours] = useState<BusinessHour[]>(defaultHours);
  const [formAway, setFormAway] = useState<AwayMessageConfig>({
    is_enabled: true,
    message: "Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.",
  });
  const [formWelcome, setFormWelcome] = useState<WelcomeMessageConfig>({
    is_enabled: false,
    message: "Olá! Seja bem-vindo(a)! Como posso ajudá-lo(a) hoje?",
  });

  const [formFlags, setFormFlags] = useState({
    auto_blacklist_enabled: true,
    decline_message_enabled: true,
  });

  useEffect(() => {
    if (orgFlags) {
      setFormFlags({
        auto_blacklist_enabled: orgFlags.auto_blacklist_enabled !== false,
        decline_message_enabled: orgFlags.decline_message_enabled !== false,
      });
    }
  }, [orgFlags]);

  // Sync form state when data loads (reseta ao trocar de organização)
  useEffect(() => {
    if (loadingHours) return;
    setFormHours(businessHours && businessHours.length > 0 ? businessHours : defaultHours);
  }, [businessHours, loadingHours]);

  useEffect(() => {
    if (loadingAway) return;
    setFormAway(
      awayConfig
        ? {
            id: awayConfig.id,
            is_enabled: awayConfig.is_enabled ?? true,
            message: awayConfig.message ?? "",
          }
        : {
            is_enabled: true,
            message: "Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.",
          }
    );
  }, [awayConfig, loadingAway]);

  useEffect(() => {
    if (loadingWelcome) return;
    setFormWelcome(
      welcomeConfig
        ? {
            id: welcomeConfig.id,
            is_enabled: welcomeConfig.is_enabled ?? true,
            message: welcomeConfig.message ?? "",
          }
        : {
            is_enabled: false,
            message: "Olá! Seja bem-vindo(a)! Como posso ajudá-lo(a) hoje?",
          }
    );
  }, [welcomeConfig, loadingWelcome]);


  const saveMutation = useMutation({
    mutationFn: async ({ 
      hours, 
      away, 
      welcome,
      flags,
    }: { 
      hours: BusinessHour[]; 
      away: AwayMessageConfig; 
      welcome: WelcomeMessageConfig;
      flags: { auto_blacklist_enabled: boolean; decline_message_enabled: boolean };
    }) => {
      // Save business hours
      for (const hour of hours) {
        const { error } = await supabase
          .from("business_hours")
          .upsert({
            organization_id: profile!.organization_id,
            day_of_week: hour.day_of_week,
            start_time: hour.start_time,
            end_time: hour.end_time,
            is_active: hour.is_active,
          }, {
            onConflict: "organization_id,day_of_week",
          });
        if (error) throw error;
      }

      // Save away message config
      const { error: awayError } = await supabase
        .from("away_message_config")
        .upsert({
          organization_id: profile!.organization_id,
          is_enabled: away.is_enabled,
          message: away.message,
        }, {
          onConflict: "organization_id",
        });
      if (awayError) throw awayError;

      // Save welcome message config
      const { error: welcomeError } = await supabase
        .from("welcome_message_config")
        .upsert({
          organization_id: profile!.organization_id,
          is_enabled: welcome.is_enabled,
          message: welcome.message,
        }, {
          onConflict: "organization_id",
        });
      if (welcomeError) throw welcomeError;

      // Save organization auto-reply flags
      const { error: flagsError } = await supabase
        .from("organizations")
        .update({
          auto_blacklist_enabled: flags.auto_blacklist_enabled,
          decline_message_enabled: flags.decline_message_enabled,
        })
        .eq("id", profile!.organization_id);
      if (flagsError) throw flagsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-hours"] });
      queryClient.invalidateQueries({ queryKey: ["away-message-config"] });
      queryClient.invalidateQueries({ queryKey: ["welcome-message-config"] });
      queryClient.invalidateQueries({ queryKey: ["org-auto-reply-flags"] });
      toast.success("Configurações salvas com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao salvar configurações");
    },
  });

  const handleHourChange = (dayOfWeek: number, field: keyof BusinessHour, value: any) => {
    setFormHours((prev) =>
      prev.map((h) =>
        h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h
      )
    );
  };

  const handleSave = () => {
    saveMutation.mutate({ hours: formHours, away: formAway, welcome: formWelcome, flags: formFlags });
  };

  if (loadingHours || loadingAway || loadingWelcome || loadingOrgFlags) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Horários e Mensagens</h1>
            <p className="text-muted-foreground">Configure horários e mensagens automáticas</p>
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            Salvar
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Business Hours Card */}
          <Card className="lg:row-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Horários por Dia
              </CardTitle>
              <CardDescription>
                Defina os horários de atendimento para cada dia da semana
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {DAYS_OF_WEEK.map((day) => {
                const hourConfig = formHours.find((h) => h.day_of_week === day.value) || {
                  day_of_week: day.value,
                  start_time: "09:00",
                  end_time: "18:00",
                  is_active: false,
                };

                return (
                  <div key={day.value} className="flex items-center gap-4 p-3 rounded-lg border">
                    <Switch
                      checked={hourConfig.is_active}
                      onCheckedChange={(checked) =>
                        handleHourChange(day.value, "is_active", checked)
                      }
                    />
                    <span className="w-32 font-medium">{day.label}</span>
                    <Input
                      type="time"
                      value={hourConfig.start_time}
                      onChange={(e) =>
                        handleHourChange(day.value, "start_time", e.target.value)
                      }
                      disabled={!hourConfig.is_active}
                      className="w-28"
                    />
                    <span className="text-muted-foreground">até</span>
                    <Input
                      type="time"
                      value={hourConfig.end_time}
                      onChange={(e) =>
                        handleHourChange(day.value, "end_time", e.target.value)
                      }
                      disabled={!hourConfig.is_active}
                      className="w-28"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Welcome Message Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PartyPopper className="w-5 h-5" />
                Mensagem de Boas-Vindas
              </CardTitle>
              <CardDescription>
                Enviada apenas na primeira mensagem de cada contato
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formWelcome.is_enabled}
                  onCheckedChange={(checked) =>
                    setFormWelcome((prev) => ({ ...prev, is_enabled: checked }))
                  }
                />
                <Label>Enviar mensagem de boas-vindas</Label>
              </div>
              <Textarea
                value={formWelcome.message}
                onChange={(e) =>
                  setFormWelcome((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder="Olá! Seja bem-vindo(a)! Como posso ajudá-lo(a)?"
                rows={4}
                disabled={!formWelcome.is_enabled}
              />
              <p className="text-xs text-muted-foreground">
                Esta mensagem é enviada uma única vez, no primeiro contato de cada pessoa.
              </p>
            </CardContent>
          </Card>

          {/* Away Message Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Moon className="w-5 h-5" />
                Mensagem de Ausência
              </CardTitle>
              <CardDescription>
                Enviada fora do horário de atendimento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formAway.is_enabled}
                  onCheckedChange={(checked) =>
                    setFormAway((prev) => ({ ...prev, is_enabled: checked }))
                  }
                />
                <Label>Enviar mensagem de ausência</Label>
              </div>
              <Textarea
                value={formAway.message}
                onChange={(e) =>
                  setFormAway((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder="Olá! Estamos fora do horário de atendimento..."
                rows={4}
                disabled={!formAway.is_enabled}
              />
              <p className="text-xs text-muted-foreground">
                Enviada quando a mensagem chegar fora dos horários configurados.
              </p>
            </CardContent>
          </Card>
          {/* Auto Blacklist Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldBan className="w-5 h-5" />
                Bloqueios
              </CardTitle>
              <CardDescription>
                Bloqueio automático quando o cliente pede para não receber mais mensagens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formFlags.auto_blacklist_enabled}
                  onCheckedChange={(checked) =>
                    setFormFlags((prev) => ({ ...prev, auto_blacklist_enabled: checked }))
                  }
                />
                <Label>Ativar bloqueio automático</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Quando ativo, mensagens como "bloquear contato" ou "não quero mais receber"
                adicionam o número à lista negra e enviam uma mensagem de despedida.
                Desativado, nada é bloqueado nem respondido automaticamente.
              </p>
            </CardContent>
          </Card>

          {/* Decline Message Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ThumbsDown className="w-5 h-5" />
                Mensagens Negativas
              </CardTitle>
              <CardDescription>
                Resposta automática quando o cliente recusa a oferta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formFlags.decline_message_enabled}
                  onCheckedChange={(checked) =>
                    setFormFlags((prev) => ({ ...prev, decline_message_enabled: checked }))
                  }
                />
                <Label>Enviar resposta para mensagens negativas</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Enviada apenas quando a recusa for a primeira mensagem do contato.
                Durante a conversa, nunca é enviada.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
