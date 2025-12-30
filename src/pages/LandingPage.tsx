import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Bot,
  Send,
  GitBranch,
  BarChart3,
  Shield,
  Zap,
  Check,
  ArrowRight,
  Star,
  ChevronDown,
  Sparkles,
  Target,
  Clock,
  TrendingUp,
  Rocket,
  Phone,
  Filter,
  Ban,
  Calendar,
  Cpu,
  Gift,
  Play,
  Users,
  CheckCircle2,
  Plus,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import optimusLogoDark from "@/assets/optimus-logo-dark.png";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Intersection Observer hook for animations
const useInView = (threshold: number = 0.1) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isInView };
};

const features = [
  {
    icon: Send,
    title: "Disparos Alternados",
    description: "Único CRM focado em disparos alternados. Seus envios ficam mais inteligentes e com maior longevidade.",
    highlight: true,
  },
  {
    icon: Shield,
    title: "Anti-Contingência",
    description: "Foco total em manter seus números seguros. Disparos mais certeiros e proteção contra bloqueios.",
    highlight: true,
  },
  {
    icon: Phone,
    title: "WhatsApp Ilimitado",
    description: "Pague o plano e conecte quantos números quiser. Sem limites, sem surpresas na fatura.",
  },
  {
    icon: Filter,
    title: "Higienização",
    description: "Valide seus números automaticamente. Saiba quais contatos estão ativos no WhatsApp.",
  },
  {
    icon: Ban,
    title: "Lista Negra",
    description: "Bloqueie contatos indesejados. Mensagens nunca mais chegam para quem você não quer.",
  },
  {
    icon: Calendar,
    title: "Follow-Up Automático",
    description: "Programe suas mensagens e deixe o sistema enviar automaticamente para seus leads.",
  },
  {
    icon: GitBranch,
    title: "Pipeline Automático",
    description: "Com IA integrada, seus leads mudam de estágio automaticamente conforme a conversa evolui.",
  },
  {
    icon: BarChart3,
    title: "Relatórios Completos",
    description: "Acompanhe custos, templates e disparos em tempo real. Dados para decisões inteligentes.",
  },
  {
    icon: Bot,
    title: "Chatbot com IA",
    description: "Conecte todos seus números com inteligência artificial. Atendimento 24/7 automatizado.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Conecte seus números",
    description: "Vincule quantos números de WhatsApp precisar em poucos cliques. Sem complicação.",
  },
  {
    step: "02",
    title: "Configure sua estratégia",
    description: "Defina templates, pipeline e ative a IA para atender automaticamente.",
  },
  {
    step: "03",
    title: "Dispare com segurança",
    description: "Nosso sistema de disparos alternados garante maior entregabilidade e proteção.",
  },
];

const faqs = [
  {
    question: "O que são disparos alternados?",
    answer: "Disparos alternados distribuem os envios entre múltiplos números, reduzindo o risco de bloqueio e aumentando a taxa de entrega. É a forma mais inteligente e segura de fazer disparos em massa.",
  },
  {
    question: "Quantos números posso conectar?",
    answer: "Não há limite! Com o OptimusCRM você paga o plano e pode conectar quantos números de WhatsApp precisar, sem custos adicionais.",
  },
  {
    question: "Como funciona a higienização?",
    answer: "Você importa sua lista de contatos e nosso sistema verifica automaticamente quais números estão ativos no WhatsApp, eliminando números inválidos e economizando seus créditos.",
  },
  {
    question: "O chatbot com IA precisa de configuração complexa?",
    answer: "Não! Configurar o chatbot é simples e intuitivo. Em minutos você tem um atendente virtual funcionando 24/7 em todos os seus números.",
  },
  {
    question: "Posso testar antes de assinar?",
    answer: "Sim! Oferecemos 7 dias grátis para você testar todas as funcionalidades, além de R$10 de saldo bônus para seus primeiros disparos.",
  },
  {
    question: "Como funciona o pipeline automático?",
    answer: "A IA analisa as conversas e move automaticamente seus leads pelos estágios do funil. Você define os critérios e o sistema faz o resto.",
  },
];

