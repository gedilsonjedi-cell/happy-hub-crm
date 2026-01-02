import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  MessageSquare, 
  Shield, 
  Zap, 
  Users, 
  BarChart3, 
  Bot,
  CheckCircle2,
  ArrowRight,
  Star,
  Building2,
  Globe,
  Lock
} from "lucide-react";

const WhatsAppOficial = () => {
  const features = [
    {
      icon: Shield,
      title: "API Oficial do WhatsApp",
      description: "Conecte-se diretamente à API oficial do WhatsApp Business, garantindo segurança e conformidade total com as políticas da Meta."
    },
    {
      icon: Users,
      title: "Múltiplos Atendentes",
      description: "Tenha toda sua equipe atendendo no mesmo número de WhatsApp, com distribuição inteligente de conversas."
    },
    {
      icon: Bot,
      title: "Chatbot com IA",
      description: "Automatize atendimentos com inteligência artificial que entende e responde seus clientes 24 horas por dia."
    },
    {
      icon: Zap,
      title: "Disparos em Massa",
      description: "Envie mensagens para milhares de contatos de forma segura, sem risco de banimento do seu número."
    },
    {
      icon: BarChart3,
      title: "Relatórios Completos",
      description: "Acompanhe métricas de atendimento, taxa de resposta, tempo médio e performance da sua equipe."
    },
    {
      icon: MessageSquare,
      title: "Templates Aprovados",
      description: "Crie e gerencie templates de mensagens aprovados pela Meta para campanhas de marketing e notificações."
    }
  ];

  const benefits = [
    "Selo de verificação oficial do WhatsApp Business",
    "Sem risco de banimento do número",
    "Suporte técnico especializado",
    "Integração com CRM completo",
    "Relatórios e analytics avançados",
    "Automação inteligente com IA",
    "Múltiplos atendentes simultâneos",
    "Backup de todas as conversas"
  ];

  const comparisons = [
    {
      feature: "Número de atendentes",
      whatsappNormal: "1 dispositivo",
      whatsappOficial: "Ilimitados"
    },
    {
      feature: "Risco de banimento",
      whatsappNormal: "Alto",
      whatsappOficial: "Zero"
    },
    {
      feature: "Automação",
      whatsappNormal: "Limitada",
      whatsappOficial: "Completa com IA"
    },
    {
      feature: "Disparos em massa",
      whatsappNormal: "Proibido",
      whatsappOficial: "Permitido"
    },
    {
      feature: "Selo de verificação",
      whatsappNormal: "Não disponível",
      whatsappOficial: "Disponível"
    },
    {
      feature: "Suporte",
      whatsappNormal: "Básico",
      whatsappOficial: "Prioritário"
    }
  ];

  const faqs = [
    {
      question: "O que é WhatsApp Oficial?",
      answer: "WhatsApp Oficial, também conhecido como WhatsApp Business API, é a versão empresarial do WhatsApp que permite empresas se conectarem diretamente à infraestrutura do WhatsApp, possibilitando atendimento profissional com múltiplos atendentes, automação e integração com sistemas de CRM."
    },
    {
      question: "Qual a diferença entre WhatsApp Business e WhatsApp Oficial?",
      answer: "O WhatsApp Business é o aplicativo gratuito para pequenas empresas, limitado a um dispositivo. Já o WhatsApp Oficial (API) permite múltiplos atendentes, automação avançada, disparos em massa aprovados pela Meta, e integração completa com sistemas empresariais, sem risco de banimento."
    },
    {
      question: "Meu número pode ser banido usando o WhatsApp Oficial?",
      answer: "Não. Ao usar a API Oficial do WhatsApp através de um provedor autorizado como o Optimus, você está em total conformidade com as políticas da Meta. Diferente de soluções não-oficiais, não há risco de banimento do seu número."
    },
    {
      question: "Quanto custa o WhatsApp Oficial?",
      answer: "O custo varia conforme o volume de mensagens e funcionalidades necessárias. O Optimus CRM oferece planos acessíveis que incluem a API Oficial do WhatsApp, CRM completo, automação com IA e suporte técnico. Entre em contato para uma proposta personalizada."
    },
    {
      question: "Como migrar meu número para o WhatsApp Oficial?",
      answer: "A migração é simples e rápida. Nossa equipe cuida de todo o processo de registro junto à Meta, configuração da API e integração com o Optimus CRM. Você mantém seu número atual e histórico de conversas."
    },
    {
      question: "Posso usar chatbot com o WhatsApp Oficial?",
      answer: "Sim! O Optimus CRM inclui chatbot com inteligência artificial que pode atender seus clientes 24/7, qualificar leads, responder dúvidas frequentes e transferir para atendentes humanos quando necessário."
    }
  ];

  // JSON-LD Structured Data
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://optimuscrm.com.br/whatsapp-oficial",
        "url": "https://optimuscrm.com.br/whatsapp-oficial",
        "name": "WhatsApp Oficial para Empresas | API WhatsApp Business | Optimus CRM",
        "description": "Conecte sua empresa ao WhatsApp Oficial com API Business. Múltiplos atendentes, chatbot com IA, disparos em massa sem banimento. Comece agora!",
        "isPartOf": {
          "@id": "https://optimuscrm.com.br/#website"
        }
      },
      {
        "@type": "Product",
        "name": "WhatsApp Oficial - Optimus CRM",
        "description": "Solução completa de WhatsApp Business API integrada ao CRM com automação, chatbot IA e múltiplos atendentes.",
        "brand": {
          "@type": "Brand",
          "name": "Optimus CRM"
        },
        "offers": {
          "@type": "AggregateOffer",
          "priceCurrency": "BRL",
          "lowPrice": "197",
          "highPrice": "997",
          "offerCount": "3"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "847",
          "bestRating": "5",
          "worstRating": "1"
        }
      },
      {
        "@type": "FAQPage",
        "mainEntity": faqs.map(faq => ({
          "@type": "Question",
          "name": faq.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.answer
          }
        }))
      },
      {
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
          }
        ]
      }
    ]
  };

  return (
    <>
      <Helmet>
        <title>WhatsApp Oficial para Empresas | API WhatsApp Business | Optimus CRM</title>
        <meta name="description" content="Conecte sua empresa ao WhatsApp Oficial com API Business. Múltiplos atendentes, chatbot com IA, disparos em massa sem risco de banimento. Comece agora!" />
        <meta name="keywords" content="whatsapp oficial, whatsapp business api, api whatsapp, whatsapp empresarial, whatsapp para empresas, whatsapp profissional, whatsapp multi atendentes, whatsapp crm, automação whatsapp" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <link rel="canonical" href="https://optimuscrm.com.br/whatsapp-oficial" />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="WhatsApp Oficial para Empresas | API WhatsApp Business" />
        <meta property="og:description" content="Conecte sua empresa ao WhatsApp Oficial. Múltiplos atendentes, chatbot IA, disparos em massa sem banimento." />
        <meta property="og:url" content="https://optimuscrm.com.br/whatsapp-oficial" />
        <meta property="og:site_name" content="Optimus CRM" />
        <meta property="og:locale" content="pt_BR" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="WhatsApp Oficial para Empresas | Optimus CRM" />
        <meta name="twitter:description" content="API oficial do WhatsApp Business integrada ao CRM. Múltiplos atendentes, automação e IA." />
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <nav className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between" aria-label="Navegação principal">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">Optimus CRM</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/auth">
                <Button variant="ghost" size="sm">Entrar</Button>
              </Link>
              <Link to="/cadastro">
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  Começar Grátis
                </Button>
              </Link>
            </div>
          </nav>
        </header>

        <main>
          {/* Hero Section */}
          <section className="py-12 sm:py-20 lg:py-28 bg-gradient-to-b from-primary/5 to-background" aria-labelledby="hero-heading">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                <Shield className="w-4 h-4" />
                <span>Provedor Oficial Meta Business Partner</span>
              </div>
              
              <h1 id="hero-heading" className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
                WhatsApp <span className="text-primary">Oficial</span> para sua Empresa
              </h1>
              
              <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                Conecte-se à <strong>API oficial do WhatsApp Business</strong> e transforme seu atendimento. 
                Múltiplos atendentes, automação com IA, disparos em massa — tudo <strong>sem risco de banimento</strong>.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Link to="/cadastro">
                  <Button size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-lg px-8 py-6">
                    Começar Agora Grátis
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link to="/#demo">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg px-8 py-6">
                    Ver Demonstração
                  </Button>
                </Link>
              </div>

              <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Sem cartão de crédito</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Configuração em minutos</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Suporte em português</span>
                </div>
              </div>
            </div>
          </section>

          {/* Trust Badges */}
          <section className="py-8 border-y border-border/40 bg-muted/30" aria-label="Credenciais">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-5 h-5" />
                  <span className="text-sm font-medium">+2.500 empresas ativas</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MessageSquare className="w-5 h-5" />
                  <span className="text-sm font-medium">+10M mensagens/mês</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Star className="w-5 h-5 text-yellow-500" />
                  <span className="text-sm font-medium">4.9/5 avaliação</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="w-5 h-5" />
                  <span className="text-sm font-medium">Presente em todo Brasil</span>
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="py-16 sm:py-24" aria-labelledby="features-heading">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 id="features-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4">
                  Tudo que você precisa no WhatsApp Oficial
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Recursos profissionais para escalar seu atendimento via WhatsApp com segurança e eficiência.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                {features.map((feature, index) => (
                  <Card key={index} className="border-border/50 hover:border-primary/50 transition-colors">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                        <feature.icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                      <p className="text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Comparison Table */}
          <section className="py-16 sm:py-24 bg-muted/30" aria-labelledby="comparison-heading">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 id="comparison-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4">
                  WhatsApp Normal vs WhatsApp Oficial
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Entenda por que empresas sérias escolhem a API Oficial do WhatsApp Business.
                </p>
              </div>

              <div className="max-w-4xl mx-auto overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-4 border-b border-border font-semibold text-foreground">Recurso</th>
                      <th className="text-center p-4 border-b border-border font-semibold text-muted-foreground">WhatsApp Normal</th>
                      <th className="text-center p-4 border-b border-border font-semibold text-primary">WhatsApp Oficial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map((item, index) => (
                      <tr key={index} className="hover:bg-muted/50">
                        <td className="p-4 border-b border-border/50 text-foreground font-medium">{item.feature}</td>
                        <td className="p-4 border-b border-border/50 text-center text-muted-foreground">{item.whatsappNormal}</td>
                        <td className="p-4 border-b border-border/50 text-center text-primary font-medium">{item.whatsappOficial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Benefits Section */}
          <section className="py-16 sm:py-24" aria-labelledby="benefits-heading">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 id="benefits-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-6">
                    Por que escolher o WhatsApp Oficial com Optimus CRM?
                  </h2>
                  <p className="text-lg text-muted-foreground mb-8">
                    Somos parceiros oficiais da Meta e oferecemos a solução mais completa do mercado para 
                    empresas que querem profissionalizar seu atendimento no WhatsApp.
                  </p>
                  <ul className="space-y-4">
                    {benefits.map((benefit, index) => (
                      <li key={index} className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span className="text-foreground">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 lg:p-12">
                  <div className="text-center">
                    <Lock className="w-16 h-16 text-primary mx-auto mb-6" />
                    <h3 className="text-2xl font-bold text-foreground mb-4">100% Seguro e Oficial</h3>
                    <p className="text-muted-foreground mb-6">
                      Sua empresa conectada diretamente à infraestrutura do WhatsApp, 
                      com total conformidade às políticas da Meta.
                    </p>
                    <Link to="/cadastro">
                      <Button size="lg" className="bg-primary hover:bg-primary/90">
                        Começar Agora
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section className="py-16 sm:py-24 bg-muted/30" aria-labelledby="faq-heading">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 id="faq-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4">
                  Perguntas Frequentes sobre WhatsApp Oficial
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Tire suas dúvidas sobre a API Oficial do WhatsApp Business.
                </p>
              </div>

              <div className="max-w-3xl mx-auto space-y-6">
                {faqs.map((faq, index) => (
                  <article key={index} className="bg-background rounded-lg border border-border/50 p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">{faq.question}</h3>
                    <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-16 sm:py-24 bg-primary" aria-labelledby="cta-heading">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2 id="cta-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-foreground mb-6">
                Pronto para ter o WhatsApp Oficial?
              </h2>
              <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto mb-8">
                Comece hoje mesmo e transforme o atendimento da sua empresa com a API Oficial do WhatsApp Business.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/cadastro">
                  <Button size="lg" variant="secondary" className="w-full sm:w-auto text-lg px-8 py-6">
                    Criar Conta Grátis
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link to="/">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg px-8 py-6 bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                    Conhecer o Optimus CRM
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-8 border-t border-border/40 bg-background">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Optimus CRM. Todos os direitos reservados.
              </p>
              <nav className="flex gap-6" aria-label="Links do rodapé">
                <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Home
                </Link>
                <Link to="/whatsapp-oficial" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  WhatsApp Oficial
                </Link>
                <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Entrar
                </Link>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default WhatsAppOficial;
