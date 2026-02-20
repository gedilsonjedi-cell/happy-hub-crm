import { useState, useEffect } from "react";
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
  Plug,
  ShoppingCart,
  Sun,
  Moon,
  MessageCircle
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
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import optimusLogoDark from "@/assets/optimus-logo-dark.png";
import optimusLogoLight from "@/assets/optimus-logo.png";
import { ClientSwitcher } from "@/components/admin/ClientSwitcher";

interface TopNavLayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

export function TopNavLayout({ children, noPadding = false }: TopNavLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isImpersonating, setSelectedOrganization } = useSuperAdmin();
  const { isAdmin, isSupervisor, isSuperAdmin } = useUserRole();
  const unreadCount = useUnreadMessagesCount();
  const { theme, setTheme } = useTheme();
  const [userProfile, setUserProfile] = useState<{ display_name: string | null; email: string | null } | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("user_id", user.id)
        .single();
      if (data) setUserProfile(data);
    };
    fetchProfile();
  }, [user?.id]);

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
        { label: "Loja", path: "/loja", icon: ShoppingCart },
      ]
    },
    { label: "Relatórios", path: "/relatorios", icon: BarChart3 },
    {
      label: "Ajustes",
      icon: Settings,
      submenu: [
        { label: "Conexões", path: "/conexoes", icon: Plug },
        { label: "Integrações", path: "/integracoes", icon: Zap },
        { label: "Horários", path: "/personalizacao/horarios", icon: Clock },
        { label: "Tags", path: "/personalizacao/tags", icon: Tag },
        { label: "Respostas Rápidas", path: "/personalizacao/respostas-rapidas", icon: MessageSquare },
        { label: "Lista Negra", path: "/lista-negra", icon: Users },
      ]
    },
  ];

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
      {/* Top Header - Account & Settings */}
      <header className="h-12 border-b border-border bg-card flex items-center px-4 shrink-0 z-50">
        {/* Logo - inverted: dark logo for light theme, light logo for dark theme */}
        <Link to="/atendimento-v2" className="flex items-center gap-2 mr-6">
          <img 
            src={theme === 'dark' ? optimusLogoLight : optimusLogoDark} 
            alt="Optimus" 
            className="h-6" 
          />
        </Link>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Account Switcher (for super admins) - uses ClientSwitcher dropdown */}
        {isSuperAdmin && <ClientSwitcher />}

        <div className="flex-1" />

        {/* Right Side Actions */}
        <div className="flex items-center gap-3">
          {/* Support WhatsApp */}
          <a
            href="https://wa.me/5582996251871"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 transition-colors text-xs font-medium border border-green-500/20"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Contato Suporte</span>
          </a>

          {/* Online Status Toggle */}
          <OnlineStatusToggle />


          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 gap-2 px-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {userProfile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {userProfile?.display_name || user?.email?.split('@')[0]}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{userProfile?.display_name || user?.email}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
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

      {/* Second Header - Navigation Menu */}
      <nav className="h-11 border-b border-border bg-muted/30 flex items-center px-4 shrink-0 z-40">
        <div className="flex items-center gap-1">
          {mainNavItems.map((item) => {
            if (item.submenu) {
              return (
                <DropdownMenu key={item.label}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 h-8"
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                      {item.badge && (
                        <Badge className="ml-1 bg-primary text-primary-foreground text-[9px] px-1 py-0">
                          {item.badge}
                        </Badge>
                      )}
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-card border-border min-w-[180px]">
                    {item.submenu.map((subItem) => (
                      <DropdownMenuItem 
                        key={subItem.path}
                        onClick={() => navigate(subItem.path)}
                        className={cn(
                          "cursor-pointer gap-2 text-sm",
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
                size="sm"
                className={cn(
                  "gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 h-8",
                  isActive(item.path!) && "text-foreground bg-muted"
                )}
                onClick={() => navigate(item.path!)}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.badge && (
                  <Badge className="ml-1 bg-destructive text-destructive-foreground text-[9px] px-1 py-0 rounded-full min-w-[16px] h-[16px] flex items-center justify-center">
                    {item.badge}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Notifications & Help */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <Bell className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <HelpCircle className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <main className={cn(
        "flex-1 min-h-0",
        noPadding ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6"
      )}>
        <div className={cn(
          noPadding ? "h-full flex flex-col" : "min-h-full"
        )}>
          {children}
        </div>
      </main>
    </div>
  );
}
