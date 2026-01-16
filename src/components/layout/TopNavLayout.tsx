import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  MessageSquare, 
  Users, 
  LayoutGrid, 
  BarChart3, 
  Settings, 
  Bell, 
  HelpCircle, 
  User,
  ChevronDown,
  Send,
  FileText,
  Bot,
  Wallet,
  Building,
  LogOut,
  GitBranch,
  Calendar,
  Tag,
  Clock,
  Zap,
  Plug
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { OnlineStatusToggle } from "@/components/header/OnlineStatusToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import optimusLogoDark from "@/assets/optimus-logo-dark.png";

interface TopNavLayoutProps {
  children: React.ReactNode;
}

export function TopNavLayout({ children }: TopNavLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isImpersonating } = useSuperAdmin();
  const { isAdmin, isSupervisor, isSuperAdmin } = useUserRole();
  const unreadCount = useUnreadMessagesCount();

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const mainNavItems = [
    { 
      label: "Atendimentos", 
      path: "/atendimento-v2", 
      icon: MessageSquare,
      badge: unreadCount > 0 ? unreadCount : undefined
    },
    {
      label: "CRM",
      icon: Users,
      submenu: [
        { label: "Leads", path: "/leads", icon: Users },
        { label: "Pipeline", path: "/pipeline", icon: GitBranch },
        { label: "Carteira de Clientes", path: "/carteira-clientes", icon: Building },
      ]
    },
    {
      label: "Apps",
      icon: LayoutGrid,
      badge: "NOVO",
      submenu: [
        { label: "Disparos", path: "/disparos", icon: Send },
        { label: "Follow-Up", path: "/follow-up", icon: Calendar },
        { label: "Templates", path: "/templates", icon: FileText },
        { label: "Chatbot IA", path: "/chatbot", icon: Bot },
        { label: "Higienização", path: "/higienizacao", icon: Zap },
      ]
    },
    { label: "Relatórios", path: "/relatorios", icon: BarChart3 },
    {
      label: "Ajustes",
      icon: Settings,
      submenu: [
        { label: "Conexões", path: "/conexoes", icon: Plug },
        { label: "Horários", path: "/personalizacao/horarios", icon: Clock },
        { label: "Tags", path: "/personalizacao/tags", icon: Tag },
        { label: "Respostas Rápidas", path: "/personalizacao/respostas-rapidas", icon: MessageSquare },
        { label: "Lista Negra", path: "/lista-negra", icon: Users },
      ]
    },
  ];

  // Add admin menu if user has admin/supervisor role
  if (isAdmin || isSupervisor || isSuperAdmin) {
    mainNavItems.push({
      label: "Admin",
      icon: Building,
      submenu: [
        { label: "Usuários", path: "/usuarios", icon: Users },
        { label: "Departamentos", path: "/personalizacao/departamentos", icon: Building },
        ...(isSuperAdmin ? [{ label: "Super Admin", path: "/super-admin", icon: Settings }] : []),
      ]
    });
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-border bg-card flex items-center px-4 shrink-0 z-50">
        {/* Logo */}
        <Link to="/atendimento-v2" className="flex items-center gap-2 mr-8">
          <img src={optimusLogoDark} alt="Optimus" className="h-7" />
        </Link>

        {/* Main Navigation */}
        <nav className="flex items-center gap-1 flex-1">
          {mainNavItems.map((item) => {
            if (item.submenu) {
              return (
                <DropdownMenu key={item.label}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                      {item.badge && (
                        <Badge className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                          {item.badge}
                        </Badge>
                      )}
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-card border-border min-w-[200px]">
                    {item.submenu.map((subItem) => (
                      <DropdownMenuItem 
                        key={subItem.path}
                        onClick={() => navigate(subItem.path)}
                        className={cn(
                          "cursor-pointer gap-2",
                          isActive(subItem.path) && "bg-muted"
                        )}
                      >
                        <subItem.icon className="w-4 h-4" />
                        {subItem.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            return (
              <Button
                key={item.path}
                variant="ghost"
                className={cn(
                  "gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  isActive(item.path!) && "text-foreground bg-muted"
                )}
                onClick={() => navigate(item.path!)}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.badge && (
                  <Badge className="ml-1 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0 rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
                    {item.badge}
                  </Badge>
                )}
              </Button>
            );
          })}
        </nav>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2">
          {/* Online Status Toggle */}
          <OnlineStatusToggle />

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Bell className="w-5 h-5" />
          </Button>

          {/* Help */}
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <HelpCircle className="w-5 h-5" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {user?.email?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">Conta</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/perfil")} className="cursor-pointer gap-2">
                <User className="w-4 h-4" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/saldo")} className="cursor-pointer gap-2">
                <Wallet className="w-4 h-4" />
                Saldo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/minha-assinatura")} className="cursor-pointer gap-2">
                <Building className="w-4 h-4" />
                Minha Assinatura
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-destructive">
                <LogOut className="w-4 h-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
