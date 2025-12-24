import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutGrid, 
  Link2, 
  Users, 
  MessageSquare, 
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  { icon: LayoutGrid, label: "Dashboard", path: "/", permission: null },
  { icon: Link2, label: "Conexões", path: "/conexoes", permission: "canAccessConexoes" },
  { icon: MessageCircle, label: "WhatsApp Chat", path: "/whatsapp-chat", permission: "canAccessConexoes" },
  { icon: Users, label: "Leads", path: "/leads", permission: "canAccessLeads" },
  { icon: GitBranch, label: "Pipeline", path: "/pipeline", permission: "canAccessPipeline" },
  { icon: Bot, label: "Chatbot IA", path: "/chatbot", permission: "canAccessChatbot" },
  
  { icon: Send, label: "Disparos", path: "/disparos", permission: "canAccessDisparos" },
  { icon: FileText, label: "Templates", path: "/templates", permission: "canAccessTemplates" },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios", permission: null },
  { icon: Wallet, label: "Saldo", path: "/saldo", permission: null },
  { icon: UserCog, label: "Usuários", path: "/usuarios", permission: "canAccessUsuarios" },
  { icon: Shield, label: "Super Admin", path: "/super-admin", permission: "canAccessSuperAdmin" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const userRole = useUserRole();
  const unreadCount = useUnreadMessagesCount();

  const handleNavClick = (e: React.MouseEvent, item: typeof menuItems[0]) => {
    // If no permission required or still loading, allow navigation
    if (item.permission === null || userRole.loading) {
      return;
    }

    // Check if user has permission
    const hasPermission = userRole[item.permission as keyof typeof userRole];
    
    if (!hasPermission) {
      e.preventDefault();
      toast.error("Acesso negado", {
        description: "Seu usuário não tem permissão para acessar este recurso.",
      });
    }
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
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          // Check permission (only hide Super Admin for non-super-admins after loading)
          const hasPermission = item.permission === null || 
            userRole.loading || 
            userRole[item.permission as keyof typeof userRole];
          
          // Hide Super Admin completely for non-super-admins
          if (item.permission === "canAccessSuperAdmin" && !userRole.loading && !userRole.canAccessSuperAdmin) {
            return null;
          }
          
          // For other items, show them but with locked indicator if no permission
          const isLocked = !userRole.loading && item.permission !== null && !hasPermission;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => handleNavClick(e, item)}
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
              {!collapsed && item.path === "/whatsapp-chat" && unreadCount > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs font-semibold">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
              {!collapsed && isLocked && (
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
