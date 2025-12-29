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
import { ScrollArea } from "@/components/ui/scroll-area";

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onPaymentCreated?: () => void;
}

const BALANCE_OPTIONS = [
  { value: 50, label: "R$ 50" },
  { value: 100, label: "R$ 100" },
  { value: 200, label: "R$ 200" },
  { value: 500, label: "R$ 500" },
];

export function PixPaymentDialog({
  open,
  onOpenChange,
  organizationId,
  onPaymentCreated,
}: PixPaymentDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<"form" | "qrcode" | "card">("form");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentType, setPaymentType] = useState<"balance" | "subscription">("balance");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState(user?.email || "");
  
  // Card fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cpf, setCpf] = useState("");
  
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    paymentId: string;
  } | null>(null);

  const getFinalAmount = () => {
    if (paymentType === "subscription") return 299;
    if (customAmount) return parseFloat(customAmount);
    return selectedAmount;
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

  const handleCardPayment = async () => {
    const amount = getFinalAmount();
    
    if (!amount || amount < 10) {
      toast.error("Valor mínimo é R$ 10,00");
      return;
    }

    if (!payerEmail || !cardNumber || !cardExpiry || !cardCvv || !cardHolder || !cpf) {
      toast.error("Preencha todos os campos do cartão");
      return;
    }

    setLoading(true);
    try {
      const [expiryMonth, expiryYear] = cardExpiry.split("/");
      
      const { data, error } = await supabase.functions.invoke("mercadopago-card", {
        body: {
          amount,
          description: paymentType === "balance" 
            ? `Recarga de saldo - R$ ${amount.toFixed(2)}` 
            : "Assinatura WhatsCode",
          payerEmail,
          payerName: cardHolder,
          organizationId,
          paymentType,
          cardNumber: cardNumber.replace(/\s/g, ""),
          cardExpiryMonth: expiryMonth,
          cardExpiryYear: `20${expiryYear}`,
          cardCvv,
          cardHolder,
          cpf: cpf.replace(/\D/g, ""),
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Pagamento aprovado! Créditos adicionados.");
        onPaymentCreated?.();
        handleClose();
      } else if (data.status === "pending" || data.status === "in_process") {
        toast.info("Pagamento em processamento. Aguarde a confirmação.");
        handleClose();
      } else {
        throw new Error(data.error || "Pagamento não aprovado");
      }
    } catch (err: unknown) {
      console.error("Error processing card payment:", err);
      const errorMessage = err instanceof Error ? err.message : "Erro ao processar pagamento";
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
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setCardHolder("");
    setCpf("");
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (paymentMethod === "pix") {
      handleGeneratePix();
    } else {
      handleCardPayment();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] p-0">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            {paymentMethod === "pix" ? <QrCode className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
            {paymentMethod === "pix" ? "Pagamento via PIX" : "Pagamento com Cartão"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {step === "form" 
              ? "Escolha o valor e forma de pagamento" 
              : step === "qrcode"
              ? "Escaneie o QR Code ou copie o código"
              : "Preencha os dados do cartão"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)]">
          <div className="p-4 sm:p-6 pt-4">
            {step === "form" ? (
              <div className="space-y-4">
                {/* Payment Type Selection */}
                <div className="space-y-2">
                  <Label className="text-sm">Tipo de Pagamento</Label>
                  <RadioGroup 
                    value={paymentType} 
                    onValueChange={(v) => setPaymentType(v as "balance" | "subscription")}
                    className="grid grid-cols-2 gap-2"
                  >
                    <Label 
                      htmlFor="balance" 
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        paymentType === "balance" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="balance" id="balance" className="sr-only" />
                      <Wallet className="w-5 h-5" />
                      <span className="font-medium text-sm">Recarga</span>
                      <span className="text-xs text-muted-foreground">Créditos</span>
                    </Label>
                    <Label 
                      htmlFor="subscription" 
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        paymentType === "subscription" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="subscription" id="subscription" className="sr-only" />
                      <CreditCard className="w-5 h-5" />
                      <span className="font-medium text-sm">Assinatura</span>
                      <span className="text-xs text-muted-foreground">R$ 299/mês</span>
                    </Label>
                  </RadioGroup>
                </div>

                {/* Payment Method */}
                <div className="space-y-2">
                  <Label className="text-sm">Forma de Pagamento</Label>
                  <RadioGroup 
                    value={paymentMethod} 
                    onValueChange={(v) => setPaymentMethod(v as "pix" | "card")}
                    className="grid grid-cols-2 gap-2"
                  >
                    <Label 
                      htmlFor="pix" 
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        paymentMethod === "pix" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="pix" id="pix" className="sr-only" />
                      <QrCode className="w-4 h-4" />
                      <span className="font-medium text-sm">PIX</span>
                    </Label>
                    <Label 
                      htmlFor="card" 
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        paymentMethod === "card" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="card" id="card" className="sr-only" />
                      <CreditCard className="w-4 h-4" />
                      <span className="font-medium text-sm">Cartão</span>
                    </Label>
                  </RadioGroup>
                </div>

                {/* Amount Selection (only for balance) */}
                {paymentType === "balance" && (
                  <div className="space-y-2">
                    <Label className="text-sm">Valor da Recarga</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {BALANCE_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={selectedAmount === option.value && !customAmount ? "default" : "outline"}
                          className="h-10 text-sm px-2"
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
                      <span className="text-xs text-muted-foreground shrink-0">ou</span>
                      <Input
                        type="number"
                        placeholder="Outro valor"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        min={10}
                        className="flex-1 h-9"
                      />
                    </div>
                  </div>
                )}

                {/* Payer Info */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="payerName" className="text-sm">Nome</Label>
                    <Input
                      id="payerName"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      placeholder="Seu nome completo"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="payerEmail" className="text-sm">Email *</Label>
                    <Input
                      id="payerEmail"
                      type="email"
                      value={payerEmail}
                      onChange={(e) => setPayerEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      className="h-9"
                    />
                  </div>
                </div>

                {/* Card Fields (only for card payment) */}
                {paymentMethod === "card" && (
                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-sm font-medium">Dados do Cartão</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="cardNumber" className="text-sm">Número do Cartão *</Label>
                      <Input
                        id="cardNumber"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                        placeholder="0000 0000 0000 0000"
                        maxLength={19}
                        className="h-9"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="cardExpiry" className="text-sm">Validade *</Label>
                        <Input
                          id="cardExpiry"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                          placeholder="MM/AA"
                          maxLength={5}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cardCvv" className="text-sm">CVV *</Label>
                        <Input
                          id="cardCvv"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          placeholder="123"
                          maxLength={4}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cardHolder" className="text-sm">Nome no Cartão *</Label>
                      <Input
                        id="cardHolder"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                        placeholder="NOME COMO NO CARTÃO"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cpf" className="text-sm">CPF do Titular *</Label>
                      <Input
                        id="cpf"
                        value={cpf}
                        onChange={(e) => setCpf(formatCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="h-9"
                      />
                    </div>
                  </div>
                )}

                {/* Summary */}
                <Card>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total a pagar</span>
                      <span className="text-xl font-bold text-primary">
                        R$ {getFinalAmount().toFixed(2)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={handleSubmit} disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : paymentMethod === "pix" ? (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Gerar QR Code PIX
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Pagar com Cartão
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* QR Code Display */}
                {pixData?.qrCodeBase64 && (
                  <div className="flex justify-center">
                    <div className="p-3 bg-white rounded-lg">
                      <img
                        src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                        alt="QR Code PIX"
                        className="w-40 h-40 sm:w-48 sm:h-48"
                      />
                    </div>
                  </div>
                )}

                {/* Copy Button */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Código PIX (Copia e Cola)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={pixData?.qrCode || ""}
                      readOnly
                      className="font-mono text-xs h-9"
                    />
                    <Button onClick={handleCopyPix} variant="outline" size="icon" className="h-9 w-9 shrink-0">
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="text-center space-y-1">
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
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