const LandingPage = () => {
  const { user } = useAuth();
  const heroSection = useInView(0.1);
  const featuresSection = useInView(0.1);
  const howItWorksSection = useInView(0.1);
  const pricingSection = useInView(0.1);
  const faqSection = useInView(0.1);
  const ctaSection = useInView(0.1);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 30,
        y: (e.clientY / window.innerHeight - 0.5) * 30,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <img 
                src={optimusLogoDark} 
                alt="Optimus CRM" 
                className="h-8 w-auto object-contain"
              />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button 
                onClick={() => scrollToSection("features")} 
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                Recursos
              </button>
              <button 
                onClick={() => scrollToSection("how-it-works")} 
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                Como Funciona
              </button>
              <button 
                onClick={() => scrollToSection("pricing")} 
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                Preços
              </button>
              <button 
                onClick={() => scrollToSection("faq")} 
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                FAQ
              </button>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <Link to="/dashboard">
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white border-0">
                    Ir para Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/auth">
                    <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/5">
                      Entrar
                    </Button>
                  </Link>
                  <Link to="/cadastro">
                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white border-0">
                      Começar Grátis
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        ref={heroSection.ref}
        className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden"
      >
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Gradient Orbs */}
          <div 
            className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-violet-600/20 blur-[150px]"
            style={{ 
              transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
              transition: "transform 0.5s ease-out"
            }}
          />
          <div 
            className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-purple-500/15 blur-[120px]"
            style={{ 
              transform: `translate(${-mousePosition.x}px, ${-mousePosition.y}px)`,
              transition: "transform 0.5s ease-out"
            }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-blue-500/10 blur-[180px]" />
          
          {/* Grid Pattern */}
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: "60px 60px",
            }}
          />
          
          {/* Floating particles */}
          <div className="absolute inset-0">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-violet-400/30 rounded-full animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className={cn(
            "transition-all duration-1000",
            heroSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 mb-8">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-sm text-violet-300">Único CRM com disparos alternados</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight">
              <span className="text-white">Dispare com</span>
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                inteligência
              </span>
              <span className="text-white">, não com medo</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-white/60 max-w-3xl mx-auto mb-10 leading-relaxed">
              O OptimusCRM é o único CRM focado em <span className="text-white font-medium">anti-contingência</span>. 
              Disparos alternados, proteção contra bloqueios e WhatsApp ilimitado para 
              <span className="text-violet-400 font-medium"> escalar suas vendas com segurança</span>.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link to={user ? "/dashboard" : "/cadastro"}>
                <Button 
                  size="lg" 
                  className="text-lg px-8 py-6 bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/25 border-0 group"
                >
                  <Rocket className="w-5 h-5 mr-2 group-hover:animate-pulse" />
                  {user ? "Acessar Dashboard" : "Testar 7 Dias Grátis"}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 py-6 border-white/10 bg-white/5 hover:bg-white/10 text-white"
                onClick={() => scrollToSection("how-it-works")}
              >
                <Play className="w-5 h-5 mr-2" />
                Ver Como Funciona
              </Button>
            </div>

            {/* Trial Badge */}
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20">
              <Gift className="w-5 h-5 text-violet-400" />
              <span className="text-white/80">
                <span className="text-white font-semibold">7 dias grátis</span> + R$10 de saldo bônus
              </span>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 mt-16">
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">99.9%</div>
                <div className="text-sm text-white/40">Taxa de entrega</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">∞</div>
                <div className="text-sm text-white/40">WhatsApp ilimitados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">24/7</div>
                <div className="text-sm text-white/40">Atendimento IA</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">0</div>
                <div className="text-sm text-white/40">Bloqueios com alternância</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <button 
          onClick={() => scrollToSection("features")}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 hover:text-white/60 transition-colors animate-bounce"
        >
          <ChevronDown className="w-8 h-8" />
        </button>
      </section>

      {/* Features Section */}
      <section 
        id="features" 
        ref={featuresSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-violet-600/5 blur-[150px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-16 transition-all duration-700",
            featuresSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 mb-6">
              <Zap className="w-4 h-4 text-violet-400" />
              <span className="text-sm text-violet-300">Recursos Poderosos</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Tudo para{" "}
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                escalar suas vendas
              </span>
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Ferramentas inteligentes para disparar em massa com segurança e converter mais leads.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={feature.title}
                className={cn(
                  "group relative overflow-hidden border-white/5 bg-white/[0.02] backdrop-blur-sm hover:bg-white/[0.05] transition-all duration-500 hover:border-violet-500/30",
                  feature.highlight && "border-violet-500/20 bg-violet-500/[0.03]",
                  featuresSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                )}
                style={{ 
                  transitionDelay: featuresSection.isInView ? `${index * 50}ms` : "0ms" 
                }}
              >
                <CardContent className="p-6">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110",
                    feature.highlight 
                      ? "bg-gradient-to-br from-violet-500 to-purple-600" 
                      : "bg-white/5 border border-white/10"
                  )}>
                    <feature.icon className={cn(
                      "w-6 h-6",
                      feature.highlight ? "text-white" : "text-violet-400"
                    )} />
                  </div>
                  {feature.highlight && (
                    <Badge className="mb-3 bg-violet-500/10 text-violet-300 border-violet-500/20 text-xs">
                      Exclusivo
                    </Badge>
                  )}
                  <h3 className="text-lg font-semibold mb-2 text-white">{feature.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
                {/* Hover Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section 
        id="how-it-works"
        ref={howItWorksSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-purple-500/5" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-16 transition-all duration-700",
            howItWorksSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Como{" "}
              <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                funciona?
              </span>
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Três passos simples para começar a escalar suas vendas com segurança.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {howItWorks.map((item, index) => (
              <div 
                key={item.step}
                className={cn(
                  "relative text-center transition-all duration-500",
                  howItWorksSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                )}
                style={{ 
                  transitionDelay: howItWorksSection.isInView ? `${index * 150}ms` : "0ms" 
                }}
              >
                {/* Connector Line */}
                {index < howItWorks.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-violet-500/30 to-transparent" />
                )}
                
                <div className="relative mb-6">
                  <div className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 border border-violet-500/20 flex items-center justify-center">
                    <span className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                      {item.step}
                    </span>
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                <p className="text-white/50">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section 
        id="pricing"
        ref={pricingSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[180px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-16 transition-all duration-700",
            pricingSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Preço{" "}
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                simples e transparente
              </span>
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Um plano completo para escalar suas vendas. Sem surpresas.
            </p>
          </div>

          {/* Pricing Card */}
          <div className={cn(
            "max-w-lg mx-auto transition-all duration-700",
            pricingSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <Card className="relative overflow-hidden border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-purple-500/5 backdrop-blur-sm">
              {/* Popular Badge */}
              <div className="absolute top-0 right-0 px-4 py-1 bg-violet-500 text-white text-sm font-medium rounded-bl-xl">
                Mais Popular
              </div>
              
              <CardContent className="p-8">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">Plano Completo</h3>
                  <p className="text-white/50">Tudo que você precisa para escalar</p>
                </div>

                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-2xl text-white/50">R$</span>
                    <span className="text-6xl font-bold text-white">229</span>
                    <span className="text-2xl text-white/50">,90</span>
                  </div>
                  <p className="text-white/40 mt-2">por mês</p>
                </div>

                <div className="space-y-4 mb-8">
                  {[
                    "WhatsApp ilimitado",
                    "Disparos alternados (anti-contingência)",
                    "Higienização de números",
                    "Lista negra",
                    "Follow-up automático",
                    "Pipeline com IA",
                    "Chatbot inteligente",
                    "Relatórios completos",
                    "Suporte prioritário",
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-violet-400" />
                      </div>
                      <span className="text-white/70">{feature}</span>
                    </div>
                  ))}
                </div>

                <Link to={user ? "/dashboard" : "/cadastro"} className="block">
                  <Button 
                    size="lg" 
                    className="w-full text-lg py-6 bg-violet-600 hover:bg-violet-700 text-white border-0"
                  >
                    {user ? "Acessar Dashboard" : "Começar 7 Dias Grátis"}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>

                <p className="text-center text-white/40 text-sm mt-4">
                  + R$10 de saldo bônus • Cancele quando quiser
                </p>
              </CardContent>
            </Card>

            {/* Additional Resources Note */}
            <p className="text-center text-white/40 mt-6">
              Precisa de mais? Adicione recursos extras conforme sua necessidade.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section 
        id="faq"
        ref={faqSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-16 transition-all duration-700",
            faqSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Dúvidas?{" "}
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                A gente responde!
              </span>
            </h2>
            <p className="text-lg text-white/50">
              Tudo que você precisa saber sobre o OptimusCRM.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className={cn(
                  "border border-white/5 rounded-xl bg-white/[0.02] px-6 transition-all duration-500",
                  faqSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                )}
                style={{ 
                  transitionDelay: faqSection.isInView ? `${index * 100}ms` : "0ms" 
                }}
              >
                <AccordionTrigger className="text-left text-white hover:text-violet-300 hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-white/50 pb-5">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section 
        ref={ctaSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-t from-violet-600/20 via-purple-500/10 to-transparent" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-violet-600/20 blur-[150px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className={cn(
            "transition-all duration-700",
            ctaSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
              Pronto para{" "}
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                escalar suas vendas?
              </span>
            </h2>
            <p className="text-xl text-white/60 mb-10 max-w-2xl mx-auto">
              Junte-se a milhares de empresas que já dispararam suas vendas com segurança usando o OptimusCRM.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to={user ? "/dashboard" : "/cadastro"}>
                <Button 
                  size="lg" 
                  className="text-lg px-10 py-6 bg-white text-violet-900 hover:bg-white/90 shadow-xl shadow-white/10 border-0"
                >
                  <Rocket className="w-5 h-5 mr-2" />
                  {user ? "Acessar Dashboard" : "Começar 7 Dias Grátis"}
                </Button>
              </Link>
            </div>

            <div className="flex items-center justify-center gap-6 mt-8 text-white/40 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-violet-400" />
                <span>Sem cartão de crédito</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-violet-400" />
                <span>Setup em 5 minutos</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-violet-400" />
                <span>Cancele quando quiser</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img 
                src={optimusLogoDark} 
                alt="Optimus CRM" 
                className="h-6 w-auto object-contain opacity-60"
              />
            </div>
            
            <div className="flex items-center gap-8">
              <button 
                onClick={() => scrollToSection("features")} 
                className="text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                Recursos
              </button>
              <button 
                onClick={() => scrollToSection("pricing")} 
                className="text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                Preços
              </button>
              <button 
                onClick={() => scrollToSection("faq")} 
                className="text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                FAQ
              </button>
            </div>

            <p className="text-sm text-white/30">
              © {new Date().getFullYear()} OptimusCRM. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
