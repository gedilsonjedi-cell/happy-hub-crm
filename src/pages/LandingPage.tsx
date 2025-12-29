import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Users,
  Bot,
  Send,
  GitBranch,
  BarChart3,
  Shield,
  Zap,
  Check,
  ArrowRight,
  Play,
  Star,
  ChevronDown,
  Sparkles,
  Target,
  Clock,
  TrendingUp,
  HeartHandshake,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import optimusLogo from "@/assets/optimus-logo.png";

// Parallax hook
const useParallax = (speed: number = 0.5) => {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const scrolled = window.scrollY;
        setOffset(scrolled * speed);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [speed]);

  return { ref, offset };
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
    icon: MessageSquare,
    title: "WhatsApp Integrado",
    description: "Conecte múltiplos números e gerencie todas as conversas em um único lugar. Atendimento centralizado e eficiente.",
    color: "from-green-500 to-emerald-600",
  },
  {
    icon: Bot,
    title: "Chatbot com IA",
    description: "Automatize o atendimento 24/7 com inteligência artificial. Qualifique leads e responda perguntas automaticamente.",
    color: "from-purple-500 to-violet-600",
  },
  {
    icon: Send,
    title: "Disparos em Massa",
    description: "Campanhas de marketing segmentadas com templates personalizados. Alcance milhares de contatos em segundos.",
    color: "from-blue-500 to-cyan-600",
  },
  {
    icon: GitBranch,
    title: "Pipeline de Vendas",
    description: "Visualize e gerencie todo o funil de vendas. Acompanhe cada lead do primeiro contato ao fechamento.",
    color: "from-orange-500 to-amber-600",
  },
  {
    icon: Users,
    title: "Gestão de Contatos",
    description: "Base de leads organizada com tags, campos personalizados e segmentação inteligente.",
    color: "from-pink-500 to-rose-600",
  },
  {
    icon: BarChart3,
    title: "Relatórios Avançados",
    description: "Métricas detalhadas de performance. Tome decisões baseadas em dados reais do seu negócio.",
    color: "from-teal-500 to-cyan-600",
  },
];

const benefits = [
  {
    icon: Clock,
    title: "Economize Tempo",
    description: "Automatize tarefas repetitivas e foque no que realmente importa: vender.",
    stat: "70%",
    statLabel: "menos tempo em tarefas manuais",
  },
  {
    icon: TrendingUp,
    title: "Aumente Vendas",
    description: "Conversão otimizada com follow-ups automáticos e qualificação inteligente.",
    stat: "3x",
    statLabel: "mais conversões",
  },
  {
    icon: HeartHandshake,
    title: "Fidelize Clientes",
    description: "Atendimento personalizado e ágil que encanta e retém seus clientes.",
    stat: "95%",
    statLabel: "satisfação do cliente",
  },
  {
    icon: Target,
    title: "Escale Resultados",
    description: "Infraestrutura robusta que cresce junto com o seu negócio.",
    stat: "∞",
    statLabel: "potencial de crescimento",
  },
];

const testimonials = [
  {
    name: "Carlos Silva",
    role: "CEO, TechStart",
    content: "O OptimusCRM revolucionou nossa operação. Triplicamos nossas vendas em 3 meses!",
    rating: 5,
  },
  {
    name: "Ana Beatriz",
    role: "Gerente Comercial, Vendas Pro",
    content: "A integração com WhatsApp é perfeita. Nosso time nunca foi tão produtivo.",
    rating: 5,
  },
  {
    name: "Roberto Mendes",
    role: "Fundador, Digital Agency",
    content: "O chatbot com IA atende 80% das demandas automaticamente. Incrível!",
    rating: 5,
  },
];

