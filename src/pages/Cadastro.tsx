import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  Eye, 
  EyeOff, 
  Mail, 
  Lock, 
  Loader2, 
  User, 
  Phone, 
  ArrowRight, 
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Gift,
  Calendar
} from "lucide-react";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import optimusLogo from "@/assets/optimus-logo.png";
import { cn } from "@/lib/utils";
import { SplashScreen } from "@/components/splash/SplashScreen";

const stepSchemas = {
  1: z.object({
    name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres").max(100),
    email: z.string().email("Email inválido").max(255),
  }),
  2: z.object({
    phone: z.string()
      .min(10, "Telefone deve ter no mínimo 10 dígitos")
      .max(15, "Telefone inválido")
      .regex(/^[\d\s()-]+$/, "Telefone inválido"),
    referralSource: z.string().min(1, "Selecione como nos conheceu"),
  }),
  3: z.object({
    password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(72),
  }),
};

const referralSources = [
  { id: "google", label: "Google", emoji: "🔍" },
  { id: "youtube", label: "YouTube", emoji: "📺" },
  { id: "instagram", label: "Instagram", emoji: "📷" },
  { id: "facebook", label: "Facebook", emoji: "👍" },
  { id: "tiktok", label: "TikTok", emoji: "🎵" },
  { id: "indicacao", label: "Indicação de amigo", emoji: "🤝" },
  { id: "linkedin", label: "LinkedIn", emoji: "💼" },
  { id: "outro", label: "Outro", emoji: "✨" },
];

