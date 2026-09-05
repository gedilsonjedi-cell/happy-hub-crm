import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  User,
  CreditCard,
  Wallet,
  Gift,
  Clock,
  Calendar,
  Tag,
  FileText,
  Zap,
  Ban,
  Building2,
  RotateCcw,
  Bot,
  Link2,
  UserX,
  Plug,
  GitBranch,
  Briefcase,
  UserCog,
  BarChart3,
  Shield,
  Settings,
  ChevronRight,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type Item = {
  label: string;
  description: string;
  path: string;
  icon: React.ElementType;
  visible: boolean;
};

type Category = {
  id: string;
  label: string;
  icon: React.ElementType;
  items: Item[];
};

const Configuracoes = () => {
  const navigate = useNavigate();
  const role = useUserRole();
  const [query, setQuery] = useState("");

  const canSeeReports = role.isAdmin || role.isSupervisor || role.isSuperAdmin;

  const categories = useMemo<Category[]>(() => {
    const all: Category[] = [
      {
        id: "geral",
        label: "Geral",
        icon: LayoutGrid,
        items: [
          { label: "Dashboard", description: "Visão geral dos indicadores", path: "/dashboard", icon: LayoutGrid, visible: true },
          { label: "Perfil", description: "Seus dados de usuário", path: "/perfil", icon: User, visible: true },
          { label: "Minha Assinatura", description: "Plano e cobrança", path: "/minha-assinatura", icon: CreditCard, visible: true },
          { label: "Saldo", description: "Créditos e recargas", path: "/saldo", icon: Wallet, visible: true },
          { label: "Indique e Ganhe", description: "Programa de indicações", path: "/indique-ganhe", icon: Gift, visible: true },
        ],
      },
      {
        id: "atendimento",
        label: "Atendimento",
        icon: Clock,
        items: [
          { label: "Horários", description: "Horário de funcionamento", path: "/personalizacao/horarios", icon: Clock, visible: true },
          { label: "Feriados", description: "Datas sem atendimento", path: "/personalizacao/feriados", icon: Calendar, visible: true },
          { label: "Tags", description: "Etiquetas de conversas e contatos", path: "/personalizacao/tags", icon: Tag, visible: true },
          { label: "Campos de Contato", description: "Campos personalizados", path: "/personalizacao/campos", icon: FileText, visible: true },
          { label: "Respostas Rápidas", description: "Atalhos de mensagens", path: "/personalizacao/respostas-rapidas", icon: Zap, visible: true },
          { label: "Lista Negra", description: "Números bloqueados", path: "/lista-negra", icon: Ban, visible: true },
          { label: "Departamentos", description: "Setores e distribuição", path: "/personalizacao/departamentos", icon: Building2, visible: true },
        ],
      },
      {
        id: "automacao",
        label: "Automação",
        icon: Bot,
        items: [
          { label: "Follow-Up", description: "Retomada automática de contatos", path: "/follow-up", icon: RotateCcw, visible: true },
          { label: "Chatbot IA", description: "Agentes e fluxos automáticos", path: "/chatbot", icon: Bot, visible: !!role.canAccessChatbot },
          { label: "Templates", description: "Modelos aprovados na Meta", path: "/templates", icon: FileText, visible: !!role.canAccessTemplates },
        ],
      },
      {
        id: "ferramentas",
        label: "Ferramentas",
        icon: Link2,
        items: [
          { label: "Links", description: "Links curtos de redirecionamento", path: "/links", icon: Link2, visible: true },
          { label: "Exportar Leads", description: "Exportação de leads sem interação", path: "/apps/leads-sem-interacao", icon: UserX, visible: role.isSuperAdmin },
        ],
      },
      {
        id: "integracoes",
        label: "Integrações",
        icon: Plug,
        items: [
          { label: "Conexões", description: "Números de WhatsApp conectados", path: "/conexoes", icon: Plug, visible: !!role.canAccessConexoes },
          { label: "Integrações", description: "Webhooks e APIs externas", path: "/integracoes", icon: Zap, visible: !!role.canAccessIntegracoes },
        ],
      },
      {
        id: "crm",
        label: "CRM Avançado",
        icon: GitBranch,
        items: [
          { label: "Pipeline", description: "Funil de vendas", path: "/pipeline", icon: GitBranch, visible: !!role.canAccessPipeline },
          { label: "Carteira de Clientes", description: "Clientes por atendente", path: "/carteira-clientes", icon: Briefcase, visible: true },
        ],
      },
      {
        id: "administracao",
        label: "Administração",
        icon: Shield,
        items: [
          { label: "Usuários", description: "Equipe, cargos e acessos", path: "/usuarios", icon: UserCog, visible: !!role.canAccessUsuarios },
          { label: "Relatórios", description: "Desempenho e métricas", path: "/relatorios", icon: BarChart3, visible: canSeeReports },
          { label: "Super Admin", description: "Gestão global de organizações", path: "/super-admin", icon: Shield, visible: role.isSuperAdmin },
        ],
      },
    ];

    return all
      .map((c) => ({ ...c, items: c.items.filter((i) => i.visible) }))
      .filter((c) => c.items.length > 0);
  }, [role, canSeeReports]);

  const [activeId, setActiveId] = useState<string>("geral");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return categories;
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            i.label.toLowerCase().includes(normalizedQuery) ||
            i.description.toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, normalizedQuery]);

  const activeCategory =
    filtered.find((c) => c.id === activeId) ?? filtered[0] ?? null;

  const visibleCategories = normalizedQuery ? filtered : filtered;

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground">
          Tudo o que você configura no Optimus, organizado por categoria.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        {/* Categorias */}
        <aside className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar configuração..."
              className="pl-9"
            />
          </div>
          <nav className="space-y-1">
            {visibleCategories.map((c) => {
              const Icon = c.icon;
              const active = activeCategory?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{c.label}</span>
                  <span className="text-xs opacity-60">{c.items.length}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Conteúdo */}
        <section>
          {!activeCategory ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
              Nenhuma configuração encontrada.
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{activeCategory.label}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeCategory.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="group text-left bg-card border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors flex items-start gap-3"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
};

export default Configuracoes;
