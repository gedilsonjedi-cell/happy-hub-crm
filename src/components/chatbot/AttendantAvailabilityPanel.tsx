import { useState, useEffect } from "react";
import { 
  Circle, 
  CircleDot,
  Users,
  RefreshCw,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface AttendantAvailability {
  id?: string;
  is_available: boolean;
  current_conversations: number;
  max_conversations: number;
}

export const AttendantAvailabilityPanel = () => {
  const { user } = useAuth();
  const [availability, setAvailability] = useState<AttendantAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchAvailability();
    }
  }, [user]);

  const fetchAvailability = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("attendant_availability")
      .select("*")
      .eq("user_id", user?.id)
      .single();

    if (data) {
      setAvailability(data);
    } else {
      // Create default availability
      const { data: newData, error: insertError } = await supabase
        .from("attendant_availability")
        .insert({
          user_id: user?.id,
          is_available: false,
          current_conversations: 0,
          max_conversations: 5
        })
        .select()
        .single();

      if (!insertError && newData) {
        setAvailability(newData);
      }
    }

    setLoading(false);
  };

  const handleToggleAvailability = async (isAvailable: boolean) => {
    if (!availability) return;

    setSaving(true);

    const { error } = await supabase
      .from("attendant_availability")
      .update({ is_available: isAvailable })
      .eq("id", availability.id);

    if (error) {
      toast.error("Erro ao atualizar disponibilidade");
      setSaving(false);
      return;
    }

    setAvailability({ ...availability, is_available: isAvailable });
    toast.success(isAvailable ? "Você está disponível para atendimento" : "Você está offline");
    setSaving(false);
  };

  const handleMaxConversationsChange = async (value: number[]) => {
    if (!availability) return;

    const { error } = await supabase
      .from("attendant_availability")
      .update({ max_conversations: value[0] })
      .eq("id", availability.id);

    if (!error) {
      setAvailability({ ...availability, max_conversations: value[0] });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Minha Disponibilidade
        </CardTitle>
        <CardDescription>
          Controle seu status para receber novos atendimentos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              availability?.is_available 
                ? "bg-emerald-500/10" 
                : "bg-muted"
            )}>
              {availability?.is_available ? (
                <CircleDot className="w-6 h-6 text-emerald-500" />
              ) : (
                <Circle className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium text-foreground">
                {availability?.is_available ? "Disponível" : "Offline"}
              </p>
              <p className="text-sm text-muted-foreground">
                {availability?.is_available 
                  ? "Você receberá novos atendimentos"
                  : "Não receberá novos atendimentos"}
              </p>
            </div>
          </div>
          <Switch
            checked={availability?.is_available ?? false}
            onCheckedChange={handleToggleAvailability}
            disabled={saving}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Máximo de conversas simultâneas</Label>
            <Badge variant="secondary">{availability?.max_conversations}</Badge>
          </div>
          <Slider
            value={[availability?.max_conversations ?? 5]}
            onValueCommit={handleMaxConversationsChange}
            max={10}
            min={1}
            step={1}
          />
          <p className="text-xs text-muted-foreground">
            Você está atendendo {availability?.current_conversations ?? 0} de {availability?.max_conversations ?? 5} conversas
          </p>
        </div>

        <div className="pt-2">
          <Button 
            variant="outline" 
            className="w-full gap-2"
            onClick={fetchAvailability}
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar Status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
