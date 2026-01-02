import React from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  Calendar,
  Clock,
  ArrowLeft,
  ArrowRight,
  User,
  Share2,
  CheckCircle2
} from "lucide-react";

// Blog posts data with full content
const blogPostsData: Record<string, {
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  content: React.ReactNode;
  keywords: string;
}> = {
  "como-usar-whatsapp-business-api": {
    title: "Como Usar WhatsApp Business API: Guia Completo 2026",
    excerpt: "Aprenda passo a passo como configurar e usar a API oficial do WhatsApp Business para sua empresa. Tudo sobre integração, templates e boas práticas.",
    category: "WhatsApp Business",
    author: "Equipe Optimus",
    date: "2026-01-02",
    readTime: "12 min",
    keywords: "whatsapp business api, api whatsapp, como usar whatsapp api, configurar whatsapp business, integração whatsapp",
    content: (
      <>
        <p className="lead">
          A <strong>WhatsApp Business API</strong> é a solução oficial da Meta para empresas que precisam escalar seu atendimento via WhatsApp. 
          Neste guia completo, você vai aprender tudo sobre como configurar, integrar e usar a API oficial.
        </p>

        <h2>O que é WhatsApp Business API?</h2>
        <p>
          A WhatsApp Business API (também conhecida como WhatsApp Cloud API) é uma interface de programação que permite 
          empresas conectarem seus sistemas diretamente à infraestrutura do WhatsApp. Diferente do aplicativo WhatsApp Business, 
          a API oferece recursos avançados como:
        </p>
        <ul>
          <li>Múltiplos atendentes no mesmo número</li>
          <li>Integração com CRM e sistemas empresariais</li>
          <li>Automação completa com chatbots</li>
          <li>Envio de mensagens em escala</li>
          <li>Relatórios e analytics detalhados</li>
        </ul>

        <h2>Requisitos para usar a WhatsApp Business API</h2>
        <p>Para começar a usar a API oficial, sua empresa precisa:</p>
        <ul>
          <li>Ter um CNPJ ativo</li>
          <li>Possuir um número de telefone dedicado</li>
          <li>Criar uma conta no Meta Business Suite</li>
          <li>Verificar seu negócio junto à Meta</li>
          <li>Escolher um provedor oficial (BSP) como o Optimus CRM</li>
        </ul>

        <h2>Passo a passo para configurar</h2>
        <h3>1. Crie sua conta no Meta Business Suite</h3>
        <p>
          Acesse business.facebook.com e crie uma conta comercial. Você precisará vincular uma página do Facebook 
          e fornecer informações sobre sua empresa.
        </p>

        <h3>2. Verifique seu negócio</h3>
        <p>
          A verificação empresarial é obrigatória para usar a API. Você precisará enviar documentos como 
          contrato social, CNPJ e comprovantes da empresa.
        </p>

        <h3>3. Escolha um provedor oficial</h3>
        <p>
          Provedores como o <strong>Optimus CRM</strong> facilitam todo o processo de integração, 
          oferecendo uma plataforma completa com CRM, automação e suporte técnico.
        </p>

        <h3>4. Configure templates de mensagem</h3>
        <p>
          Para enviar mensagens proativas (fora da janela de 24h), você precisa criar templates 
          aprovados pela Meta. Os templates devem seguir as políticas de conteúdo.
        </p>

        <h2>Boas práticas de uso</h2>
        <ul>
          <li><strong>Respeite o opt-in:</strong> Só envie mensagens para quem autorizou</li>
          <li><strong>Responda rápido:</strong> Aproveite a janela de 24h para conversas gratuitas</li>
          <li><strong>Use templates relevantes:</strong> Crie mensagens úteis e personalizadas</li>
          <li><strong>Monitore métricas:</strong> Acompanhe taxas de entrega e resposta</li>
          <li><strong>Treine sua equipe:</strong> Garanta atendimento de qualidade</li>
        </ul>

        <h2>Custos da WhatsApp Business API</h2>
        <p>
          O modelo de preços da API é baseado em conversas. Existem diferentes categorias:
        </p>
        <ul>
          <li><strong>Marketing:</strong> Mensagens promocionais e ofertas</li>
          <li><strong>Utility:</strong> Notificações transacionais</li>
          <li><strong>Service:</strong> Respostas a mensagens recebidas (mais barato)</li>
        </ul>

        <h2>Conclusão</h2>
        <p>
          A WhatsApp Business API é essencial para empresas que querem profissionalizar e escalar seu atendimento. 
          Com o <strong>Optimus CRM</strong>, você tem acesso à API oficial com uma plataforma completa de CRM, 
          automação e chatbot com IA — tudo em um só lugar.
        </p>
      </>
    )
  },
  "melhor-crm-para-whatsapp": {
    title: "Melhor CRM para WhatsApp em 2026: Comparativo Completo",
    excerpt: "Descubra qual é o melhor CRM para integrar com WhatsApp. Comparamos funcionalidades, preços e recursos de automação das principais plataformas.",
    category: "CRM",
    author: "Equipe Optimus",
    date: "2026-01-01",
    readTime: "15 min",
    keywords: "crm whatsapp, melhor crm, crm para whatsapp, comparativo crm, crm vendas whatsapp",
    content: (
      <>
        <p className="lead">
          Escolher o <strong>melhor CRM para WhatsApp</strong> pode ser decisivo para o sucesso das suas vendas e atendimento. 
          Neste comparativo, analisamos as principais plataformas do mercado brasileiro.
        </p>

        <h2>Por que integrar CRM com WhatsApp?</h2>
        <p>
          O WhatsApp é o canal de comunicação preferido dos brasileiros. Integrar com um CRM permite:
        </p>
        <ul>
          <li>Centralizar todas as conversas em um só lugar</li>
          <li>Ter histórico completo de cada cliente</li>
          <li>Automatizar follow-ups e lembretes</li>
          <li>Gerar relatórios de performance</li>
          <li>Escalar o atendimento sem perder qualidade</li>
        </ul>

        <h2>O que avaliar em um CRM para WhatsApp</h2>
        <h3>1. Integração oficial vs não-oficial</h3>
        <p>
          CRMs que usam a <strong>API oficial do WhatsApp</strong> garantem segurança e não correm risco de banimento. 
          Soluções não-oficiais podem parecer mais baratas, mas colocam seu número em risco.
        </p>

        <h3>2. Múltiplos atendentes</h3>
        <p>
          Verifique se o CRM permite que toda sua equipe atenda no mesmo número, com distribuição inteligente de conversas.
        </p>

        <h3>3. Automação e chatbot</h3>
        <p>
          Recursos de automação como chatbot com IA, respostas rápidas e fluxos automatizados 
          aumentam a produtividade da equipe.
        </p>

        <h3>4. Pipeline de vendas</h3>
        <p>
          Um bom CRM deve ter pipeline visual para acompanhar leads em cada etapa do funil de vendas.
        </p>

        <h2>Optimus CRM: A solução completa</h2>
        <p>
          O <strong>Optimus CRM</strong> se destaca por oferecer:
        </p>
        <ul>
          <li>API oficial do WhatsApp (sem risco de banimento)</li>
          <li>Múltiplos atendentes ilimitados</li>
          <li>Chatbot com inteligência artificial</li>
          <li>Pipeline visual de vendas</li>
          <li>Disparos em massa aprovados</li>
          <li>Relatórios completos</li>
          <li>Suporte em português</li>
        </ul>

        <h2>Conclusão</h2>
        <p>
          O melhor CRM para WhatsApp é aquele que combina integração oficial, automação inteligente 
          e facilidade de uso. O Optimus CRM oferece tudo isso com um dos melhores custos-benefício do mercado.
        </p>
      </>
    )
  },
  "chatbot-whatsapp-inteligencia-artificial": {
    title: "Chatbot para WhatsApp com IA: Como Automatizar Atendimento",
    excerpt: "Saiba como implementar um chatbot com inteligência artificial no WhatsApp e automatizar até 80% dos atendimentos da sua empresa.",
    category: "Automação",
    author: "Equipe Optimus",
    date: "2025-12-28",
    readTime: "10 min",
    keywords: "chatbot whatsapp, chatbot ia, inteligencia artificial whatsapp, automatizar atendimento, bot whatsapp",
    content: (
      <>
        <p className="lead">
          Um <strong>chatbot com inteligência artificial</strong> pode revolucionar o atendimento da sua empresa, 
          respondendo clientes 24/7 e liberando sua equipe para tarefas mais estratégicas.
        </p>

        <h2>O que é um chatbot com IA?</h2>
        <p>
          Diferente de chatbots tradicionais que seguem fluxos rígidos, chatbots com IA usam 
          processamento de linguagem natural para entender o contexto das mensagens e responder 
          de forma mais humana e precisa.
        </p>

        <h2>Benefícios do chatbot com IA</h2>
        <ul>
          <li><strong>Atendimento 24/7:</strong> Seus clientes são atendidos a qualquer hora</li>
          <li><strong>Redução de custos:</strong> Automatize até 80% das interações</li>
          <li><strong>Escalabilidade:</strong> Atenda milhares de conversas simultaneamente</li>
          <li><strong>Consistência:</strong> Respostas padronizadas e de qualidade</li>
          <li><strong>Qualificação de leads:</strong> Filtre e qualifique contatos automaticamente</li>
        </ul>

        <h2>Como funciona no Optimus CRM</h2>
        <p>
          O chatbot do Optimus CRM usa inteligência artificial avançada para:
        </p>
        <ul>
          <li>Entender perguntas em linguagem natural</li>
          <li>Responder dúvidas frequentes automaticamente</li>
          <li>Qualificar leads com perguntas estratégicas</li>
          <li>Transferir para atendentes humanos quando necessário</li>
          <li>Aprender com as interações e melhorar continuamente</li>
        </ul>

        <h2>Casos de uso</h2>
        <h3>Atendimento ao cliente</h3>
        <p>Responda dúvidas sobre produtos, horários, preços e políticas automaticamente.</p>

        <h3>Vendas</h3>
        <p>Qualifique leads, agende demonstrações e envie propostas de forma automatizada.</p>

        <h3>Suporte técnico</h3>
        <p>Resolva problemas comuns e escale casos complexos para a equipe.</p>

        <h2>Conclusão</h2>
        <p>
          Implementar um chatbot com IA no WhatsApp não é mais um diferencial — é uma necessidade 
          para empresas que querem escalar sem perder qualidade no atendimento.
        </p>
      </>
    )
  },
  "disparos-em-massa-whatsapp-sem-banimento": {
    title: "Disparos em Massa no WhatsApp Sem Risco de Banimento",
    excerpt: "Aprenda a fazer disparos em massa no WhatsApp de forma segura e legal, usando a API oficial e evitando bloqueios do seu número.",
    category: "Marketing",
    author: "Equipe Optimus",
    date: "2025-12-25",
    readTime: "8 min",
    keywords: "disparos whatsapp, whatsapp em massa, envio massivo whatsapp, marketing whatsapp, campanhas whatsapp",
    content: (
      <>
        <p className="lead">
          Fazer <strong>disparos em massa no WhatsApp</strong> de forma segura é possível — desde que você use a API oficial. 
          Neste artigo, explicamos como enviar mensagens em escala sem risco de banimento.
        </p>

        <h2>Por que números são banidos?</h2>
        <p>
          O WhatsApp bane números que violam seus termos de uso, especialmente quando detecta:
        </p>
        <ul>
          <li>Uso de aplicativos não-oficiais (WhatsApp GB, etc)</li>
          <li>Envio de mensagens para contatos que não autorizaram</li>
          <li>Alto volume de denúncias de spam</li>
          <li>Automação via APIs não-oficiais</li>
        </ul>

        <h2>A solução: API Oficial do WhatsApp</h2>
        <p>
          A <strong>WhatsApp Business API</strong> permite enviar mensagens em massa de forma legal e segura. 
          Como você está usando a infraestrutura oficial, não há risco de banimento.
        </p>

        <h2>Como fazer disparos seguros</h2>
        <h3>1. Use templates aprovados</h3>
        <p>
          Todas as mensagens proativas precisam usar templates previamente aprovados pela Meta. 
          Isso garante que o conteúdo segue as políticas.
        </p>

        <h3>2. Respeite o opt-in</h3>
        <p>
          Só envie mensagens para contatos que autorizaram receber comunicações da sua empresa.
        </p>

        <h3>3. Segmente sua base</h3>
        <p>
          Envie mensagens relevantes para cada segmento. Isso reduz denúncias e aumenta engajamento.
        </p>

        <h3>4. Monitore métricas</h3>
        <p>
          Acompanhe taxas de entrega, leitura e resposta. Ajuste suas campanhas com base nos dados.
        </p>

        <h2>Disparos com Optimus CRM</h2>
        <p>
          O Optimus CRM oferece recursos completos para campanhas de WhatsApp:
        </p>
        <ul>
          <li>Criação e gestão de templates</li>
          <li>Segmentação avançada de contatos</li>
          <li>Agendamento de campanhas</li>
          <li>Relatórios de performance</li>
          <li>Integração com chatbot para respostas</li>
        </ul>

        <h2>Conclusão</h2>
        <p>
          Disparos em massa no WhatsApp são possíveis e seguros quando feitos através da API oficial. 
          Com o Optimus CRM, você tem todas as ferramentas para criar campanhas eficientes sem riscos.
        </p>
      </>
    )
  },
  "atendimento-multiplos-atendentes-whatsapp": {
    title: "Como Ter Múltiplos Atendentes no Mesmo WhatsApp",
    excerpt: "Descubra como sua equipe pode atender no mesmo número de WhatsApp simultaneamente, com distribuição inteligente de conversas.",
    category: "Atendimento",
    author: "Equipe Optimus",
    date: "2025-12-20",
    readTime: "7 min",
    keywords: "multiplos atendentes whatsapp, whatsapp equipe, atendimento whatsapp, whatsapp varios atendentes",
    content: (
      <>
        <p className="lead">
          Ter <strong>múltiplos atendentes no mesmo WhatsApp</strong> é essencial para empresas que precisam 
          escalar o atendimento sem perder a organização.
        </p>

        <h2>O problema do WhatsApp tradicional</h2>
        <p>
          O aplicativo WhatsApp Business limita o uso a um dispositivo (ou poucos via WhatsApp Web). 
          Isso cria problemas como:
        </p>
        <ul>
          <li>Atendentes disputando o mesmo celular</li>
          <li>Conversas perdidas ou duplicadas</li>
          <li>Falta de controle sobre quem atendeu</li>
          <li>Impossibilidade de medir performance</li>
        </ul>

        <h2>A solução com API oficial</h2>
        <p>
          A WhatsApp Business API permite que múltiplos atendentes acessem o mesmo número simultaneamente, 
          cada um em seu próprio dispositivo.
        </p>

        <h2>Recursos de distribuição de conversas</h2>
        <h3>Distribuição automática</h3>
        <p>
          Novas conversas são distribuídas automaticamente entre atendentes disponíveis, 
          balanceando a carga de trabalho.
        </p>

        <h3>Transferência entre atendentes</h3>
        <p>
          Atendentes podem transferir conversas entre si quando necessário, 
          mantendo todo o histórico.
        </p>

        <h3>Departamentos</h3>
        <p>
          Organize sua equipe em departamentos (vendas, suporte, financeiro) e 
          direcione conversas automaticamente.
        </p>

        <h2>Como funciona no Optimus CRM</h2>
        <ul>
          <li>Cada atendente tem seu próprio login</li>
          <li>Conversas são distribuídas automaticamente</li>
          <li>Histórico completo de todas as interações</li>
          <li>Relatórios por atendente e departamento</li>
          <li>Controle de disponibilidade online/offline</li>
        </ul>

        <h2>Conclusão</h2>
        <p>
          Com a API oficial e o Optimus CRM, sua equipe pode atender no mesmo número de WhatsApp 
          de forma organizada, eficiente e mensurável.
        </p>
      </>
    )
  },
  "whatsapp-business-vs-whatsapp-api": {
    title: "WhatsApp Business vs WhatsApp API: Qual Escolher?",
    excerpt: "Entenda as diferenças entre WhatsApp Business App e WhatsApp Business API e descubra qual é a melhor opção para o tamanho da sua empresa.",
    category: "WhatsApp Business",
    author: "Equipe Optimus",
    date: "2025-12-15",
    readTime: "9 min",
    keywords: "whatsapp business vs api, diferença whatsapp business, whatsapp business api, qual whatsapp usar",
    content: (
      <>
        <p className="lead">
          <strong>WhatsApp Business App</strong> e <strong>WhatsApp Business API</strong> são soluções diferentes 
          para necessidades diferentes. Entenda qual é a melhor para sua empresa.
        </p>

        <h2>WhatsApp Business App</h2>
        <p>O aplicativo gratuito do WhatsApp para pequenas empresas oferece:</p>
        <ul>
          <li>Perfil comercial com informações da empresa</li>
          <li>Respostas rápidas e mensagens automáticas básicas</li>
          <li>Etiquetas para organizar conversas</li>
          <li>Catálogo de produtos</li>
          <li>Uso em até 4 dispositivos</li>
        </ul>
        <p><strong>Ideal para:</strong> Microempresas e profissionais autônomos com baixo volume de mensagens.</p>

        <h2>WhatsApp Business API</h2>
        <p>A API oficial para empresas que precisam escalar oferece:</p>
        <ul>
          <li>Atendentes ilimitados no mesmo número</li>
          <li>Integração com CRM e sistemas empresariais</li>
          <li>Automação avançada com chatbots</li>
          <li>Envio de mensagens em massa</li>
          <li>Relatórios e analytics completos</li>
          <li>Selo de verificação oficial</li>
        </ul>
        <p><strong>Ideal para:</strong> Empresas com equipe de atendimento, alto volume de mensagens ou necessidade de automação.</p>

        <h2>Comparativo direto</h2>
        <table className="w-full border-collapse my-6">
          <thead>
            <tr>
              <th className="text-left p-3 border-b">Recurso</th>
              <th className="text-center p-3 border-b">Business App</th>
              <th className="text-center p-3 border-b">Business API</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="p-3 border-b">Custo</td><td className="text-center p-3 border-b">Grátis</td><td className="text-center p-3 border-b">Por mensagem</td></tr>
            <tr><td className="p-3 border-b">Atendentes</td><td className="text-center p-3 border-b">1-4</td><td className="text-center p-3 border-b">Ilimitados</td></tr>
            <tr><td className="p-3 border-b">Automação</td><td className="text-center p-3 border-b">Básica</td><td className="text-center p-3 border-b">Avançada</td></tr>
            <tr><td className="p-3 border-b">Integrações</td><td className="text-center p-3 border-b">Não</td><td className="text-center p-3 border-b">Sim</td></tr>
            <tr><td className="p-3 border-b">Disparos em massa</td><td className="text-center p-3 border-b">Não</td><td className="text-center p-3 border-b">Sim</td></tr>
          </tbody>
        </table>

        <h2>Quando migrar para a API?</h2>
        <p>Considere migrar para a API quando:</p>
        <ul>
          <li>Sua equipe tem mais de 2 pessoas atendendo</li>
          <li>Você precisa de automação avançada</li>
          <li>O volume de mensagens está crescendo</li>
          <li>Você quer integrar com CRM</li>
          <li>Precisa de relatórios detalhados</li>
        </ul>

        <h2>Conclusão</h2>
        <p>
          O WhatsApp Business App é suficiente para quem está começando. Mas se sua empresa está crescendo 
          e precisa profissionalizar o atendimento, a API é o caminho certo.
        </p>
      </>
    )
  }
};

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? blogPostsData[slug] : null;

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt,
    "datePublished": post.date,
    "dateModified": post.date,
    "author": {
      "@type": "Person",
      "name": post.author
    },
    "publisher": {
      "@type": "Organization",
      "name": "Optimus CRM",
      "logo": {
        "@type": "ImageObject",
        "url": "https://optimuscrm.com.br/logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://optimuscrm.com.br/blog/${slug}`
    }
  };

  const relatedPosts = Object.entries(blogPostsData)
    .filter(([key]) => key !== slug)
    .slice(0, 3)
    .map(([key, value]) => ({ slug: key, ...value }));

  return (
    <>
      <Helmet>
        <title>{post.title} | Blog Optimus CRM</title>
        <meta name="description" content={post.excerpt} />
        <meta name="keywords" content={post.keywords} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`https://optimuscrm.com.br/blog/${slug}`} />
        
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:url" content={`https://optimuscrm.com.br/blog/${slug}`} />
        <meta property="article:published_time" content={post.date} />
        <meta property="article:author" content={post.author} />
        
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.excerpt} />
        
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
          <nav className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">Optimus CRM</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">
                Blog
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
                <Link to="/blog" className="hover:text-foreground transition-colors">
                  Blog
                </Link>
              </li>
              <li className="flex items-center gap-2">
                <span>/</span>
                <span className="text-foreground font-medium line-clamp-1 max-w-[200px]">{post.title}</span>
              </li>
            </ol>
          </nav>

          {/* Article Header */}
          <section className="py-12 sm:py-16 bg-gradient-to-b from-primary/5 to-background">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
              <Link to="/blog" className="inline-flex items-center gap-2 text-primary hover:underline mb-6">
                <ArrowLeft className="w-4 h-4" />
                Voltar ao blog
              </Link>
              
              <span className="inline-block bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full mb-4">
                {post.category}
              </span>
              
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
                {post.title}
              </h1>
              
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {post.author}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(post.date).toLocaleDateString('pt-BR', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {post.readTime} de leitura
                </span>
              </div>
            </div>
          </section>

          {/* Article Content */}
          <article className="py-12">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
              <div className="prose prose-lg max-w-none 
                prose-headings:text-foreground prose-headings:font-bold
                prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:mb-4
                prose-ul:text-muted-foreground prose-ul:my-4
                prose-li:mb-2
                prose-strong:text-foreground
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                [&_.lead]:text-xl [&_.lead]:text-foreground [&_.lead]:leading-relaxed [&_.lead]:mb-8
              ">
                {post.content}
              </div>

              {/* CTA Box */}
              <div className="mt-12 p-6 sm:p-8 bg-primary/5 border border-primary/20 rounded-xl">
                <h3 className="text-xl font-bold text-foreground mb-3">
                  Pronto para transformar seu atendimento?
                </h3>
                <p className="text-muted-foreground mb-4">
                  Experimente o Optimus CRM gratuitamente e veja como automatizar seu WhatsApp Business.
                </p>
                <Link to="/cadastro">
                  <Button className="bg-primary hover:bg-primary/90">
                    Começar Grátis
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </article>

          {/* Related Posts */}
          <section className="py-12 bg-muted/30">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
              <h2 className="text-2xl font-bold text-foreground mb-6">Artigos relacionados</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedPosts.map((relatedPost) => (
                  <Link key={relatedPost.slug} to={`/blog/${relatedPost.slug}`}>
                    <div className="bg-background border border-border/50 rounded-lg p-4 hover:border-primary/50 transition-colors">
                      <span className="text-xs text-primary font-medium">{relatedPost.category}</span>
                      <h3 className="text-sm font-semibold text-foreground mt-1 line-clamp-2">
                        {relatedPost.title}
                      </h3>
                    </div>
                  </Link>
                ))}
              </div>
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
                <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">Blog</Link>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default BlogPost;
