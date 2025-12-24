import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const menuItems = [
  { icon: LayoutGrid, label: "Dashboard", path: "/", permission: null },
  { icon: MessageCircle, label: "WhatsApp Chat", path: "/whatsapp-chat", permission: "canAccessConexoes" },
  { icon: Users, label: "Contatos", path: "/leads", permission: "canAccessLeads" },
  { icon: GitBranch, label: "Pipeline", path: "/pipeline", permission: "canAccessPipeline" },
  { icon: Bot, label: "Chatbot IA", path: "/chatbot", permission: "canAccessChatbot" },
  { icon: Link2, label: "Conexões", path: "/conexoes", permission: "canAccessConexoes" },
];

const disparosSubmenu = [
  { icon: Send, label: "Campanhas", path: "/disparos", permission: "canAccessDisparos" },
  { icon: FileText, label: "Templates", path: "/templates", permission: "canAccessTemplates" },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios", permission: null },
];

const bottomMenuItems = [
  { icon: ShoppingBag, label: "Loja", path: "/loja", permission: null },
  { icon: CreditCard, label: "Minha Assinatura", path: "/minha-assinatura", permission: null },
  { icon: Wallet, label: "Saldo", path: "/saldo", permission: null },
  { icon: UserCog, label: "Usuários", path: "/usuarios", permission: "canAccessUsuarios" },
  { icon: Shield, label: "Super Admin", path: "/super-admin", permission: "canAccessSuperAdmin" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [disparosOpen, setDisparosOpen] = useState(true);
  const location = useLocation();
  const userRole = useUserRole();
  const unreadCount = useUnreadMessagesCount();

  const isDisparosActive = disparosSubmenu.some(item => location.pathname === item.path);

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
        {!collapsed && (
          <span className="text-sm font-medium flex-1">{item.label}</span>
        )}
        {!collapsed && showBadge && item.path === "/whatsapp-chat" && unreadCount > 0 && (
          <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs font-semibold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
        {!collapsed && isLocked && (
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </Link>
    );
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-sidebar border-r border-sidebar-border transition-all duration-300 z-40",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Toggle */}
      <div className="p-3 border-b border-sidebar-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full h-9 text-sidebar-muted hover:text-sidebar-foreground hover:bg-muted/30"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="p-2 space-y-1">
        {/* Main menu items */}
        {menuItems.map((item) => renderMenuItem(item, item.path === "/whatsapp-chat"))}

        {/* Disparos submenu */}
        <Collapsible open={disparosOpen && !collapsed} onOpenChange={setDisparosOpen}>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full",
                isDisparosActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-muted/30"
              )}
            >
              <Send className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="text-sm font-medium flex-1 text-left">Disparos</span>
                  {disparosOpen ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </>
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 space-y-1 mt-1">
            {disparosSubmenu.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
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
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : isLocked
                        ? "text-sidebar-muted cursor-not-allowed opacity-60"
                        : "text-sidebar-foreground hover:bg-muted/30"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && (
                    <span className="text-sm font-medium flex-1">{item.label}</span>
                  )}
                  {!collapsed && isLocked && (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </Link>
              );
            })}
          </CollapsibleContent>
        </Collapsible>

        {/* Bottom menu items */}
        {bottomMenuItems.map((item) => renderMenuItem(item))}
      </nav>
    </aside>
  );
}
