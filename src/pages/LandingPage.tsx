import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, useInView as useFramerInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
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
import optimusLogo from "@/assets/optimus-logo.png";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Animation variants with proper typing
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const } }
};

const fadeInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const } }
};

const fadeInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const } }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

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
    title: "Foco em Contingência",
    description: "Foco total em manter seus números seguros. Disparos mais certeiros e proteção contra bloqueios.",
    highlight: true,
  },
  {
    icon: Phone,
    title: "WhatsApp API Oficial Ilimitado",
    description: "API Oficial do WhatsApp Business. Conecte quantos números quiser sem limites e sem surpresas na fatura.",
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
    answer: "Sim! Oferecemos 7 dias grátis para você testar todas as funcionalidades da plataforma, sem compromisso.",
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
    <>
      <Helmet>
        <title>OptimusCRM - CRM WhatsApp com Disparos Alternados e IA | 7 Dias Grátis</title>
        <meta name="description" content="OptimusCRM é o único CRM focado em contingência com disparos alternados, WhatsApp API Oficial ilimitado, chatbot com IA e pipeline automático. Teste grátis por 7 dias." />
        <meta name="keywords" content="CRM WhatsApp, disparos alternados, WhatsApp Business API, chatbot IA, automação WhatsApp, CRM vendas, pipeline automático, whatsapp oficial, crm para whatsapp" />
        <link rel="canonical" href="https://optimuscrm.com.br/" />
        <meta property="og:title" content="OptimusCRM - CRM WhatsApp com Disparos Alternados e IA" />
        <meta property="og:description" content="Único CRM focado em contingência com disparos alternados, WhatsApp API Oficial ilimitado e chatbot com IA. 7 dias grátis." />
        <meta property="og:url" content="https://optimuscrm.com.br/" />
        <meta property="og:type" content="website" />
        
        {/* Schema markup - Organization */}
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "OptimusCRM",
            "url": "https://optimuscrm.com.br",
            "logo": "https://optimuscrm.com.br/logo.png",
            "sameAs": [
              "https://www.instagram.com/optimuscrm",
              "https://www.linkedin.com/company/optimuscrm"
            ],
            "contactPoint": {
              "@type": "ContactPoint",
              "telephone": "+55-11-99999-9999",
              "contactType": "customer service",
              "availableLanguage": "Portuguese"
            }
          }
        `}</script>
        
        {/* Schema markup - Software/Product with Reviews */}
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "OptimusCRM",
            "operatingSystem": "Web",
            "applicationCategory": "BusinessApplication",
            "description": "CRM WhatsApp com disparos alternados, API oficial ilimitada e chatbot com IA",
            "offers": {
              "@type": "Offer",
              "price": "197",
              "priceCurrency": "BRL",
              "priceValidUntil": "2026-12-31"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.9",
              "ratingCount": "1247",
              "bestRating": "5",
              "worstRating": "1"
            },
            "review": [
              {
                "@type": "Review",
                "reviewRating": {
                  "@type": "Rating",
                  "ratingValue": "5",
                  "bestRating": "5"
                },
                "author": {
                  "@type": "Person",
                  "name": "Ricardo Mendes"
                },
                "reviewBody": "Melhor CRM que já usei. Os disparos alternados realmente funcionam e não tive mais problemas com bloqueios."
              },
              {
                "@type": "Review",
                "reviewRating": {
                  "@type": "Rating",
                  "ratingValue": "5",
                  "bestRating": "5"
                },
                "author": {
                  "@type": "Person",
                  "name": "Fernanda Costa"
                },
                "reviewBody": "O chatbot com IA mudou completamente meu atendimento. Economizo horas por dia e os clientes adoram."
              },
              {
                "@type": "Review",
                "reviewRating": {
                  "@type": "Rating",
                  "ratingValue": "5",
                  "bestRating": "5"
                },
                "author": {
                  "@type": "Person",
                  "name": "Carlos Eduardo"
                },
                "reviewBody": "API oficial ilimitada sem custos extras foi o diferencial. Conectei 15 números e funciona perfeitamente."
              },
              {
                "@type": "Review",
                "reviewRating": {
                  "@type": "Rating",
                  "ratingValue": "5",
                  "bestRating": "5"
                },
                "author": {
                  "@type": "Person",
                  "name": "Ana Paula Silva"
                },
                "reviewBody": "Suporte excepcional e plataforma muito intuitiva. Migrei do concorrente e não me arrependo."
              },
              {
                "@type": "Review",
                "reviewRating": {
                  "@type": "Rating",
                  "ratingValue": "4",
                  "bestRating": "5"
                },
                "author": {
                  "@type": "Person",
                  "name": "Marcos Oliveira"
                },
                "reviewBody": "Ótima ferramenta para disparos em massa. Pipeline automático é muito prático."
              }
            ]
          }
        `}</script>
        
        {/* Schema markup - FAQ */}
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "O que são disparos alternados?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Disparos alternados distribuem os envios entre múltiplos números, reduzindo o risco de bloqueio e aumentando a taxa de entrega. É a forma mais inteligente e segura de fazer disparos em massa."
                }
              },
              {
                "@type": "Question",
                "name": "Quantos números posso conectar?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Não há limite! Com o OptimusCRM você paga o plano e pode conectar quantos números de WhatsApp precisar, sem custos adicionais."
                }
              },
              {
                "@type": "Question",
                "name": "Como funciona a higienização?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Você importa sua lista de contatos e nosso sistema verifica automaticamente quais números estão ativos no WhatsApp, eliminando números inválidos e economizando seus créditos."
                }
              },
              {
                "@type": "Question",
                "name": "O chatbot com IA precisa de configuração complexa?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Não! Configurar o chatbot é simples e intuitivo. Em minutos você tem um atendente virtual funcionando 24/7 em todos os seus números."
                }
              },
              {
                "@type": "Question",
                "name": "Posso testar antes de assinar?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Sim! Oferecemos 7 dias grátis para você testar todas as funcionalidades da plataforma, sem compromisso."
                }
              }
            ]
          }
        `}</script>
        
        {/* Schema markup - BreadcrumbList */}
        <script type="application/ld+json">{`
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://optimuscrm.com.br"
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "WhatsApp Oficial",
                "item": "https://optimuscrm.com.br/whatsapp-oficial"
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": "Blog",
                "item": "https://optimuscrm.com.br/blog"
              }
            ]
          }
        `}</script>
      </Helmet>
      <main className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden" role="main">
      {/* Navigation */}
      <header role="banner">
        <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5" aria-label="Navegação principal">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <img 
                  src={optimusLogo} 
                  alt="OptimusCRM - CRM WhatsApp com Disparos Alternados" 
                  className="h-6 sm:h-8 w-auto object-contain"
                  width="120"
                  height="32"
                  loading="eager"
                />
              </div>
              <div className="hidden md:flex items-center gap-8" role="navigation">
                <button 
                  onClick={() => scrollToSection("features")} 
                  className="text-sm text-white/60 hover:text-white transition-colors"
                  aria-label="Ver recursos do OptimusCRM"
                >
                  Recursos
                </button>
                <button 
                  onClick={() => scrollToSection("how-it-works")} 
                  className="text-sm text-white/60 hover:text-white transition-colors"
                  aria-label="Como funciona o OptimusCRM"
                >
                  Como Funciona
                </button>
                <button 
                  onClick={() => scrollToSection("pricing")} 
                  className="text-sm text-white/60 hover:text-white transition-colors"
                  aria-label="Ver preços e planos"
                >
                  Preços
                </button>
                <button 
                  onClick={() => scrollToSection("faq")} 
                  className="text-sm text-white/60 hover:text-white transition-colors"
                  aria-label="Perguntas frequentes"
                >
                  FAQ
                </button>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                {user ? (
                  <Link to="/dashboard" aria-label="Acessar painel de controle">
                    <Button size="sm" className="bg-[#04f59c] hover:bg-[#03d989] text-black border-0 text-xs sm:text-sm px-3 sm:px-4">
                      Dashboard
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link to="/auth" className="hidden sm:block" aria-label="Fazer login no OptimusCRM">
                      <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/5">
                        Entrar
                      </Button>
                    </Link>
                    <Link to="/cadastro" aria-label="Criar conta gratuita no OptimusCRM">
                      <Button size="sm" className="bg-[#04f59c] hover:bg-[#03d989] text-black border-0 text-xs sm:text-sm px-3 sm:px-4">
                        Começar Grátis
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section 
        ref={heroSection.ref}
        className="relative min-h-screen flex items-center justify-center pt-32 overflow-hidden"
        aria-labelledby="hero-heading"
      >
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Gradient Orbs */}
          <div 
            className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-[#04f59c]/20 blur-[150px]"
            style={{ 
              transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
              transition: "transform 0.5s ease-out"
            }}
          />
          <div 
            className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-[#04f59c]/15 blur-[120px]"
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
                className="absolute w-1 h-1 bg-[#04f59c]/30 rounded-full animate-pulse"
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
          <motion.div
            initial="hidden"
            animate={heroSection.isInView ? "visible" : "hidden"}
            variants={staggerContainer}
          >
            {/* Badge */}
            <motion.div 
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-[#04f59c]/10 border border-[#04f59c]/20 mb-6 sm:mb-8"
            >
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-[#04f59c]" />
              </motion.div>
              <span className="text-xs sm:text-sm text-[#04f59c]">Único CRM com disparos alternados</span>
            </motion.div>
            
            <motion.h1 
              id="hero-heading"
              variants={fadeInUp}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold tracking-tight mb-4 sm:mb-6 leading-tight px-2"
            >
              <span className="text-white">Dispare com</span>
              <br />
              <motion.span 
                className="bg-gradient-to-r from-[#04f59c] via-[#03d989] to-[#02b872] bg-clip-text text-transparent inline-block"
                animate={{ 
                  backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                style={{ backgroundSize: "200% 200%" }}
              >
                inteligência
              </motion.span>
              <span className="text-white">, não com medo</span>
            </motion.h1>
            
            <motion.p 
              variants={fadeInUp}
              className="text-base sm:text-lg md:text-xl text-white/60 max-w-3xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2"
            >
              O OptimusCRM é o único CRM focado em <span className="text-white font-medium">contingência</span>. 
              Disparos alternados, proteção contra bloqueios e <span className="text-[#04f59c] font-medium">WhatsApp API Oficial Ilimitado</span> para 
              <span className="text-[#04f59c] font-medium"> escalar suas vendas com segurança</span>.
            </motion.p>

            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 sm:mb-12 px-4"
            >
              <Link to={user ? "/dashboard" : "/cadastro"} className="w-full sm:w-auto">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    size="lg" 
                    className="text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 bg-[#04f59c] hover:bg-[#03d989] text-black shadow-lg shadow-[#04f59c]/25 border-0 group w-full sm:w-auto"
                  >
                    <motion.div
                      animate={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Rocket className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    </motion.div>
                    {user ? "Acessar Dashboard" : "Testar 7 Dias Grátis"}
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </motion.div>
              </Link>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full sm:w-auto"
              >
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 border-white/10 bg-white/5 hover:bg-white/10 text-white w-full sm:w-auto"
                  onClick={() => scrollToSection("how-it-works")}
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  Ver Como Funciona
                </Button>
              </motion.div>
            </motion.div>

            {/* Trial Badge */}
            <motion.div 
              variants={scaleIn}
              animate={{ 
                boxShadow: [
                  "0 0 20px rgba(4, 245, 156, 0.2)",
                  "0 0 40px rgba(4, 245, 156, 0.4)",
                  "0 0 20px rgba(4, 245, 156, 0.2)"
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-flex flex-col sm:flex-row items-center gap-3 sm:gap-4 px-6 sm:px-10 py-4 sm:py-6 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-[#04f59c]/15 to-[#02b872]/15 border-2 border-[#04f59c]/30 mx-4"
            >
              <motion.div 
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                <Gift className="w-6 h-6 sm:w-8 sm:h-8 text-[#04f59c]" />
              </motion.div>
              <span className="text-base sm:text-xl text-white/80 text-center">
                <span className="text-white font-bold text-lg sm:text-2xl">7 dias grátis</span> • Sem cartão de crédito
              </span>
            </motion.div>

            {/* Stats */}
            <motion.div 
              variants={staggerContainer}
              className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-6 sm:gap-12 lg:gap-16 mt-12 sm:mt-24 mb-10 sm:mb-16 px-4"
            >
              {[
                { value: "99.9%", label: "Taxa de entrega" },
                { value: "∞", label: "WhatsApp API Oficial" },
                { value: "24/7", label: "Atendimento IA" },
                { value: "0", label: "Bloqueios com alternância" },
              ].map((stat, index) => (
                <motion.div 
                  key={stat.label}
                  variants={fadeInUp}
                  whileHover={{ scale: 1.1, y: -5 }}
                  className="text-center cursor-default"
                >
                  <motion.div 
                    className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-1"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={heroSection.isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ delay: 0.5 + index * 0.1, type: "spring", stiffness: 200 }}
                  >
                    {stat.value}
                  </motion.div>
                  <div className="text-xs sm:text-sm text-white/40">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.button 
          onClick={() => scrollToSection("features")}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 hover:text-white/60 transition-colors"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-8 h-8" />
        </motion.button>
      </section>

      {/* Features Section */}
      <section 
        id="features" 
        ref={featuresSection.ref}
        className="relative py-16 sm:py-20 overflow-hidden"
        aria-labelledby="features-heading"
      >
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#04f59c]/5 blur-[150px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-[#04f59c]/5 blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-10 transition-all duration-700",
            featuresSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#04f59c]/10 border border-[#04f59c]/20 mb-6">
              <Zap className="w-4 h-4 text-[#04f59c]" />
              <span className="text-sm text-[#04f59c]">Recursos Poderosos</span>
            </div>
            <h2 id="features-heading" className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-4 px-2">
              Tudo para{" "}
              <span className="bg-gradient-to-r from-[#04f59c] to-[#02b872] bg-clip-text text-transparent">
                escalar suas vendas
              </span>
            </h2>
            <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto px-4">
              Ferramentas inteligentes para disparar em massa com segurança e converter mais leads.
            </p>
          </div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="hidden"
            animate={featuresSection.isInView ? "visible" : "hidden"}
            role="list"
            aria-label="Lista de recursos do OptimusCRM"
          >
            {features.map((feature, index) => (
              <motion.article
                key={feature.title}
                variants={fadeInUp}
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                role="listitem"
              >
                <Card 
                  className={cn(
                    "group relative overflow-hidden border-white/5 bg-white/[0.02] backdrop-blur-sm hover:bg-white/[0.05] transition-all duration-500 hover:border-[#04f59c]/30 h-full",
                    feature.highlight && "border-[#04f59c]/20 bg-[#04f59c]/[0.03]"
                  )}
                >
                  <CardContent className="p-6">
                    <motion.div 
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
                        feature.highlight 
                          ? "bg-gradient-to-br from-[#04f59c] to-[#02b872]" 
                          : "bg-white/5 border border-white/10"
                      )}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      <feature.icon className={cn(
                        "w-6 h-6",
                        feature.highlight ? "text-black" : "text-[#04f59c]"
                      )} />
                    </motion.div>
                    {feature.highlight && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                      >
                        <Badge className="mb-3 bg-[#04f59c]/10 text-[#04f59c] border-[#04f59c]/20 text-xs">
                          Exclusivo
                        </Badge>
                      </motion.div>
                    )}
                    <h3 className="text-lg font-semibold mb-2 text-white">{feature.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed">{feature.description}</p>
                  </CardContent>
                  {/* Hover Glow */}
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-br from-[#04f59c]/5 to-transparent pointer-events-none"
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                </Card>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="relative py-16 sm:py-20 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#04f59c]/5 to-transparent" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#04f59c]/10 border border-[#04f59c]/20 mb-6">
              <Target className="w-4 h-4 text-[#04f59c]" />
              <span className="text-sm text-[#04f59c]">Por que somos diferentes</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-4 px-2">
              OptimusCRM vs{" "}
              <span className="bg-gradient-to-r from-white/40 to-white/20 bg-clip-text text-transparent">
                Outros CRMs
              </span>
            </h2>
            <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto px-4">
              Veja por que empresas estão migrando para o OptimusCRM.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* OptimusCRM Column */}
            <motion.div 
              className="relative"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeInLeft}
            >
              <motion.div 
                className="absolute -inset-1 bg-gradient-to-r from-[#04f59c]/20 to-[#02b872]/20 rounded-3xl blur-xl"
                animate={{ 
                  opacity: [0.5, 0.8, 0.5],
                  scale: [1, 1.02, 1]
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
              <Card className="relative overflow-hidden border-[#04f59c]/30 bg-gradient-to-b from-[#04f59c]/10 to-[#02b872]/5 backdrop-blur-sm h-full">
                <CardContent className="p-5 sm:p-8">
                  <div className="flex items-center gap-3 mb-8">
                    <motion.img 
                      src={optimusLogo} 
                      alt="Optimus CRM" 
                      className="h-8 w-auto object-contain"
                      whileHover={{ scale: 1.1 }}
                    />
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Badge className="bg-[#04f59c] text-black border-0 font-semibold">
                        Recomendado
                      </Badge>
                    </motion.div>
                  </div>
                  
                  <div className="space-y-5">
                    {[
                      { feature: "WhatsApp API Oficial", value: "Ilimitado", highlight: true },
                      { feature: "Disparos em massa", value: "Alternados (anti-bloqueio)", highlight: true },
                      { feature: "Chatbot com IA", value: "Incluído no plano", highlight: false },
                      { feature: "Higienização de números", value: "Incluída", highlight: false },
                      { feature: "Pipeline automático", value: "Com IA integrada", highlight: false },
                      { feature: "Follow-up automático", value: "Ilimitado", highlight: false },
                      { feature: "Relatórios", value: "Completos e em tempo real", highlight: false },
                      { feature: "Suporte", value: "Prioritário", highlight: false },
                    ].map((item, index) => (
                      <motion.div 
                        key={index} 
                        className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-0"
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <span className="text-white/70">{item.feature}</span>
                        <div className="flex items-center gap-2">
                          <motion.div
                            initial={{ scale: 0 }}
                            whileInView={{ scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.05 + 0.2, type: "spring" }}
                          >
                            <CheckCircle2 className="w-5 h-5 text-[#04f59c] flex-shrink-0" />
                          </motion.div>
                          <span className={cn(
                            "font-medium text-right",
                            item.highlight ? "text-[#04f59c]" : "text-white"
                          )}>
                            {item.value}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-8 pt-6 border-t border-[#04f59c]/20">
                    <div className="text-center">
                      <motion.div 
                        className="text-3xl font-bold text-white mb-2"
                        initial={{ scale: 0.5, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ type: "spring", stiffness: 200 }}
                      >
                        R$ 299,90<span className="text-lg text-white/50">/mês</span>
                      </motion.div>
                      <p className="text-[#04f59c] text-sm">Tudo incluído, sem surpresas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Competitors Column */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeInRight}
            >
              <Card className="overflow-hidden border-white/10 bg-white/[0.02] backdrop-blur-sm h-full">
                <CardContent className="p-5 sm:p-8">
                  <div className="flex items-center gap-3 mb-6 sm:mb-8">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <span className="text-white/50 text-lg">?</span>
                    </div>
                    <span className="text-white/50 font-medium text-base sm:text-lg">Outros CRMs do mercado</span>
                  </div>
                  
                  <div className="space-y-5">
                    {[
                      { feature: "WhatsApp API Oficial", value: "R$ 50-100/número" },
                      { feature: "Disparos em massa", value: "Sem alternância" },
                      { feature: "Chatbot com IA", value: "Pago à parte" },
                      { feature: "Higienização de números", value: "Não oferece" },
                      { feature: "Pipeline automático", value: "Manual apenas" },
                      { feature: "Follow-up automático", value: "Limitado ou pago" },
                      { feature: "Relatórios", value: "Básicos" },
                      { feature: "Suporte", value: "Ticket comum" },
                    ].map((item, index) => (
                      <motion.div 
                        key={index} 
                        className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-0"
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <span className="text-white/50">{item.feature}</span>
                        <div className="flex items-center gap-2">
                          <Minus className="w-5 h-5 text-red-400/70 flex-shrink-0" />
                          <span className="font-medium text-white/40 text-right">
                            {item.value}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/10">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-white/40 mb-2">R$ 650-900+<span className="text-lg text-white/30">/mês</span></div>
                      <p className="text-white/30 text-sm">Custos extras por recurso</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Bottom CTA */}
          <motion.div 
            className="text-center mt-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-white/50 mb-6">
              Economize até <motion.span 
                className="text-[#04f59c] font-semibold"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >60%</motion.span> comparado a outras soluções do mercado
            </p>
            <Link to={user ? "/dashboard" : "/cadastro"}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  size="lg" 
                  className="text-lg px-8 py-6 bg-[#04f59c] hover:bg-[#03d989] text-black shadow-lg shadow-[#04f59c]/25 border-0 group"
                >
                  <Rocket className="w-5 h-5 mr-2" />
                  Migrar para o OptimusCRM
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </motion.div>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Reviews/Testimonials Section */}
      <section className="relative py-16 sm:py-24 overflow-hidden" aria-labelledby="reviews-heading">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] rounded-full bg-[#04f59c]/5 blur-[150px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-blue-500/5 blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#04f59c]/10 border border-[#04f59c]/20 mb-6">
              <Star className="w-4 h-4 text-[#04f59c] fill-[#04f59c]" />
              <span className="text-sm text-[#04f59c]">Avaliações reais</span>
            </div>
            <h2 id="reviews-heading" className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-4 px-2">
              O que nossos{" "}
              <span className="bg-gradient-to-r from-[#04f59c] to-[#02b872] bg-clip-text text-transparent">
                clientes dizem
              </span>
            </h2>
            <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto px-4">
              Mais de 2.500 empresas confiam no OptimusCRM para suas operações de WhatsApp.
            </p>
            
            {/* Rating Summary */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <span className="text-xl sm:text-2xl font-bold text-white">4.9</span>
              <span className="text-white/50 text-sm">(1.247 avaliações)</span>
            </div>
          </motion.div>

          {/* Reviews Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                name: "Ricardo Mendes",
                role: "CEO, Digital Marketing Agency",
                rating: 5,
                review: "Melhor CRM que já usei. Os disparos alternados realmente funcionam e não tive mais problemas com bloqueios. Economia de tempo e dinheiro.",
                avatar: "RM"
              },
              {
                name: "Fernanda Costa",
                role: "Gerente de Vendas",
                rating: 5,
                review: "O chatbot com IA mudou completamente meu atendimento. Economizo horas por dia e os clientes adoram a rapidez nas respostas.",
                avatar: "FC"
              },
              {
                name: "Carlos Eduardo",
                role: "Dono de E-commerce",
                rating: 5,
                review: "API oficial ilimitada sem custos extras foi o diferencial. Conectei 15 números e funciona perfeitamente. Suporte excelente!",
                avatar: "CE"
              },
              {
                name: "Ana Paula Silva",
                role: "Coordenadora de Atendimento",
                rating: 5,
                review: "Suporte excepcional e plataforma muito intuitiva. Migrei do concorrente e não me arrependo. Vale cada centavo.",
                avatar: "AP"
              },
              {
                name: "Marcos Oliveira",
                role: "Consultor de Vendas",
                rating: 5,
                review: "Ótima ferramenta para disparos em massa. Pipeline automático é muito prático e a IA qualifica os leads automaticamente.",
                avatar: "MO"
              },
              {
                name: "Juliana Santos",
                role: "Diretora Comercial",
                rating: 5,
                review: "Aumentamos nossas vendas em 40% após implementar o OptimusCRM. A automação de follow-up é simplesmente fantástica.",
                avatar: "JS"
              }
            ].map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full border-white/10 bg-white/5 backdrop-blur-sm hover:border-[#04f59c]/30 transition-colors">
                  <CardContent className="p-6">
                    {/* Stars */}
                    <div className="flex items-center gap-1 mb-4">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      ))}
                    </div>
                    
                    {/* Review Text */}
                    <p className="text-white/80 text-sm leading-relaxed mb-6">
                      "{testimonial.review}"
                    </p>
                    
                    {/* Author */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#04f59c] to-[#02b872] flex items-center justify-center text-black font-bold text-sm">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <div className="text-white font-medium text-sm">{testimonial.name}</div>
                        <div className="text-white/50 text-xs">{testimonial.role}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Trust Badges */}
          <motion.div 
            className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-8"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="flex items-center gap-2 text-white/50">
              <Shield className="w-5 h-5 text-[#04f59c]" />
              <span className="text-sm">Meta Business Partner</span>
            </div>
            <div className="flex items-center gap-2 text-white/50">
              <Users className="w-5 h-5 text-[#04f59c]" />
              <span className="text-sm">+2.500 empresas ativas</span>
            </div>
            <div className="flex items-center gap-2 text-white/50">
              <MessageSquare className="w-5 h-5 text-[#04f59c]" />
              <span className="text-sm">+10M mensagens/mês</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Model Section - Pay per Message */}
      <section className="relative py-16 sm:py-20 overflow-hidden bg-gradient-to-b from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f]">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#04f59c]/10 blur-[200px]" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-10"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#04f59c]/10 border border-[#04f59c]/20 mb-6">
              <Shield className="w-4 h-4 text-[#04f59c]" />
              <span className="text-sm text-[#04f59c]">Transparência Total</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-4 px-2">
              Repasse{" "}
              <span className="bg-gradient-to-r from-[#04f59c] to-[#02b872] bg-clip-text text-transparent">
                direto da Meta
              </span>
              , sem{" "}
              <span className="bg-gradient-to-r from-[#04f59c] to-[#02b872] bg-clip-text text-transparent">
                markup
              </span>
            </h2>
            <p className="text-base sm:text-lg text-white/50 max-w-3xl mx-auto px-4">
              Você paga exatamente o que a Meta cobra pelos templates oficiais.
              <span className="text-white font-medium"> Zero margem nossa em cima do envio</span> — o preço é o preço da fonte.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Our Model */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Card className="relative overflow-hidden border-[#04f59c]/30 bg-gradient-to-br from-[#04f59c]/10 to-[#02b872]/5 backdrop-blur-sm">
                <motion.div 
                  className="absolute -inset-1 bg-gradient-to-r from-[#04f59c]/20 to-[#02b872]/20 rounded-3xl blur-xl -z-10"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <CardContent className="p-5 sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <motion.img 
                      src={optimusLogo} 
                      alt="Optimus CRM" 
                      className="h-8 w-auto object-contain"
                      whileHover={{ scale: 1.1 }}
                    />
                    <Badge className="bg-[#04f59c] text-black border-0 font-semibold">
                      Nosso modelo
                    </Badge>
                  </div>

                  <div className="space-y-6">
                    <motion.div 
                      className="text-center p-4 sm:p-6 rounded-2xl bg-[#04f59c]/10 border border-[#04f59c]/20"
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="text-xs sm:text-sm text-[#04f59c] mb-2">Margem sobre o envio</div>
                      <motion.div 
                        className="text-3xl sm:text-5xl font-bold text-white"
                        initial={{ scale: 0.5 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ type: "spring", stiffness: 200 }}
                      >
                        0%
                      </motion.div>
                      <div className="text-white/50 text-xs sm:text-sm mt-2">Você paga o preço de tabela da Meta</div>
                    </motion.div>

                    <div className="space-y-4">
                      {[
                        { icon: Shield, text: "Repasse 100% do valor oficial da Meta" },
                        { icon: TrendingUp, text: "Sem markup, sem taxa por envio" },
                        { icon: MessageSquare, text: "Mensagens recebidas sempre gratuitas" },
                        { icon: Phone, text: "Conecte quantos números quiser" },
                      ].map((item, index) => (
                        <motion.div 
                          key={index}
                          className="flex items-center gap-3"
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <div className="w-8 h-8 rounded-lg bg-[#04f59c]/20 flex items-center justify-center">
                            <item.icon className="w-4 h-4 text-[#04f59c]" />
                          </div>
                          <span className="text-white/80">{item.text}</span>
                        </motion.div>
                      ))}
                    </div>

                    {/* Example Calculation */}
                    <div className="pt-6 border-t border-[#04f59c]/20">
                      <div className="text-sm text-white/50 mb-3">Template Marketing • Brasil</div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/70">Você paga:</span>
                        <motion.span 
                          className="text-2xl font-bold text-[#04f59c]"
                          initial={{ opacity: 0 }}
                          whileInView={{ opacity: 1 }}
                          viewport={{ once: true }}
                        >
                          Preço da Meta
                        </motion.span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Competitors Model */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Card className="relative overflow-hidden border-white/10 bg-white/[0.02] backdrop-blur-sm">
                <CardContent className="p-5 sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <span className="text-white/50 text-lg">?</span>
                    </div>
                    <span className="text-white/50 font-medium">Modelo do mercado</span>
                  </div>

                  <div className="space-y-6">
                    <div className="text-center p-4 sm:p-6 rounded-2xl bg-red-500/10 border border-red-500/20">
                      <div className="text-xs sm:text-sm text-red-400/70 mb-2">Markup sobre cada envio</div>
                      <div className="text-3xl sm:text-5xl font-bold text-white/40">
                        +30 a 100%
                      </div>
                      <div className="text-white/30 text-xs sm:text-sm mt-2">Em cima do preço da Meta</div>
                    </div>

                    <div className="space-y-4">
                      {[
                        { text: "Margem oculta no preço por mensagem" },
                        { text: "Você paga acima do valor oficial" },
                        { text: "Sem clareza sobre quanto é taxa" },
                        { text: "Quanto mais envia, mais eles lucram" },
                      ].map((item, index) => (
                        <motion.div 
                          key={index}
                          className="flex items-center gap-3"
                          initial={{ opacity: 0, x: 20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <Minus className="w-4 h-4 text-red-400/70" />
                          </div>
                          <span className="text-white/40">{item.text}</span>
                        </motion.div>
                      ))}
                    </div>

                    {/* Example Calculation */}
                    <div className="pt-6 border-t border-white/10">
                      <div className="text-sm text-white/30 mb-3">Mesmo template • Brasil</div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/40">Você paga:</span>
                        <span className="text-2xl font-bold text-red-400/70">
                          Meta + margem
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Savings Banner */}
          <motion.div 
            className="mt-8 sm:mt-12 p-5 sm:p-8 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-[#04f59c]/10 via-[#04f59c]/5 to-[#04f59c]/10 border border-[#04f59c]/20 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <motion.div 
                  className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-[#04f59c]/20 flex items-center justify-center"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-[#04f59c]" />
                </motion.div>
                <div>
                  <div className="text-white/50 text-xs sm:text-sm">Nossa margem sobre o envio</div>
                  <motion.div 
                    className="text-2xl sm:text-3xl font-bold text-[#04f59c]"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    Exatamente 0%
                  </motion.div>
                </div>
              </div>
              
              <div className="w-full h-px bg-[#04f59c]/20 sm:hidden" />
              
              <div className="text-center">
                <p className="text-white/70 text-sm sm:text-base max-w-md">
                  O valor pago por template é <span className="text-[#04f59c] font-semibold">exatamente o que a Meta cobra</span>. Nosso lucro vem da plataforma, não do seu volume de mensagens.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section 
        id="how-it-works"
        ref={howItWorksSection.ref}
        className="relative py-16 sm:py-20 overflow-hidden"
      >
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#04f59c]/5 via-transparent to-[#02b872]/5" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-10 transition-all duration-700",
            howItWorksSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-4 px-2">
              Como{" "}
              <span className="bg-gradient-to-r from-[#04f59c] to-[#02b872] bg-clip-text text-transparent">
                funciona?
              </span>
            </h2>
            <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto px-4">
              Três passos simples para começar a escalar suas vendas com segurança.
            </p>
          </div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4"
            variants={staggerContainer}
            initial="hidden"
            animate={howItWorksSection.isInView ? "visible" : "hidden"}
          >
            {howItWorks.map((item, index) => (
              <motion.div 
                key={item.step}
                className="relative text-center"
                variants={fadeInUp}
              >
                {/* Connector Line */}
                {index < howItWorks.length - 1 && (
                  <motion.div 
                    className="hidden md:block absolute top-12 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-[#04f59c]/30 to-transparent"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + index * 0.2, duration: 0.5 }}
                    style={{ transformOrigin: "left" }}
                  />
                )}
                
                <motion.div 
                  className="relative mb-4 sm:mb-6"
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <motion.div 
                    className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#04f59c]/20 to-[#02b872]/10 border border-[#04f59c]/20 flex items-center justify-center"
                    animate={{ 
                      boxShadow: [
                        "0 0 0px rgba(4, 245, 156, 0)",
                        "0 0 20px rgba(4, 245, 156, 0.3)",
                        "0 0 0px rgba(4, 245, 156, 0)"
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
                  >
                    <span className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[#04f59c] to-[#02b872] bg-clip-text text-transparent">
                      {item.step}
                    </span>
                  </motion.div>
                </motion.div>
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-2 sm:mb-3">{item.title}</h3>
                <p className="text-sm sm:text-base text-white/50">{item.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section 
        id="pricing"
        ref={pricingSection.ref}
        className="relative py-16 sm:py-20 overflow-hidden"
      >
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#04f59c]/10 blur-[180px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-10 transition-all duration-700",
            pricingSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-4 px-2">
              Preço{" "}
              <span className="bg-gradient-to-r from-[#04f59c] to-[#02b872] bg-clip-text text-transparent">
                simples e transparente
              </span>
            </h2>
            <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto px-4">
              Um plano completo para escalar suas vendas. Sem surpresas.
            </p>
          </div>

          {/* Pricing Card */}
          <motion.div 
            className="max-w-lg mx-auto px-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={scaleIn}
          >
            <motion.div
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Card className="relative overflow-hidden border-[#04f59c]/30 bg-gradient-to-b from-[#04f59c]/10 to-[#02b872]/5 backdrop-blur-sm">
                {/* Popular Badge */}
                <motion.div 
                  className="absolute top-0 right-0 px-3 sm:px-4 py-1 bg-[#04f59c] text-black text-xs sm:text-sm font-medium rounded-bl-xl"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Mais Popular
                </motion.div>
                
                <CardContent className="p-5 sm:p-8">
                  <div className="text-center mb-6 sm:mb-8">
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Plano Completo</h3>
                    <p className="text-sm sm:text-base text-white/50">Tudo que você precisa para escalar</p>
                  </div>

                  <motion.div 
                    className="text-center mb-6 sm:mb-8"
                    initial={{ scale: 0.5, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                  >
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-xl sm:text-2xl text-white/50">R$</span>
                      <span className="text-4xl sm:text-6xl font-bold text-white">299</span>
                      <span className="text-xl sm:text-2xl text-white/50">,90</span>
                    </div>
                    <p className="text-white/40 mt-2 text-sm sm:text-base">por mês</p>
                  </motion.div>

                  <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                    {[
                      "WhatsApp API Oficial Ilimitado",
                      "Disparos de WhatsApp API [Foco em Contingência]",
                      "Lista negra",
                      "Follow-up automático",
                      "Pipeline com IA",
                      "Chatbot inteligente",
                      "Relatórios completos",
                      "Suporte prioritário",
                    ].map((feature, index) => (
                      <motion.div 
                        key={index} 
                        className="flex items-center gap-3"
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <motion.div 
                          className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#04f59c]/20 flex items-center justify-center flex-shrink-0"
                          initial={{ scale: 0 }}
                          whileInView={{ scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: index * 0.05 + 0.1, type: "spring" }}
                        >
                          <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#04f59c]" />
                        </motion.div>
                        <span className="text-sm sm:text-base text-white/70">{feature}</span>
                      </motion.div>
                    ))}
                  </div>

                  <Link to={user ? "/dashboard" : "/cadastro"} className="block">
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Button 
                        size="lg" 
                        className="w-full text-base sm:text-lg py-5 sm:py-6 bg-[#04f59c] hover:bg-[#03d989] text-black border-0"
                      >
                        {user ? "Acessar Dashboard" : "Começar 7 Dias Grátis"}
                        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
                      </Button>
                    </motion.div>
                  </Link>

                  <p className="text-center text-white/40 text-xs sm:text-sm mt-4">
                    + R$10 de saldo bônus • Cancele quando quiser
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Additional Resources Note */}
            <motion.p 
              className="text-center text-white/40 mt-6"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
            >
              Precisa de mais? Adicione recursos extras conforme sua necessidade.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section 
        id="faq"
        ref={faqSection.ref}
        className="relative py-16 sm:py-20 overflow-hidden"
      >
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-10 transition-all duration-700",
            faqSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-4 px-2">
              Dúvidas?{" "}
              <span className="bg-gradient-to-r from-[#04f59c] to-[#02b872] bg-clip-text text-transparent">
                A gente responde!
              </span>
            </h2>
            <p className="text-base sm:text-lg text-white/50 px-4">
              Tudo que você precisa saber sobre o OptimusCRM.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-3 sm:space-y-4 px-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className={cn(
                  "border border-white/5 rounded-xl bg-white/[0.02] px-4 sm:px-6 transition-all duration-500",
                  faqSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                )}
                style={{ 
                  transitionDelay: faqSection.isInView ? `${index * 100}ms` : "0ms" 
                }}
              >
                <AccordionTrigger className="text-left text-sm sm:text-base text-white hover:text-[#04f59c] hover:no-underline py-4 sm:py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm sm:text-base text-white/50 pb-4 sm:pb-5">
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
        className="relative py-16 sm:py-20 overflow-hidden"
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-t from-[#04f59c]/20 via-[#02b872]/10 to-transparent" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-[#04f59c]/20 blur-[150px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className={cn(
            "transition-all duration-700",
            ctaSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-4 sm:mb-6 px-2">
              Pronto para{" "}
              <span className="bg-gradient-to-r from-[#04f59c] via-[#03d989] to-[#02b872] bg-clip-text text-transparent">
                escalar suas vendas?
              </span>
            </h2>
            <p className="text-base sm:text-xl text-white/60 mb-8 sm:mb-10 max-w-2xl mx-auto px-4">
              Junte-se a milhares de empresas que já dispararam suas vendas com segurança usando o OptimusCRM.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4">
              <Link to={user ? "/dashboard" : "/cadastro"} className="w-full sm:w-auto">
                <Button 
                  size="lg" 
                  className="text-base sm:text-lg px-8 sm:px-10 py-5 sm:py-6 bg-white text-black hover:bg-white/90 shadow-xl shadow-white/10 border-0 w-full sm:w-auto"
                >
                  <Rocket className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  {user ? "Acessar Dashboard" : "Começar 7 Dias Grátis"}
                </Button>
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 mt-6 sm:mt-8 text-white/40 text-xs sm:text-sm px-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-[#04f59c]" />
                <span>Sem cartão de crédito</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-[#04f59c]" />
                <span>Setup em 5 minutos</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-[#04f59c]" />
                <span>Cancele quando quiser</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/5 py-8 sm:py-12" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center gap-6 text-center">
            <div className="flex items-center gap-3">
              <img 
                src={optimusLogo} 
                alt="OptimusCRM - CRM WhatsApp com Disparos Alternados" 
                className="h-5 sm:h-6 w-auto object-contain opacity-60"
                width="100"
                height="24"
                loading="lazy"
              />
            </div>
            
            <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-8" aria-label="Links do rodapé">
              <button 
                onClick={() => scrollToSection("features")} 
                className="text-xs sm:text-sm text-white/40 hover:text-white/60 transition-colors"
                aria-label="Ver recursos"
              >
                Recursos
              </button>
              <button 
                onClick={() => scrollToSection("pricing")} 
                className="text-xs sm:text-sm text-white/40 hover:text-white/60 transition-colors"
                aria-label="Ver preços"
              >
                Preços
              </button>
              <button 
                onClick={() => scrollToSection("faq")} 
                className="text-xs sm:text-sm text-white/40 hover:text-white/60 transition-colors"
                aria-label="Perguntas frequentes"
              >
                FAQ
              </button>
            </nav>

            <p className="text-xs sm:text-sm text-white/30">
              © {new Date().getFullYear()} OptimusCRM. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </main>
    </>
  );
};

export default LandingPage;
