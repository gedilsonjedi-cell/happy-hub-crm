import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Copy, Check, QrCode, Wallet, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onPaymentCreated?: () => void;
}

const BALANCE_OPTIONS = [
  { value: 50, label: "R$ 50,00" },
  { value: 100, label: "R$ 100,00" },
  { value: 200, label: "R$ 200,00" },
  { value: 500, label: "R$ 500,00" },
];

export function PixPaymentDialog({
  open,
  onOpenChange,
  organizationId,
  onPaymentCreated,
}: PixPaymentDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<"form" | "qrcode">("form");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentType, setPaymentType] = useState<"balance" | "subscription">("balance");
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState(user?.email || "");
  
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    paymentId: string;
  } | null>(null);

  const getFinalAmount = () => {
    if (paymentType === "subscription") return 299; // Fixed subscription price
    if (customAmount) return parseFloat(customAmount);
    return selectedAmount;
  };

  const handleGeneratePix = async () => {
    const amount = getFinalAmount();
    
    if (!amount || amount < 10) {
      toast.error("Valor mínimo é R$ 10,00");
      return;
    }

    if (!payerEmail) {
      toast.error("Informe seu email");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mercadopago-pix", {
        body: {
          amount,
          description: paymentType === "balance" 
            ? `Recarga de saldo - R$ ${amount.toFixed(2)}` 
            : "Assinatura WhatsCode",
          payerEmail,
          payerName,
          organizationId,
          paymentType,
        },
      });

      if (error) throw error;

      if (data.success) {
        setPixData({
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          paymentId: data.paymentId,
        });
        setStep("qrcode");
        toast.success("PIX gerado com sucesso!");
      } else {
        throw new Error(data.error || "Erro ao gerar PIX");
      }
    } catch (err: unknown) {
      console.error("Error generating PIX:", err);
      const errorMessage = err instanceof Error ? err.message : "Erro ao gerar PIX";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPix = async () => {
    if (pixData?.qrCode) {
      await navigator.clipboard.writeText(pixData.qrCode);
      setCopied(true);
      toast.success("Código PIX copiado!");
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleClose = () => {
    setStep("form");
    setPixData(null);
    setCopied(false);
    onOpenChange(false);
    onPaymentCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            Pagamento via PIX
          </DialogTitle>
          <DialogDescription>
            {step === "form" 
              ? "Escolha o tipo de pagamento e gere seu QR Code" 
              : "Escaneie o QR Code ou copie o código PIX"}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-6">
            {/* Payment Type Selection */}
            <div className="space-y-3">
              <Label>Tipo de Pagamento</Label>
              <RadioGroup 
                value={paymentType} 
                onValueChange={(v) => setPaymentType(v as "balance" | "subscription")}
                className="grid grid-cols-2 gap-3"
              >
                <Label 
                  htmlFor="balance" 
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    paymentType === "balance" 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem value="balance" id="balance" className="sr-only" />
                  <Wallet className="w-6 h-6" />
                  <span className="font-medium">Recarga</span>
                  <span className="text-xs text-muted-foreground">Adicionar créditos</span>
                </Label>
                <Label 
                  htmlFor="subscription" 
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    paymentType === "subscription" 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem value="subscription" id="subscription" className="sr-only" />
                  <CreditCard className="w-6 h-6" />
                  <span className="font-medium">Assinatura</span>
                  <span className="text-xs text-muted-foreground">R$ 299/mês</span>
                </Label>
              </RadioGroup>
            </div>

            {/* Amount Selection (only for balance) */}
            {paymentType === "balance" && (
              <div className="space-y-3">
                <Label>Valor da Recarga</Label>
                <div className="grid grid-cols-2 gap-2">
                  {BALANCE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={selectedAmount === option.value && !customAmount ? "default" : "outline"}
                      className="h-12"
                      onClick={() => {
                        setSelectedAmount(option.value);
                        setCustomAmount("");
                      }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">ou</span>
                  <Input
                    type="number"
                    placeholder="Outro valor"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    min={10}
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {/* Payer Info */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="payerName">Nome</Label>
                <Input
                  id="payerName"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payerEmail">Email *</Label>
                <Input
                  id="payerEmail"
                  type="email"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>

            {/* Summary */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total a pagar</span>
                  <span className="text-2xl font-bold text-primary">
                    R$ {getFinalAmount().toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleGeneratePix} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando PIX...
                </>
              ) : (
                <>
                  <QrCode className="w-4 h-4 mr-2" />
                  Gerar QR Code PIX
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* QR Code Display */}
            {pixData?.qrCodeBase64 && (
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-lg">
                  <img
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48"
                  />
                </div>
              </div>
            )}

            {/* Copy Button */}
            <div className="space-y-2">
              <Label>Código PIX (Copia e Cola)</Label>
              <div className="flex gap-2">
                <Input
                  value={pixData?.qrCode || ""}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button onClick={handleCopyPix} variant="outline" size="icon">
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Após o pagamento, o saldo será creditado automaticamente.
              </p>
              <p className="text-xs text-muted-foreground">
                O QR Code expira em 30 minutos.
              </p>
            </div>

            <Button onClick={handleClose} variant="outline" className="w-full">
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}