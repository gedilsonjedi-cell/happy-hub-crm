import { useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutGrid, 
  Users, 
  Send,
  Menu,
  FileText,
  GitBranch,
  Bot,
  UserCog,
  BarChart3,
  MessageCircle,
  Shield,
  Lock,
  Wallet,
  ChevronDown,
  ChevronRight,
  Link2,
  ShoppingBag,
  CreditCard,
  Ban,
  BookUser,
  X,
  PanelLeftClose,
  PanelLeft,
  Briefcase,
  Settings,
  Clock,
  Calendar,
  Building2,
  Tag,
  RotateCcw,
  Zap,
  Gift,
  Blocks,
  UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useSidebarState } from "@/hooks/useSidebarState";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

const menuItems = [
  { icon: LayoutGrid, label: "Dashboard", path: "/", permission: null },
  { icon: MessageCircle, label: "Atendimento", path: "/atendimento-v2", permission: null },
  { icon: Bot, label: "Chatbot IA", path: "/chatbot", permission: "canAccessChatbot" },
  { icon: Link2, label: "Conexões", path: "/conexoes", permission: "canAccessConexoes" },
];

const crmSubmenu = [
  { icon: Users, label: "Contatos", path: "/leads", permission: null },
  { icon: Briefcase, label: "Carteira de Clientes", path: "/carteira-clientes", permission: null },
  { icon: GitBranch, label: "Pipeline", path: "/pipeline", permission: null },
  { icon: RotateCcw, label: "Follow-up", path: "/follow-up", permission: null },
  { icon: Ban, label: "Lista Negra", path: "/lista-negra", permission: null },
];

const RELATORIOS_ALLOWED_EMAILS = ["allan.pedro147@gmail.com", "gedilson.junior@gmail.com", "henrique.miranda@henrimath.com.br"];

const disparosSubmenu = [
  { icon: Send, label: "Campanhas", path: "/disparos", permission: "canAccessDisparos" },
  { icon: FileText, label: "Templates", path: "/templates", permission: "canAccessDisparos" },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios", permission: null, emailRestricted: true },
];

const appsSubmenu = [
  { icon: Link2, label: "Links", path: "/links", permission: null },
  { icon: UserX, label: "Exportar Leads", path: "/apps/leads-sem-interacao", permission: null, superAdminOnly: true },
];

const personalizacaoSubmenu = [
  { icon: UserCog, label: "Usuários", path: "/usuarios", permission: "canAccessUsuarios" },
  { icon: Clock, label: "Horários", path: "/personalizacao/horarios", permission: null },
  { icon: Calendar, label: "Feriados", path: "/personalizacao/feriados", permission: null },
  { icon: Building2, label: "Departamentos", path: "/personalizacao/departamentos", permission: null },
  { icon: Tag, label: "Tags", path: "/personalizacao/tags", permission: null },
  { icon: FileText, label: "Campos de Contato", path: "/personalizacao/campos", permission: null },
  { icon: Zap, label: "Respostas Rápidas", path: "/personalizacao/respostas-rapidas", permission: null },
  { icon: Link2, label: "Integrações", path: "/integracoes", permission: "canAccessIntegracoes" },
];

const bottomMenuItems = [
  { icon: CreditCard, label: "Minha Assinatura", path: "/minha-assinatura", permission: null },
  { icon: Gift, label: "Indique e Ganhe", path: "/indique-ganhe", permission: null },
  { icon: Wallet, label: "Saldo", path: "/saldo", permission: null },
  { icon: Shield, label: "Super Admin", path: "/super-admin", permission: "canAccessSuperAdmin" },
];

