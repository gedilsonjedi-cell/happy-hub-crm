import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, DollarSign } from "lucide-react";

interface SubscriptionPricing {
  id: string;
  base_price: number;
  price_per_user: number;
  price_per_channel: number;
  included_users: number;
  included_channels: number;
}

export function SubscriptionPricingConfig() {
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [basePrice, setBasePrice] = useState("299.00");
  const [pricePerUser, setPricePerUser] = useState("85.00");
  const [pricePerChannel, setPricePerChannel] = useState("85.00");
  const [includedUsers, setIncludedUsers] = useState("1");
  const [includedChannels, setIncludedChannels] = useState("1");

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_pricing")
        .select("*")
        .single();

      if (error) {
        console.error("Error fetching pricing:", error);
        return;
      }

      if (data) {
        setPricing(data);
        setBasePrice(data.base_price.toString());
        setPricePerUser(data.price_per_user.toString());
        setPricePerChannel(data.price_per_channel.toString());
        setIncludedUsers(data.included_users.toString());
        setIncludedChannels(data.included_channels.toString());
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!pricing) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("subscription_pricing")
        .update({
          base_price: parseFloat(basePrice),
          price_per_user: parseFloat(pricePerUser),
          price_per_channel: parseFloat(pricePerChannel),
          included_users: parseInt(includedUsers),
          included_channels: parseInt(includedChannels),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pricing.id);

      if (error) {
        toast.error("Erro ao salvar configurações");
        console.error(error);
        return;
      }

      toast.success("Configurações salvas com sucesso!");
      fetchPricing();
    } catch (err) {
      console.error("Error saving:", err);
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  // Calculate example pricing
  const exampleUsers = 3;
  const exampleChannels = 2;
  const extraUsers = Math.max(0, exampleUsers - parseInt(includedUsers || "1"));
  const extraChannels = Math.max(0, exampleChannels - parseInt(includedChannels || "1"));
  const exampleTotal = 
    parseFloat(basePrice || "0") + 
    (extraUsers * parseFloat(pricePerUser || "0")) + 
    (extraChannels * parseFloat(pricePerChannel || "0"));

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Precificação da Assinatura
        </CardTitle>
        <CardDescription>
          Configure os valores base e adicionais da assinatura
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Base Pricing */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Preço Base (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="299.00"
            />
            <p className="text-xs text-muted-foreground">
              Valor mensal do plano base
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Usuários Inclusos</Label>
            <Input
              type="number"
              value={includedUsers}
              onChange={(e) => setIncludedUsers(e.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">
              Quantidade incluída no plano base
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>WhatsApps Inclusos</Label>
            <Input
              type="number"
              value={includedChannels}
              onChange={(e) => setIncludedChannels(e.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">
              Quantidade incluída no plano base
            </p>
          </div>
        </div>

        {/* Additional Pricing */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Preço por Usuário Adicional (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={pricePerUser}
              onChange={(e) => setPricePerUser(e.target.value)}
              placeholder="85.00"
            />
            <p className="text-xs text-muted-foreground">
              Valor adicional por cada usuário extra
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Preço por WhatsApp Adicional (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={pricePerChannel}
              onChange={(e) => setPricePerChannel(e.target.value)}
              placeholder="85.00"
            />
            <p className="text-xs text-muted-foreground">
              Valor adicional por cada número extra
            </p>
          </div>
        </div>

        {/* Example Calculation */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">Exemplo de cálculo:</p>
          <p className="text-sm text-muted-foreground">
            Cliente com {exampleUsers} usuários e {exampleChannels} números WhatsApp:
          </p>
          <ul className="text-sm mt-2 space-y-1">
            <li>• Plano base: R$ {parseFloat(basePrice || "0").toFixed(2)}</li>
            {extraUsers > 0 && (
              <li>• {extraUsers} usuário(s) extra: R$ {(extraUsers * parseFloat(pricePerUser || "0")).toFixed(2)}</li>
            )}
            {extraChannels > 0 && (
              <li>• {extraChannels} WhatsApp(s) extra: R$ {(extraChannels * parseFloat(pricePerChannel || "0")).toFixed(2)}</li>
            )}
            <li className="font-medium pt-1 border-t border-border mt-2">
              Total mensal: R$ {exampleTotal.toFixed(2)}
            </li>
          </ul>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </CardContent>
    </Card>
  );
}