const LandingPage = () => {
  const { user } = useAuth();
  const heroParallax = useParallax(0.3);
  const featuresSection = useInView(0.1);
  const benefitsSection = useInView(0.1);
  const testimonialsSection = useInView(0.1);
  const ctaSection = useInView(0.1);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <img 
                src={optimusLogo} 
                alt="Optimus CRM" 
                className="h-10 w-auto object-contain"
              />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Recursos
              </a>
              <a href="#benefits" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Benefícios
              </a>
              <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Depoimentos
              </a>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <Link to="/dashboard">
                  <Button size="sm" className="bg-primary hover:bg-primary/90">
                    Ir para Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/auth">
                    <Button variant="ghost" size="sm">
                      Entrar
                    </Button>
                  </Link>
                  <Link to="/auth">
                    <Button size="sm" className="bg-primary hover:bg-primary/90">
                      Começar Grátis
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section with Parallax */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div 
            ref={heroParallax.ref}
            className="absolute inset-0"
            style={{ transform: `translateY(${heroParallax.offset}px)` }}
          >
            {/* Gradient Orbs */}
            <div 
              className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/20 blur-[120px] animate-pulse"
              style={{ 
                transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
                transition: "transform 0.3s ease-out"
              }}
            />
            <div 
              className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-purple-500/15 blur-[100px] animate-pulse"
              style={{ 
                animationDelay: "1s",
                transform: `translate(${-mousePosition.x}px, ${-mousePosition.y}px)`,
                transition: "transform 0.3s ease-out"
              }}
            />
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-cyan-500/10 blur-[150px]"
            />
          </div>

          {/* Grid Pattern */}
          <div 
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: "50px 50px",
              transform: `translateY(${heroParallax.offset * 0.5}px)`,
            }}
          />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="animate-fade-in">
            <Badge className="mb-6 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
              <Sparkles className="w-3 h-3 mr-1" />
              Nova era do CRM com IA
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              <span className="text-foreground">O CRM que</span>
              <br />
              <span className="bg-gradient-to-r from-primary via-purple-500 to-cyan-500 bg-clip-text text-transparent">
                conversa, acompanha
              </span>
              <br />
              <span className="text-foreground">e vende</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Com integração ao WhatsApp, gestão inteligente de contatos e acompanhamento completo do funil, 
              <span className="text-foreground font-medium"> nenhuma oportunidade se perde</span> do primeiro contato ao fechamento.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link to={user ? "/dashboard" : "/auth"}>
                <Button size="lg" className="text-lg px-8 py-6 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25">
                  <Rocket className="w-5 h-5 mr-2" />
                  {user ? "Acessar Dashboard" : "Começar Agora — É Grátis"}
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-border/50 hover:bg-muted/50">
                <Play className="w-5 h-5 mr-2" />
                Ver Demonstração
              </Button>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-foreground">10k+</div>
                <div className="text-sm text-muted-foreground">Empresas ativas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-foreground">1M+</div>
                <div className="text-sm text-muted-foreground">Mensagens/dia</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-foreground">99.9%</div>
                <div className="text-sm text-muted-foreground">Uptime garantido</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <button 
          onClick={scrollToFeatures}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted-foreground hover:text-foreground transition-colors animate-bounce"
        >
          <ChevronDown className="w-8 h-8" />
        </button>
      </section>

      {/* Features Section with Parallax */}
      <section 
        id="features" 
        ref={featuresSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        {/* Background Parallax Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-purple-500/5 blur-[80px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-16 transition-all duration-700",
            featuresSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
              Recursos Poderosos
            </Badge>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Tudo que você precisa em{" "}
              <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                uma única plataforma
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Ferramentas integradas para automatizar, escalar e potencializar suas vendas via WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={feature.title}
                className={cn(
                  "group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all duration-500 hover:shadow-xl hover:shadow-primary/5",
                  featuresSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                )}
                style={{ 
                  transitionDelay: featuresSection.isInView ? `${index * 100}ms` : "0ms" 
                }}
              >
                <CardContent className="p-6">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300",
                    feature.color
                  )}>
                    <feature.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
                {/* Hover Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section with Parallax */}
      <section 
        id="benefits"
        ref={benefitsSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        {/* Parallax Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-primary/5" />
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-16 transition-all duration-700",
            benefitsSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
              Por que escolher o OptimusCRM?
            </Badge>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Resultados que{" "}
              <span className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
                transformam negócios
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <div 
                key={benefit.title}
                className={cn(
                  "text-center group transition-all duration-500",
                  benefitsSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                )}
                style={{ 
                  transitionDelay: benefitsSection.isInView ? `${index * 150}ms` : "0ms" 
                }}
              >
                <div className="relative mb-6">
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <benefit.icon className="w-10 h-10 text-primary" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {benefit.stat}
                  </div>
                </div>
                <div className="text-4xl font-bold text-primary mb-2">{benefit.stat}</div>
                <div className="text-sm text-muted-foreground mb-4">{benefit.statLabel}</div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">{benefit.title}</h3>
                <p className="text-muted-foreground">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section 
        id="testimonials"
        ref={testimonialsSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={cn(
            "text-center mb-16 transition-all duration-700",
            testimonialsSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          )}>
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
              Depoimentos
            </Badge>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              O que nossos clientes{" "}
              <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                dizem sobre nós
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card 
                key={testimonial.name}
                className={cn(
                  "border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-500",
                  testimonialsSection.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                )}
                style={{ 
                  transitionDelay: testimonialsSection.isInView ? `${index * 100}ms` : "0ms" 
                }}
              >
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                    ))}
                  </div>
                  <p className="text-foreground mb-6 italic">"{testimonial.content}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{testimonial.name}</div>
                      <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section with Parallax */}
      <section 
        ref={ctaSection.ref}
        className="relative py-24 sm:py-32 overflow-hidden"
      >
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/10 to-cyan-500/20" />
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `
                linear-gradient(45deg, transparent 40%, hsl(var(--primary) / 0.1) 40%, hsl(var(--primary) / 0.1) 60%, transparent 60%),
                linear-gradient(-45deg, transparent 40%, hsl(var(--primary) / 0.1) 40%, hsl(var(--primary) / 0.1) 60%, transparent 60%)
              `,
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className={cn(
          "relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center transition-all duration-700",
          ctaSection.isInView ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}>
          <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-3xl p-8 sm:p-12 shadow-2xl">
            <Zap className="w-16 h-16 mx-auto mb-6 text-primary" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Pronto para{" "}
              <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                transformar suas vendas?
              </span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Junte-se a milhares de empresas que já estão vendendo mais com o OptimusCRM. 
              Comece gratuitamente e escale conforme cresce.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Link to={user ? "/dashboard" : "/auth"}>
                <Button size="lg" className="text-lg px-8 py-6 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25">
                  {user ? "Acessar Dashboard" : "Começar Gratuitamente"}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Sem cartão de crédito
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Setup em 5 minutos
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Suporte 24/7
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center">
              <img 
                src={optimusLogo} 
                alt="Optimus CRM" 
                className="h-20 w-auto object-contain"
              />
            </div>
            
            <div className="flex items-center gap-8 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacidade</a>
              <a href="#" className="hover:text-foreground transition-colors">Contato</a>
            </div>
            
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} OptimusCRM. Todos os direitos reservados.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
