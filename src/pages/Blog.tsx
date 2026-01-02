import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  MessageSquare, 
  Calendar,
  Clock,
  ArrowRight,
  User,
  Tag
} from "lucide-react";

const blogPosts = [
  {
    slug: "como-usar-whatsapp-business-api",
    title: "Como Usar WhatsApp Business API: Guia Completo 2026",
    excerpt: "Aprenda passo a passo como configurar e usar a API oficial do WhatsApp Business para sua empresa. Tudo sobre integração, templates e boas práticas.",
    category: "WhatsApp Business",
    author: "Equipe Optimus",
    date: "2026-01-02",
    readTime: "12 min",
    image: "/placeholder.svg"
  },
  {
    slug: "melhor-crm-para-whatsapp",
    title: "Melhor CRM para WhatsApp em 2026: Comparativo Completo",
    excerpt: "Descubra qual é o melhor CRM para integrar com WhatsApp. Comparamos funcionalidades, preços e recursos de automação das principais plataformas.",
    category: "CRM",
    author: "Equipe Optimus",
    date: "2026-01-01",
    readTime: "15 min",
    image: "/placeholder.svg"
  },
  {
    slug: "chatbot-whatsapp-inteligencia-artificial",
    title: "Chatbot para WhatsApp com IA: Como Automatizar Atendimento",
    excerpt: "Saiba como implementar um chatbot com inteligência artificial no WhatsApp e automatizar até 80% dos atendimentos da sua empresa.",
    category: "Automação",
    author: "Equipe Optimus",
    date: "2025-12-28",
    readTime: "10 min",
    image: "/placeholder.svg"
  },
  {
    slug: "disparos-em-massa-whatsapp-sem-banimento",
    title: "Disparos em Massa no WhatsApp Sem Risco de Banimento",
    excerpt: "Aprenda a fazer disparos em massa no WhatsApp de forma segura e legal, usando a API oficial e evitando bloqueios do seu número.",
    category: "Marketing",
    author: "Equipe Optimus",
    date: "2025-12-25",
    readTime: "8 min",
    image: "/placeholder.svg"
  },
  {
    slug: "atendimento-multiplos-atendentes-whatsapp",
    title: "Como Ter Múltiplos Atendentes no Mesmo WhatsApp",
    excerpt: "Descubra como sua equipe pode atender no mesmo número de WhatsApp simultaneamente, com distribuição inteligente de conversas.",
    category: "Atendimento",
    author: "Equipe Optimus",
    date: "2025-12-20",
    readTime: "7 min",
    image: "/placeholder.svg"
  },
  {
    slug: "whatsapp-business-vs-whatsapp-api",
    title: "WhatsApp Business vs WhatsApp API: Qual Escolher?",
    excerpt: "Entenda as diferenças entre WhatsApp Business App e WhatsApp Business API e descubra qual é a melhor opção para o tamanho da sua empresa.",
    category: "WhatsApp Business",
    author: "Equipe Optimus",
    date: "2025-12-15",
    readTime: "9 min",
    image: "/placeholder.svg"
  }
];

const categories = ["Todos", "WhatsApp Business", "CRM", "Automação", "Marketing", "Atendimento"];

const Blog = () => {
  const [selectedCategory, setSelectedCategory] = React.useState("Todos");

  const filteredPosts = selectedCategory === "Todos" 
    ? blogPosts 
    : blogPosts.filter(post => post.category === selectedCategory);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "Blog Optimus CRM",
    "description": "Artigos sobre WhatsApp Business, CRM, automação e atendimento ao cliente",
    "url": "https://optimuscrm.com.br/blog",
    "publisher": {
      "@type": "Organization",
      "name": "Optimus CRM",
      "logo": {
        "@type": "ImageObject",
        "url": "https://optimuscrm.com.br/logo.png"
      }
    },
    "blogPost": blogPosts.map(post => ({
      "@type": "BlogPosting",
      "headline": post.title,
      "description": post.excerpt,
      "datePublished": post.date,
      "author": {
        "@type": "Person",
        "name": post.author
      },
      "url": `https://optimuscrm.com.br/blog/${post.slug}`
    }))
  };

  return (
    <>
      <Helmet>
        <title>Blog | Artigos sobre WhatsApp Business, CRM e Automação | Optimus CRM</title>
        <meta name="description" content="Aprenda sobre WhatsApp Business API, CRM, chatbots com IA, automação de atendimento e marketing digital. Artigos e guias completos para sua empresa." />
        <meta name="keywords" content="blog whatsapp business, artigos crm, guia whatsapp api, tutorial automação whatsapp, dicas atendimento cliente" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://optimuscrm.com.br/blog" />
        
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Blog Optimus CRM | WhatsApp Business e Automação" />
        <meta property="og:description" content="Artigos e guias sobre WhatsApp Business API, CRM e automação de atendimento." />
        <meta property="og:url" content="https://optimuscrm.com.br/blog" />
        
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <nav className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">Optimus CRM</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/whatsapp-oficial" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">
                WhatsApp Oficial
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
          {/* Breadcrumb Navigation */}
          <nav className="container mx-auto px-4 sm:px-6 lg:px-8 py-3" aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm text-muted-foreground">
              <li>
                <Link to="/" className="hover:text-foreground transition-colors">
                  Início
                </Link>
              </li>
              <li className="flex items-center gap-2">
                <span>/</span>
                <span className="text-foreground font-medium">Blog</span>
              </li>
            </ol>
          </nav>
          {/* Hero */}
          <section className="py-12 sm:py-16 bg-gradient-to-b from-primary/5 to-background">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
                Blog <span className="text-primary">Optimus CRM</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Artigos, guias e tutoriais sobre WhatsApp Business, CRM, automação e atendimento ao cliente.
              </p>
            </div>
          </section>

          {/* Categories */}
          <section className="py-6 border-b border-border/40">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap gap-2 justify-center">
                {categories.map((category) => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                    className="rounded-full"
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          {/* Blog Posts */}
          <section className="py-12 sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                {filteredPosts.map((post) => (
                  <article key={post.slug}>
                    <Link to={`/blog/${post.slug}`}>
                      <Card className="h-full hover:border-primary/50 transition-colors overflow-hidden group">
                        <div className="aspect-video bg-muted relative overflow-hidden">
                          <img 
                            src={post.image} 
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-3 left-3">
                            <span className="bg-primary text-primary-foreground text-xs font-medium px-2 py-1 rounded">
                              {post.category}
                            </span>
                          </div>
                        </div>
                        <CardContent className="p-5">
                          <h2 className="text-lg font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                            {post.title}
                          </h2>
                          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                            {post.excerpt}
                          </p>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(post.date).toLocaleDateString('pt-BR')}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {post.readTime}
                              </span>
                            </div>
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-12 sm:py-16 bg-muted/30">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                Pronto para transformar seu atendimento?
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Experimente o Optimus CRM gratuitamente e veja na prática como automatizar seu WhatsApp Business.
              </p>
              <Link to="/cadastro">
                <Button size="lg" className="bg-primary hover:bg-primary/90">
                  Começar Grátis
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-8 border-t border-border/40">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Optimus CRM. Todos os direitos reservados.
              </p>
              <nav className="flex gap-6">
                <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Home</Link>
                <Link to="/whatsapp-oficial" className="text-sm text-muted-foreground hover:text-foreground">WhatsApp Oficial</Link>
                <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">Blog</Link>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Blog;
