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
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";

const menuItems = [
  { icon: LayoutGrid, label: "Dashboard", path: "/", permission: null },
  { icon: Link2, label: "Conexões", path: "/conexoes", permission: "canAccessConexoes" },
  { icon: Users, label: "Leads", path: "/leads", permission: "canAccessLeads" },
  { icon: GitBranch, label: "Pipeline", path: "/pipeline", permission: "canAccessPipeline" },
  { icon: Bot, label: "Chatbot IA", path: "/chatbot", permission: "canAccessChatbot" },
  { icon: MessageSquare, label: "Atendimento", path: "/atendimento", permission: null },
  { icon: Send, label: "Disparos", path: "/disparos", permission: "canAccessDisparos" },
  { icon: FileText, label: "Templates", path: "/templates", permission: "canAccessTemplates" },
  { icon: UserCog, label: "Usuários", path: "/usuarios", permission: "canAccessUsuarios" },
  { icon: Building2, label: "Setores", path: "/setores", permission: "canAccessSetores" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const userRole = useUserRole();

  // Filter menu items based on permissions
  const visibleMenuItems = menuItems.filter((item) => {
    if (item.permission === null) return true;
    return userRole[item.permission as keyof typeof userRole];
  });

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
        {visibleMenuItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-sidebar-foreground hover:bg-muted/30"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