export function Sidebar() {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen, isMobile } = useSidebarState();
  const [crmOpen, setCrmOpen] = useState(true);
  const [disparosOpen, setDisparosOpen] = useState(true);
  const [personalizacaoOpen, setPersonalizacaoOpen] = useState(true);
  const [appsOpen, setAppsOpen] = useState(true);
  const location = useLocation();
  const userRole = useUserRole();
  const { user } = useAuth();
  const userEmail = user?.email?.trim().toLowerCase() || "";

  const filteredDisparosSubmenu = useMemo(() => {
    const canAccessRelatorios = RELATORIOS_ALLOWED_EMAILS.includes(userEmail) || userRole.isSuperAdmin || userRole.isAdmin || userRole.isSupervisor;
    return disparosSubmenu.filter((item) => {
      if ((item as any).emailRestricted && !canAccessRelatorios) return false;
      return true;
    });
  }, [userEmail, userRole.isSuperAdmin, userRole.isAdmin, userRole.isSupervisor]);


  const unreadCount = useUnreadMessagesCount();

  const isCrmActive = crmSubmenu.some(item => location.pathname === item.path);
  const isDisparosActive = filteredDisparosSubmenu.some(item => location.pathname === item.path);
  const isPersonalizacaoActive = personalizacaoSubmenu.some(item => location.pathname === item.path) || location.pathname === "/usuarios";
  const filteredAppsSubmenu = useMemo(
    () => appsSubmenu.filter((item) => !(item as any).superAdminOnly || userRole.isSuperAdmin),
    [userRole.isSuperAdmin]
  );
  const isAppsActive = filteredAppsSubmenu.some(item => location.pathname === item.path);

  // Close mobile menu on route change (always close to prevent stuck overlay)
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  const handleNavClick = (e: React.MouseEvent, permission: string | null) => {
    if (permission === null || userRole.loading) {
      return;
    }

    const hasPermission = userRole[permission as keyof typeof userRole];
    
    if (!hasPermission) {
      e.preventDefault();
      toast.error("Acesso negado", {
        description: "Seu usuário não tem permissão para acessar este recurso.",
      });
    }
  };

  // In mobile, always show text (menu is full width when open)
  // In desktop, show text only when not collapsed
  const showText = isMobile || !collapsed;

  const renderMenuItem = (item: typeof menuItems[0], showBadge = false) => {
    const isActive = location.pathname === item.path;
    const Icon = item.icon;
    
    const hasPermission = item.permission === null || 
      userRole.loading || 
      userRole[item.permission as keyof typeof userRole];
    
    if (item.permission === "canAccessSuperAdmin" && !userRole.loading && !userRole.canAccessSuperAdmin) {
      return null;
    }
    
    const isLocked = !userRole.loading && item.permission !== null && !hasPermission;
    
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={(e) => handleNavClick(e, item.permission)}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
          isActive 
            ? "bg-primary text-primary-foreground" 
            : isLocked
              ? "text-sidebar-muted cursor-not-allowed opacity-60"
              : "text-sidebar-foreground hover:bg-muted/30"
        )}
      >
        <Icon className="w-5 h-5 shrink-0" />
        {showText && (
          <span className="text-sm font-medium flex-1">{item.label}</span>
        )}
        {showText && showBadge && item.path === "/atendimento-v2" && unreadCount > 0 && (
          <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs font-semibold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
        {showText && isLocked && (
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </Link>
    );
  };

  const renderSubmenu = (
    items: typeof crmSubmenu,
    isOpen: boolean,
    setIsOpen: (open: boolean) => void,
    label: string,
    Icon: React.ElementType,
    isActive: boolean
  ) => (
    <Collapsible open={isOpen && showText} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-sidebar-foreground hover:bg-muted/30"
          )}
        >
          <Icon className="w-5 h-5 shrink-0" />
          {showText && (
            <>
              <span className="text-sm font-medium flex-1 text-left">{label}</span>
              {isOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 space-y-1 mt-1">
        {items.map((item) => {
          const isItemActive = location.pathname === item.path;
          const ItemIcon = item.icon;
          const hasPermission = item.permission === null || 
            userRole.loading || 
            userRole[item.permission as keyof typeof userRole];
          const isLocked = !userRole.loading && item.permission !== null && !hasPermission;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => handleNavClick(e, item.permission)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                isItemActive 
                  ? "bg-primary text-primary-foreground" 
                  : isLocked
                    ? "text-sidebar-muted cursor-not-allowed opacity-60"
                    : "text-sidebar-foreground hover:bg-muted/30"
              )}
            >
              <ItemIcon className="w-4 h-4 shrink-0" />
              {showText && (
                <span className="text-sm font-medium flex-1">{item.label}</span>
              )}
              {showText && isLocked && (
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );

  // Show sidebar based on mobile/desktop state
  const showSidebar = isMobile ? mobileOpen : true;

  return (
    <>
      {/* Mobile overlay - only rendered and visible on mobile when menu is open */}
      {isMobile && mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 animate-fade-in"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside 
        className={cn(
          "fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-sidebar border-r border-sidebar-border transition-all duration-300 z-50 flex flex-col",
          // Desktop/tablet
          !isMobile && (collapsed ? "w-16" : "w-56"),
          // Mobile
          isMobile && "w-64",
          isMobile && (mobileOpen ? "translate-x-0" : "-translate-x-full")
        )}
      >
        {/* Toggle */}
        <div className="p-3 border-b border-sidebar-border flex items-center justify-between">
          {isMobile ? (
            <>
              <span className="text-sm font-semibold text-sidebar-foreground">Menu</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                className="h-8 w-8 text-sidebar-muted hover:text-sidebar-foreground hover:bg-muted/30"
              >
                <X className="w-5 h-5" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="w-full h-9 text-sidebar-muted hover:text-sidebar-foreground hover:bg-muted/30"
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </Button>
          )}
        </div>

        {/* Navigation with scroll */}
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-1">
            {/* Main menu items */}
            {menuItems.map((item) => renderMenuItem(item, item.path === "/atendimento-v2"))}

            {/* CRM submenu */}
            {renderSubmenu(crmSubmenu, crmOpen, setCrmOpen, "CRM", BookUser, isCrmActive)}

            {/* Disparos submenu */}
            {renderSubmenu(filteredDisparosSubmenu, disparosOpen, setDisparosOpen, "Disparos", Send, isDisparosActive)}

            {/* Personalização submenu */}
            {renderSubmenu(personalizacaoSubmenu, personalizacaoOpen, setPersonalizacaoOpen, "Personalização", Settings, isPersonalizacaoActive)}

            {/* Apps submenu */}
            {renderSubmenu(filteredAppsSubmenu, appsOpen, setAppsOpen, "Apps", Blocks, isAppsActive)}

            {/* Bottom menu items */}
            {bottomMenuItems.map((item) => renderMenuItem(item))}
          </nav>
        </ScrollArea>
      </aside>
    </>
  );
}
