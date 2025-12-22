import { useState, useEffect } from "react";
import { DollarSign, Save, Loader2, Megaphone, Settings, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DispatchPricing {
  id: string;
  dispatch_type: "marketing" | "utility" | "service";
  price_per_message: number;
}

const typeConfig = {
  marketing: {
    label: "Marketing",
    description: "Campanhas promocionais e ofertas",
    icon: Megaphone,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  utility: {
    label: "Utilidade",
    description: "Notificações e alertas importantes",
    icon: Settings,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  service: {
    label: "Serviço",
    description: "Suporte e atendimento ao cliente",
    icon: Wrench,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
};

export function DispatchPricingConfig() {
  const [pricing, setPricing] = useState<DispatchPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const { data, error } = await supabase
        .from("dispatch_pricing")
        .select("*")
        .order("dispatch_type");

      if (error) {
        console.error("Error fetching pricing:", error);
        toast.error("Erro ao carregar preços");
        return;
      }

      setPricing(data || []);
      
      // Initialize edited prices
      const prices: Record<string, string> = {};
      (data || []).forEach((p) => {
        prices[p.dispatch_type] = p.price_per_message.toString();
      });
      setEditedPrices(prices);
    } catch (err) {
      console.error("Error fetching pricing:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChange = (type: string, value: string) => {
    // Allow only numbers and decimal point
    const sanitized = value.replace(/[^0-9.]/g, "");
    setEditedPrices((prev) => ({ ...prev, [type]: sanitized }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const p of pricing) {
        const newPrice = parseFloat(editedPrices[p.dispatch_type] || "0");
        
        if (isNaN(newPrice) || newPrice < 0) {
          toast.error(`Preço inválido para ${typeConfig[p.dispatch_type].label}`);
          setSaving(false);
          return;
        }

        const { error } = await supabase
          .from("dispatch_pricing")
          .update({ price_per_message: newPrice })
          .eq("id", p.id);

        if (error) {
          console.error("Error updating price:", error);
          toast.error("Erro ao salvar preços");
          setSaving(false);
          return;
        }
      }

      toast.success("Preços atualizados com sucesso!");
      fetchPricing();
    } catch (err) {
      console.error("Error saving prices:", err);
      toast.error("Erro ao salvar preços");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Configuração de Preços por Disparo
          </CardTitle>
          <CardDescription>
            Defina o custo por mensagem enviada para cada tipo de disparo.
            Apenas mensagens entregues com sucesso são contabilizadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(["marketing", "utility", "service"] as const).map((type) => {
            const config = typeConfig[type];
            const Icon = config.icon;
            const currentPricing = pricing.find((p) => p.dispatch_type === type);
            
            return (
              <div key={type} className="flex items-center gap-4 p-4 rounded-lg border bg-muted/20">
                <div className={`w-12 h-12 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${config.color}`} />
                </div>
                <div className="flex-1">
                  <Label className="text-base font-medium">{config.label}</Label>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    value={editedPrices[type] || ""}
                    onChange={(e) => handlePriceChange(type, e.target.value)}
                    className="w-24 text-right"
                    placeholder="0.00"
                  />
                  <span className="text-sm text-muted-foreground">/msg</span>
                </div>
              </div>
            );
          })}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Preços
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• O tipo de disparo é definido em cada template de mensagem.</p>
          <p>• Apenas mensagens entregues com sucesso são contabilizadas.</p>
          <p>• Falhas e números inválidos não geram custo.</p>
          <p>• Os custos são registrados automaticamente ao enviar campanhas.</p>
        </CardContent>
      </Card>
    </div>
  );
}
