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
import { Card, CardContent } from "@/components/ui/card";
import { 
  Loader2, 
  Copy, 
  Check, 
  QrCode, 
  Wallet, 
  CreditCard, 
  ArrowLeft, 
  ArrowRight,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onPaymentCreated?: () => void;
}

const BALANCE_OPTIONS = [
  { value: 50, label: "R$ 50", popular: false },
  { value: 100, label: "R$ 100", popular: true },
  { value: 200, label: "R$ 200", popular: false },
  { value: 500, label: "R$ 500", popular: false },
];

type Step = "amount" | "method" | "details" | "qrcode" | "success";
type PaymentType = "balance" | "subscription";
type PaymentMethod = "pix" | "card";

export function PixPaymentDialog({
  open,
  onOpenChange,
  organizationId,
  onPaymentCreated,
}: PixPaymentDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("amount");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [paymentType, setPaymentType] = useState<PaymentType>("balance");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
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
    return selectedAmount || 0;
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
        setStep("success");
        onPaymentCreated?.();
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
    setStep("amount");
    setPixData(null);
    setCopied(false);
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setCardHolder("");
    setCpf("");
    setSelectedAmount(null);
    setCustomAmount("");
    setPaymentMethod(null);
    onOpenChange(false);
  };

  const handleNext = () => {
    if (step === "amount") {
      if (!getFinalAmount() || getFinalAmount() < 10) {
        toast.error("Selecione um valor (mínimo R$ 10)");
        return;
      }
      setStep("method");
    } else if (step === "method") {
      if (!paymentMethod) {
        toast.error("Selecione uma forma de pagamento");
        return;
      }
      setStep("details");
    } else if (step === "details") {
      if (paymentMethod === "pix") {
        handleGeneratePix();
      } else {
        handleCardPayment();
      }
    }
  };

  const handleBack = () => {
    if (step === "method") setStep("amount");
    else if (step === "details") setStep("method");
    else if (step === "qrcode") setStep("details");
  };

  const canProceed = () => {
    if (step === "amount") return getFinalAmount() >= 10;
    if (step === "method") return !!paymentMethod;
    if (step === "details") {
      if (paymentMethod === "pix") return !!payerEmail;
      return !!payerEmail && !!cardNumber && !!cardExpiry && !!cardCvv && !!cardHolder && !!cpf;
    }
    return true;
  };

  const getStepNumber = () => {
    const steps = ["amount", "method", "details"];
    return steps.indexOf(step) + 1;
  };

  const renderStepIndicator = () => {
    if (step === "qrcode" || step === "success") return null;
    
    const steps = [
      { id: "amount", label: "Valor" },
      { id: "method", label: "Pagamento" },
      { id: "details", label: "Dados" },
    ];

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, index) => {
          const isActive = s.id === step;
          const isPast = steps.findIndex(st => st.id === step) > index;
          
          return (
            <div key={s.id} className="flex items-center">
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all",
                isActive && "bg-primary text-primary-foreground scale-110",
                isPast && "bg-primary/20 text-primary",
                !isActive && !isPast && "bg-muted text-muted-foreground"
              )}>
                {isPast ? <Check className="w-4 h-4" /> : index + 1}
              </div>
              {index < steps.length - 1 && (
                <div className={cn(
                  "w-8 h-0.5 mx-1",
                  isPast ? "bg-primary/50" : "bg-muted"
                )} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderAmountStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">Quanto você quer adicionar?</h3>
        <p className="text-sm text-muted-foreground">Selecione o valor da recarga</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {BALANCE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setSelectedAmount(option.value);
              setCustomAmount("");
            }}
            className={cn(
              "relative p-4 rounded-xl border-2 transition-all text-left",
              selectedAmount === option.value && !customAmount
                ? "border-primary bg-primary/5 shadow-md"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            {option.popular && (
              <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Popular
              </span>
            )}
            <span className="text-2xl font-bold">{option.label}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">ou digite um valor</span>
        </div>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">R$</span>
        <Input
          type="number"
          placeholder="0,00"
          value={customAmount}
          onChange={(e) => {
            setCustomAmount(e.target.value);
            setSelectedAmount(null);
          }}
          min={10}
          className="pl-10 h-14 text-xl font-medium"
        />
      </div>

      {getFinalAmount() > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-muted-foreground">Você receberá</span>
            <span className="text-2xl font-bold text-primary">
              R$ {getFinalAmount().toFixed(2)}
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderMethodStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">Como você quer pagar?</h3>
        <p className="text-sm text-muted-foreground">Escolha a forma de pagamento</p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setPaymentMethod("pix")}
          className={cn(
            "w-full p-5 rounded-xl border-2 transition-all flex items-center gap-4",
            paymentMethod === "pix"
              ? "border-primary bg-primary/5 shadow-md"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <div className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center",
            paymentMethod === "pix" ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>
            <QrCode className="w-7 h-7" />
          </div>
          <div className="text-left flex-1">
            <p className="text-lg font-semibold">PIX</p>
            <p className="text-sm text-muted-foreground">Pagamento instantâneo via QR Code</p>
          </div>
          {paymentMethod === "pix" && (
            <CheckCircle2 className="w-6 h-6 text-primary" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setPaymentMethod("card")}
          className={cn(
            "w-full p-5 rounded-xl border-2 transition-all flex items-center gap-4",
            paymentMethod === "card"
              ? "border-primary bg-primary/5 shadow-md"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <div className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center",
            paymentMethod === "card" ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>
            <CreditCard className="w-7 h-7" />
          </div>
          <div className="text-left flex-1">
            <p className="text-lg font-semibold">Cartão de Crédito</p>
            <p className="text-sm text-muted-foreground">Pagamento à vista, aprovação imediata</p>
          </div>
          {paymentMethod === "card" && (
            <CheckCircle2 className="w-6 h-6 text-primary" />
          )}
        </button>
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-4 flex items-center justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="text-xl font-bold">R$ {getFinalAmount().toFixed(2)}</span>
        </CardContent>
      </Card>
    </div>
  );

  const renderDetailsStep = () => (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">
          {paymentMethod === "pix" ? "Confirme seus dados" : "Dados do cartão"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {paymentMethod === "pix" 
            ? "Precisamos do seu email para enviar o comprovante"
            : "Preencha os dados do cartão de crédito"
          }
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="payerEmail">Email *</Label>
          <Input
            id="payerEmail"
            type="email"
            value={payerEmail}
            onChange={(e) => setPayerEmail(e.target.value)}
            placeholder="seu@email.com"
            className="h-12"
          />
        </div>

        {paymentMethod === "pix" && (
          <div className="space-y-2">
            <Label htmlFor="payerName">Nome (opcional)</Label>
            <Input
              id="payerName"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="Seu nome completo"
              className="h-12"
            />
          </div>
        )}

        {paymentMethod === "card" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="cardNumber">Número do Cartão *</Label>
              <Input
                id="cardNumber"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                className="h-12 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cardExpiry">Validade *</Label>
                <Input
                  id="cardExpiry"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/AA"
                  maxLength={5}
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cardCvv">CVV *</Label>
                <Input
                  id="cardCvv"
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="123"
                  maxLength={4}
                  className="h-12"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cardHolder">Nome no Cartão *</Label>
              <Input
                id="cardHolder"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                placeholder="NOME COMO NO CARTÃO"
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF do Titular *</Label>
              <Input
                id="cpf"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="h-12"
              />
            </div>
          </>
        )}
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground">Valor</span>
            <span className="font-medium">R$ {getFinalAmount().toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Forma de pagamento</span>
            <span className="font-medium flex items-center gap-1.5">
              {paymentMethod === "pix" ? (
                <><QrCode className="w-4 h-4" /> PIX</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Cartão</>
              )}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderQRCodeStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <h3 className="text-xl font-semibold">PIX gerado com sucesso!</h3>
        <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código</p>
      </div>

      {pixData?.qrCodeBase64 && (
        <div className="flex justify-center">
          <div className="p-4 bg-white rounded-2xl shadow-lg">
            <img
              src={`data:image/png;base64,${pixData.qrCodeBase64}`}
              alt="QR Code PIX"
              className="w-48 h-48"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Código PIX (Copia e Cola)</Label>
        <div className="flex gap-2">
          <Input
            value={pixData?.qrCode || ""}
            readOnly
            className="font-mono text-xs"
          />
          <Button 
            onClick={handleCopyPix} 
            variant={copied ? "default" : "outline"} 
            size="icon" 
            className="shrink-0"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-4 text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            Após o pagamento, o saldo será creditado automaticamente.
          </p>
          <p className="text-xs text-muted-foreground">
            O QR Code expira em 30 minutos.
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleClose} variant="outline" className="w-full">
        Fechar
      </Button>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="space-y-6 text-center py-6">
      <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>
      
      <div className="space-y-2">
        <h3 className="text-2xl font-bold">Pagamento aprovado!</h3>
        <p className="text-muted-foreground">
          R$ {getFinalAmount().toFixed(2)} foram adicionados ao seu saldo
        </p>
      </div>

      <Card className="bg-green-500/5 border-green-500/20">
        <CardContent className="p-4">
          <p className="text-sm text-green-600">
            Seus créditos já estão disponíveis para uso.
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleClose} className="w-full" size="lg">
        Concluir
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Wallet className="w-5 h-5 text-primary" />
            Adicionar Créditos
          </DialogTitle>
          <DialogDescription className="sr-only">
            Adicione créditos à sua conta
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-10rem)]">
          <div className="p-5">
            {renderStepIndicator()}
            
            {step === "amount" && renderAmountStep()}
            {step === "method" && renderMethodStep()}
            {step === "details" && renderDetailsStep()}
            {step === "qrcode" && renderQRCodeStep()}
            {step === "success" && renderSuccessStep()}
          </div>
        </ScrollArea>

        {step !== "qrcode" && step !== "success" && (
          <div className="p-5 pt-0 flex gap-3">
            {step !== "amount" && (
              <Button 
                variant="outline" 
                onClick={handleBack}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            )}
            <Button 
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : step === "details" ? (
                paymentMethod === "pix" ? "Gerar PIX" : "Pagar"
              ) : (
                <>
                  Continuar
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