const Cadastro = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [direction, setDirection] = useState(1);
  const [showSplash, setShowSplash] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    referralSource: "",
    password: "",
  });

  const totalSteps = 3;

  // Get referral code from URL
  const searchParams = new URLSearchParams(window.location.search);
  const referralCodeFromUrl = searchParams.get('ref');

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSplashComplete = () => {
    navigate("/dashboard");
  };

  // Show splash screen
  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} duration={2500} />;
  }

  const validateStep = () => {
    const schema = stepSchemas[step as keyof typeof stepSchemas];
    let dataToValidate = {};
    
    if (step === 1) {
      dataToValidate = { name: formData.name, email: formData.email };
    } else if (step === 2) {
      dataToValidate = { phone: formData.phone, referralSource: formData.referralSource };
    } else if (step === 3) {
      dataToValidate = { password: formData.password };
    }

    const result = schema.safeParse(dataToValidate);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const formatPhone = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, "");
    
    // Format as (XX) XXXXX-XXXX
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setFormData({ ...formData, phone: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep()) return;

    setLoading(true);

    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            display_name: formData.name,
            phone: formData.phone,
            referral_source: formData.referralSource,
            referral_code: referralCodeFromUrl || null,
          },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast.error("Este email já está cadastrado. Faça login.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      // If referral code exists and user was created, register the referral
      if (referralCodeFromUrl && signUpData.user) {
        try {
          // Get the referrer's organization from the code
          const { data: referralCodeData } = await supabase
            .from('referral_codes')
            .select('organization_id')
            .eq('code', referralCodeFromUrl)
            .maybeSingle();

          if (referralCodeData) {
            // We'll need to wait for the profile to be created, then register referral
            // This is done via a database trigger or we do it after profile creation
            sessionStorage.setItem('pending_referral', JSON.stringify({
              referrerOrgId: referralCodeData.organization_id,
              userId: signUpData.user.id
            }));
          }
        } catch (refError) {
          console.error('Error processing referral:', refError);
          // Don't block signup if referral fails
        }
      }

      // Move to success step
      setStep(4);
    } catch (error) {
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };


  const goNext = () => {
    setDirection(1);
    handleNext();
  };

  const goBack = () => {
    setDirection(-1);
    handleBack();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <img 
            src={optimusLogo} 
            alt="Optimus CRM" 
            className="h-12 w-auto mx-auto mb-4"
          />
        </motion.div>

        {/* Progress Bar - only show for steps 1-3 */}
        {step <= 3 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div 
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                      s < step 
                        ? "bg-primary text-primary-foreground" 
                        : s === step 
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/30" 
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s < step ? <CheckCircle2 className="w-5 h-5" /> : s}
                  </div>
                  {s < 3 && (
                    <div 
                      className={cn(
                        "w-20 sm:w-32 h-1 mx-2 rounded transition-all duration-300",
                        s < step ? "bg-primary" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Dados pessoais</span>
              <span>Contato</span>
              <span>Senha</span>
            </div>
          </motion.div>
        )}

        {/* Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-2xl"
        >
          <AnimatePresence mode="wait" custom={direction}>
            {/* Step 1: Name & Email */}
            {step === 1 && (
              <motion.div
                key="step1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Crie sua conta</h2>
                  <p className="text-muted-foreground">Comece sua jornada com o OptimusCRM</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-foreground">Seu nome</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="Como podemos te chamar?"
                        className="pl-10 h-12 bg-muted/50 border-border text-lg"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="seu@email.com"
                        className="pl-10 h-12 bg-muted/50 border-border text-lg"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={goNext} 
                  className="w-full mt-6 h-12 text-lg gap-2"
                >
                  Continuar
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </motion.div>
            )}

            {/* Step 2: Phone & Referral Source */}
            {step === 2 && (
              <motion.div
                key="step2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Quase lá, {formData.name.split(" ")[0]}!</h2>
                  <p className="text-muted-foreground">Precisamos de mais algumas informações</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-foreground">WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="(11) 99999-9999"
                        className="pl-10 h-12 bg-muted/50 border-border text-lg"
                        value={formData.phone}
                        onChange={handlePhoneChange}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-foreground">Como nos conheceu?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {referralSources.map((source) => (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, referralSource: source.id })}
                          className={cn(
                            "flex items-center gap-2 p-3 rounded-lg border-2 transition-all duration-200 text-left",
                            formData.referralSource === source.id
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-muted/50"
                          )}
                        >
                          <span className="text-lg">{source.emoji}</span>
                          <span className="text-sm font-medium">{source.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button 
                    variant="outline" 
                    onClick={goBack} 
                    className="flex-1 h-12 text-lg gap-2"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Voltar
                  </Button>
                  <Button 
                    onClick={goNext} 
                    className="flex-1 h-12 text-lg gap-2"
                  >
                    Continuar
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Password */}
            {step === 3 && (
              <motion.div
                key="step3"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Crie sua senha</h2>
                  <p className="text-muted-foreground">Escolha uma senha segura para sua conta</p>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-foreground">Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Mínimo 6 caracteres"
                          className="pl-10 pr-10 h-12 bg-muted/50 border-border text-lg"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          autoFocus
                          disabled={loading}
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={goBack} 
                      className="flex-1 h-12 text-lg gap-2"
                      disabled={loading}
                    >
                      <ArrowLeft className="w-5 h-5" />
                      Voltar
                    </Button>
                    <Button 
                      type="submit"
                      className="flex-1 h-12 text-lg gap-2"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Criando...
                        </>
                      ) : (
                        <>
                          Criar conta
                          <Sparkles className="w-5 h-5" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Step 4: Success */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="text-center py-6"
              >
                {/* Celebration Animation */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary to-green-500 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-12 h-12 text-white" />
                </motion.div>

                <motion.h2 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-3xl font-bold text-foreground mb-4"
                >
                  Parabéns, {formData.name.split(" ")[0]}! 🎉
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-muted-foreground mb-8 text-lg"
                >
                  Sua conta foi criada com sucesso!
                </motion.p>

                {/* Benefits Cards */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="space-y-4 mb-8"
                >
                  <div className="bg-gradient-to-r from-primary/20 to-purple-500/20 border border-primary/30 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/30 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-6 h-6 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-foreground text-lg">7 dias grátis</p>
                      <p className="text-sm text-muted-foreground">Para você testar todas as funcionalidades</p>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/30 flex items-center justify-center flex-shrink-0">
                      <Gift className="w-6 h-6 text-green-500" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-foreground text-lg">R$ 10,00 de bônus</p>
                      <p className="text-sm text-muted-foreground">Para começar suas primeiras comunicações</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button 
                    onClick={() => setShowSplash(true)}
                    className="w-full h-14 text-lg gap-2 bg-gradient-to-r from-primary to-primary/80"
                  >
                    Acessar minha conta
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Login Link - only show for steps 1-3 */}
        {step <= 3 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-6 text-center"
          >
            <p className="text-sm text-muted-foreground">
              Já tem uma conta?{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={() => navigate("/auth")}
              >
                Faça login
              </button>
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Cadastro;
