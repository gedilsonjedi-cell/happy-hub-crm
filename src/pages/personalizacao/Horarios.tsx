import { useState } from "react";
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
import { toast } from "sonner";
import { Clock, Save } from "lucide-react";

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

export default function Horarios() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

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

  const [localHours, setLocalHours] = useState<BusinessHour[]>([]);
  const [localAwayConfig, setLocalAwayConfig] = useState<AwayMessageConfig>({
    is_enabled: true,
    message: "Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve.",
  });

  // Initialize local state when data loads
  useState(() => {
    if (businessHours && businessHours.length > 0) {
      setLocalHours(businessHours);
    } else {
      // Initialize with default hours for all days
      setLocalHours(
        DAYS_OF_WEEK.map((day) => ({
          day_of_week: day.value,
          start_time: "09:00",
          end_time: "18:00",
          is_active: day.value >= 1 && day.value <= 5, // Mon-Fri active by default
        }))
      );
    }
  });

  useState(() => {
    if (awayConfig) {
      setLocalAwayConfig(awayConfig);
    }
  });

  const displayHours = businessHours && businessHours.length > 0 
    ? businessHours 
    : DAYS_OF_WEEK.map((day) => ({
        day_of_week: day.value,
        start_time: "09:00",
        end_time: "18:00",
        is_active: day.value >= 1 && day.value <= 5,
      }));

  const displayAwayConfig = awayConfig || localAwayConfig;

  const saveMutation = useMutation({
    mutationFn: async ({ hours, away }: { hours: BusinessHour[]; away: AwayMessageConfig }) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-hours"] });
      queryClient.invalidateQueries({ queryKey: ["away-message-config"] });
      toast.success("Horários salvos com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao salvar horários");
    },
  });

  const [formHours, setFormHours] = useState<BusinessHour[]>(displayHours);
  const [formAway, setFormAway] = useState<AwayMessageConfig>(displayAwayConfig);

  // Update form state when data loads
  if (businessHours && businessHours.length > 0 && formHours.length === 0) {
    setFormHours(businessHours);
  }
  if (!formHours.length && displayHours.length) {
    setFormHours(displayHours);
  }
  if (awayConfig && !formAway.id && awayConfig.id) {
    setFormAway(awayConfig);
  }

  const handleHourChange = (dayOfWeek: number, field: keyof BusinessHour, value: any) => {
    setFormHours((prev) =>
      prev.map((h) =>
        h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h
      )
    );
  };

  const handleSave = () => {
    saveMutation.mutate({ hours: formHours, away: formAway });
  };

  if (loadingHours || loadingAway) {
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
            <h1 className="text-2xl font-bold text-foreground">Horários de Atendimento</h1>
            <p className="text-muted-foreground">Configure os horários de funcionamento</p>
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            Salvar
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
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

          <Card>
            <CardHeader>
              <CardTitle>Mensagem de Ausência</CardTitle>
              <CardDescription>
                Configure a mensagem automática fora do horário de atendimento
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
                <Label>Enviar mensagem automática</Label>
              </div>
              <Textarea
                value={formAway.message}
                onChange={(e) =>
                  setFormAway((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder="Mensagem de ausência..."
                rows={4}
                disabled={!formAway.is_enabled}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
