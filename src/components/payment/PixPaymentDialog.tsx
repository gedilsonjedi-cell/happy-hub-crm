import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { PaymentProcessingSkeleton } from "./PaymentProcessingSkeleton";
import { ConfettiEffect } from "./ConfettiEffect";

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 100 : -100,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 100 : -100,
    opacity: 0,
  }),
};

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const scaleIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 },
};

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

type Step = "amount" | "method" | "details" | "processing" | "qrcode" | "success";
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
  const [direction, setDirection] = useState(0);
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

    setDirection(1);
    setStep("processing");
    setLoading(true);
    
    // Frontend timeout to prevent infinite hang
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Tempo limite excedido. Tente novamente.")), 30000)
    );

    try {
      const pixPromise = supabase.functions.invoke("mercadopago-pix", {
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

      const { data, error } = await Promise.race([pixPromise, timeoutPromise]);

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
      setStep("details");
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

    setDirection(1);
    setStep("processing");
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
      setStep("details");
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
      setDirection(1);
      setStep("method");
    } else if (step === "method") {
      if (!paymentMethod) {
        toast.error("Selecione uma forma de pagamento");
        return;
      }
      setDirection(1);
      setStep("details");
    } else if (step === "details") {
      setDirection(1);
      if (paymentMethod === "pix") {
        handleGeneratePix();
      } else {
        handleCardPayment();
      }
    }
  };

  const handleBack = () => {
    setDirection(-1);
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
      <motion.div 
        className="text-center space-y-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-xl font-semibold">Quanto você quer adicionar?</h3>
        <p className="text-sm text-muted-foreground">Selecione o valor da recarga</p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        {BALANCE_OPTIONS.map((option, index) => (
          <motion.button
            key={option.value}
            type="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + index * 0.05 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedAmount(option.value);
              setCustomAmount("");
            }}
            className={cn(
              "relative p-4 rounded-xl border-2 transition-colors text-left",
              selectedAmount === option.value && !customAmount
                ? "border-primary bg-primary/5 shadow-md"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            {option.popular && (
              <motion.span 
                className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full flex items-center gap-1"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
              >
                <Sparkles className="w-3 h-3" />
                Popular
              </motion.span>
            )}
            <span className="text-2xl font-bold">{option.label}</span>
          </motion.button>
        ))}
      </div>

      <motion.div 
        className="relative"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">ou digite um valor</span>
        </div>
      </motion.div>

      <motion.div 
        className="relative"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
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
      </motion.div>

      <AnimatePresence>
        {getFinalAmount() > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 24 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-muted-foreground">Você receberá</span>
                <motion.span 
                  key={getFinalAmount()}
                  initial={{ scale: 1.2, color: "hsl(var(--primary))" }}
                  animate={{ scale: 1 }}
                  className="text-2xl font-bold text-primary"
                >
                  R$ {getFinalAmount().toFixed(2)}
                </motion.span>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const renderMethodStep = () => (
    <div className="space-y-6">
      <motion.div 
        className="text-center space-y-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-xl font-semibold">Como você quer pagar?</h3>
        <p className="text-sm text-muted-foreground">Escolha a forma de pagamento</p>
      </motion.div>

      <div className="space-y-3">
        <motion.button
          type="button"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setPaymentMethod("pix")}
          className={cn(
            "w-full p-5 rounded-xl border-2 transition-colors flex items-center gap-4",
            paymentMethod === "pix"
              ? "border-primary bg-primary/5 shadow-md"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <motion.div 
            className={cn(
              "w-14 h-14 rounded-xl flex items-center justify-center transition-colors",
              paymentMethod === "pix" ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
            animate={paymentMethod === "pix" ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <QrCode className="w-7 h-7" />
          </motion.div>
          <div className="text-left flex-1">
            <p className="text-lg font-semibold">PIX</p>
            <p className="text-sm text-muted-foreground">Pagamento instantâneo via QR Code</p>
          </div>
          <AnimatePresence>
            {paymentMethod === "pix" && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 180 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

        <motion.button
          type="button"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setPaymentMethod("card")}
          className={cn(
            "w-full p-5 rounded-xl border-2 transition-colors flex items-center gap-4",
            paymentMethod === "card"
              ? "border-primary bg-primary/5 shadow-md"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <motion.div 
            className={cn(
              "w-14 h-14 rounded-xl flex items-center justify-center transition-colors",
              paymentMethod === "card" ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
            animate={paymentMethod === "card" ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <CreditCard className="w-7 h-7" />
          </motion.div>
          <div className="text-left flex-1">
            <p className="text-lg font-semibold">Cartão de Crédito</p>
            <p className="text-sm text-muted-foreground">Pagamento à vista, aprovação imediata</p>
          </div>
          <AnimatePresence>
            {paymentMethod === "card" && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 180 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="bg-muted/50">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="text-xl font-bold">R$ {getFinalAmount().toFixed(2)}</span>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );

  const renderDetailsStep = () => (
    <div className="space-y-5">
      <motion.div 
        className="text-center space-y-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-xl font-semibold">
          {paymentMethod === "pix" ? "Confirme seus dados" : "Dados do cartão"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {paymentMethod === "pix" 
            ? "Precisamos do seu email para enviar o comprovante"
            : "Preencha os dados do cartão de crédito"
          }
        </p>
      </motion.div>

      <motion.div 
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
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
          <motion.div 
            className="space-y-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <Label htmlFor="payerName">Nome (opcional)</Label>
            <Input
              id="payerName"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="Seu nome completo"
              className="h-12"
            />
          </motion.div>
        )}

        {paymentMethod === "card" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
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
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
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
      </motion.div>
    </div>
  );

  const renderQRCodeStep = () => (
    <div className="space-y-6">
      <motion.div 
        className="text-center space-y-2"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
        >
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        </motion.div>
        <h3 className="text-xl font-semibold">PIX gerado com sucesso!</h3>
        <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código</p>
      </motion.div>

      {pixData?.qrCodeBase64 && (
        <motion.div 
          className="flex justify-center"
          initial={{ opacity: 0, scale: 0.8, rotateY: 90 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ delay: 0.3, duration: 0.5, type: "spring" }}
        >
          <div className="p-4 bg-white rounded-2xl shadow-lg">
            <img
              src={`data:image/png;base64,${pixData.qrCodeBase64}`}
              alt="QR Code PIX"
              className="w-48 h-48"
            />
          </div>
        </motion.div>
      )}

      <motion.div 
        className="space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Label>Código PIX (Copia e Cola)</Label>
        <div className="flex gap-2">
          <Input
            value={pixData?.qrCode || ""}
            readOnly
            className="font-mono text-xs"
          />
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button 
              onClick={handleCopyPix} 
              variant={copied ? "default" : "outline"} 
              size="icon" 
              className="shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
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
      </motion.div>

      <Button onClick={handleClose} variant="outline" className="w-full">
        Fechar
      </Button>
    </div>
  );

  const renderProcessingStep = () => (
    <PaymentProcessingSkeleton />
  );

  const renderSuccessStep = () => (
    <div className="space-y-6 text-center py-6">
      <ConfettiEffect trigger={step === "success"} />
      
      <motion.div 
        className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </motion.div>
      </motion.div>
      
      <motion.div 
        className="space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-2xl font-bold">Pagamento aprovado!</h3>
        <p className="text-muted-foreground">
          R$ {getFinalAmount().toFixed(2)} foram adicionados ao seu saldo
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <p className="text-sm text-green-600">
              Seus créditos já estão disponíveis para uso.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Button onClick={handleClose} className="w-full" size="lg">
          Concluir
        </Button>
      </motion.div>
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
          <div className="p-5 overflow-hidden">
            {renderStepIndicator()}
            
            <AnimatePresence mode="wait" custom={direction}>
              {step === "amount" && (
                <motion.div
                  key="amount"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  {renderAmountStep()}
                </motion.div>
              )}
              {step === "method" && (
                <motion.div
                  key="method"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  {renderMethodStep()}
                </motion.div>
              )}
              {step === "details" && (
                <motion.div
                  key="details"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  {renderDetailsStep()}
                </motion.div>
              )}
              {step === "qrcode" && (
                <motion.div
                  key="qrcode"
                  variants={scaleIn}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {renderQRCodeStep()}
                </motion.div>
              )}
              {step === "processing" && (
                <motion.div
                  key="processing"
                  variants={scaleIn}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {renderProcessingStep()}
                </motion.div>
              )}
              {step === "success" && (
                <motion.div
                  key="success"
                  variants={scaleIn}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {renderSuccessStep()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {step !== "qrcode" && step !== "success" && step !== "processing" && (
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
              {step === "details" ? (
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
