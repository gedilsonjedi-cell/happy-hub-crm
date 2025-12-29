import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, Settings, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AutoRechargeConfigProps {
  organizationId: string;
  userEmail: string;
}

interface AutoRechargeData {
  id: string;
  is_enabled: boolean;
  min_balance_threshold: number;
  recharge_amount: number;
  card_last_four: string | null;
  card_brand: string | null;
  cardholder_name: string | null;
}

const THRESHOLD_OPTIONS = [5, 10, 20, 50];
const RECHARGE_OPTIONS = [50, 100, 200, 500];

export function AutoRechargeConfig({ organizationId, userEmail }: AutoRechargeConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AutoRechargeData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Card fields for adding new card
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cpf, setCpf] = useState("");
  const [minThreshold, setMinThreshold] = useState(10);
  const [rechargeAmount, setRechargeAmount] = useState(50);

  useEffect(() => {
    fetchConfig();
  }, [organizationId]);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("auto_recharge_config")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching auto recharge config:", error);
      }
      
      if (data) {
        setConfig(data);
        setMinThreshold(data.min_balance_threshold || 10);
        setRechargeAmount(data.recharge_amount || 50);
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(" ").slice(0, 19) : cleaned;
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + "/" + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  const formatCpf = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
    if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}`;
  };

  const detectCardBrand = (number: string): string => {
    const cleaned = number.replace(/\D/g, "");
    if (/^4/.test(cleaned)) return "visa";
    if (/^5[1-5]/.test(cleaned)) return "master";
    if (/^3[47]/.test(cleaned)) return "amex";
    if (/^6(?:011|5)/.test(cleaned)) return "discover";
    if (/^(?:2131|1800|35)/.test(cleaned)) return "jcb";
    return "unknown";
  };

  const handleSaveCard = async () => {
    if (!cardNumber || !cardExpiry || !cardCvv || !cardHolder || !cpf) {
      toast.error("Preencha todos os campos do cartão");
      return;
    }

    setSaving(true);
    try {
      const [expiryMonth, expiryYear] = cardExpiry.split("/");
      const cleanedCardNumber = cardNumber.replace(/\s/g, "");
      const cardBrand = detectCardBrand(cleanedCardNumber);
      const cardLastFour = cleanedCardNumber.slice(-4);

      // Create or update customer in MercadoPago and save card token
      const { data, error } = await supabase.functions.invoke("mercadopago-save-card", {
        body: {
          organizationId,
          cardNumber: cleanedCardNumber,
          cardExpiryMonth: expiryMonth,
          cardExpiryYear: `20${expiryYear}`,
          cardCvv,
          cardHolder,
          cpf: cpf.replace(/\D/g, ""),
          email: userEmail,
          minBalanceThreshold: minThreshold,
          rechargeAmount,
        },
      });

      if (error) throw error;

      if (data.success) {
        // Save config to database
        const configData = {
          organization_id: organizationId,
          is_enabled: true,
          min_balance_threshold: minThreshold,
          recharge_amount: rechargeAmount,
          card_token: data.cardToken,
          card_last_four: cardLastFour,
          card_brand: cardBrand,
          cardholder_name: cardHolder,
          customer_id: data.customerId,
        };

        const { error: upsertError } = await supabase
          .from("auto_recharge_config")
          .upsert(configData, { onConflict: "organization_id" });

        if (upsertError) throw upsertError;

        toast.success("Cartão salvo! Recarga automática ativada.");
        fetchConfig();
        setDialogOpen(false);
        resetForm();
      } else {
        throw new Error(data.error || "Erro ao salvar cartão");
      }
    } catch (err: unknown) {
      console.error("Error saving card:", err);
      const errorMessage = err instanceof Error ? err.message : "Erro ao salvar cartão";
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!config) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("auto_recharge_config")
        .update({ is_enabled: enabled })
        .eq("id", config.id);

      if (error) throw error;

      setConfig({ ...config, is_enabled: enabled });
      toast.success(enabled ? "Recarga automática ativada" : "Recarga automática desativada");
    } catch (err) {
      console.error("Error toggling auto recharge:", err);
      toast.error("Erro ao alterar configuração");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSettings = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("auto_recharge_config")
        .update({
          min_balance_threshold: minThreshold,
          recharge_amount: rechargeAmount,
        })
        .eq("id", config.id);

      if (error) throw error;

      setConfig({
        ...config,
        min_balance_threshold: minThreshold,
        recharge_amount: rechargeAmount,
      });
      toast.success("Configurações atualizadas");
    } catch (err) {
      console.error("Error updating settings:", err);
      toast.error("Erro ao atualizar configurações");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCard = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("auto_recharge_config")
        .delete()
        .eq("id", config.id);

      if (error) throw error;

      setConfig(null);
      toast.success("Cartão removido");
    } catch (err) {
      console.error("Error removing card:", err);
      toast.error("Erro ao remover cartão");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setCardHolder("");
    setCpf("");
  };

  const getCardBrandLabel = (brand: string | null) => {
    const brands: Record<string, string> = {
      visa: "Visa",
      master: "Mastercard",
      amex: "American Express",
      discover: "Discover",
      jcb: "JCB",
    };
    return brands[brand || ""] || "Cartão";
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="w-5 h-5" />
          Recarga Automática
        </CardTitle>
        <CardDescription>
          Configure a recarga automática quando seu saldo ficar baixo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config?.card_last_four ? (
          <>
            {/* Card Info */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <CreditCard className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {getCardBrandLabel(config.card_brand)} •••• {config.card_last_four}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {config.cardholder_name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={config.is_enabled ? "default" : "secondary"}>
                  {config.is_enabled ? "Ativo" : "Inativo"}
                </Badge>
                <Switch
                  checked={config.is_enabled}
                  onCheckedChange={handleToggleEnabled}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Recarregar quando saldo for menor que</Label>
                <div className="flex flex-wrap gap-2">
                  {THRESHOLD_OPTIONS.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={minThreshold === value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMinThreshold(value)}
                    >
                      R$ {value}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Valor da recarga</Label>
                <div className="flex flex-wrap gap-2">
                  {RECHARGE_OPTIONS.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={rechargeAmount === value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRechargeAmount(value)}
                    >
                      R$ {value}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Update/Remove Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button 
                onClick={handleUpdateSettings} 
                disabled={saving}
                className="flex-1"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Salvar Configurações
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="w-4 h-4" />
                    Remover Cartão
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover cartão?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso irá desativar a recarga automática. Você precisará adicionar um novo cartão para reativar.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemoveCard}>
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 text-blue-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">
                Quando seu saldo ficar abaixo de R$ {minThreshold}, uma recarga de R$ {rechargeAmount} será feita automaticamente no cartão cadastrado.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* No card configured */}
            <div className="text-center py-6 space-y-4">
              <CreditCard className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
              <div>
                <p className="font-medium">Nenhum cartão configurado</p>
                <p className="text-sm text-muted-foreground">
                  Adicione um cartão para ativar a recarga automática
                </p>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <CreditCard className="w-4 h-4" />
                    Adicionar Cartão
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] p-0">
                  <DialogHeader className="p-4 sm:p-6 pb-0">
                    <DialogTitle className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5" />
                      Configurar Recarga Automática
                    </DialogTitle>
                    <DialogDescription>
                      Adicione um cartão para recarregar automaticamente
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="max-h-[calc(90vh-8rem)]">
                    <div className="p-4 sm:p-6 pt-4 space-y-4">
                      {/* Threshold Selection */}
                      <div className="space-y-2">
                        <Label className="text-sm">Recarregar quando saldo for menor que</Label>
                        <div className="flex flex-wrap gap-2">
                          {THRESHOLD_OPTIONS.map((value) => (
                            <Button
                              key={value}
                              type="button"
                              variant={minThreshold === value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setMinThreshold(value)}
                            >
                              R$ {value}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Recharge Amount Selection */}
                      <div className="space-y-2">
                        <Label className="text-sm">Valor da recarga automática</Label>
                        <div className="flex flex-wrap gap-2">
                          {RECHARGE_OPTIONS.map((value) => (
                            <Button
                              key={value}
                              type="button"
                              variant={rechargeAmount === value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setRechargeAmount(value)}
                            >
                              R$ {value}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Card Fields */}
                      <div className="space-y-3 pt-2 border-t">
                        <p className="text-sm font-medium">Dados do Cartão</p>
                        <div className="space-y-1.5">
                          <Label htmlFor="autoCardNumber" className="text-sm">Número do Cartão *</Label>
                          <Input
                            id="autoCardNumber"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                            placeholder="0000 0000 0000 0000"
                            maxLength={19}
                            className="h-9"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="autoCardExpiry" className="text-sm">Validade *</Label>
                            <Input
                              id="autoCardExpiry"
                              value={cardExpiry}
                              onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                              placeholder="MM/AA"
                              maxLength={5}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="autoCardCvv" className="text-sm">CVV *</Label>
                            <Input
                              id="autoCardCvv"
                              value={cardCvv}
                              onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                              placeholder="123"
                              maxLength={4}
                              className="h-9"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="autoCardHolder" className="text-sm">Nome no Cartão *</Label>
                          <Input
                            id="autoCardHolder"
                            value={cardHolder}
                            onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                            placeholder="NOME COMO NO CARTÃO"
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="autoCpf" className="text-sm">CPF do Titular *</Label>
                          <Input
                            id="autoCpf"
                            value={cpf}
                            onChange={(e) => setCpf(formatCpf(e.target.value))}
                            placeholder="000.000.000-00"
                            maxLength={14}
                            className="h-9"
                          />
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">
                          Quando o saldo for inferior a <strong>R$ {minThreshold}</strong>, 
                          será feita uma recarga de <strong>R$ {rechargeAmount}</strong> automaticamente.
                        </p>
                      </div>

                      <Button 
                        onClick={handleSaveCard} 
                        disabled={saving} 
                        className="w-full"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4 mr-2" />
                            Salvar e Ativar
                          </>
                        )}
                      </Button>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
