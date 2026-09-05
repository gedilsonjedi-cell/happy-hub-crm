// Barra lateral fina (somente ícones) — único sistema de navegação do Optimus.
// Mantém o nome de export TopNavLayout para não quebrar imports existentes.
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Users,
  Send,
  Settings,
  User,
  Trash2,
  Building,
  LogOut,
  Sun,
  Moon,
  MessageCircle,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { OnlineStatusToggle } from "@/components/header/OnlineStatusToggle";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const { isSuperAdmin } = useUserRole();
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

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleClearCache = async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      const authKeys: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("sb-") || key.includes("supabase.auth"))) {
          authKeys[key] = localStorage.getItem(key) || "";
        }
      }
      localStorage.clear();
      Object.entries(authKeys).forEach(([k, v]) => localStorage.setItem(k, v));

      sessionStorage.clear();

      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }

      window.location.reload();
    } catch (err) {
      console.error("Erro ao apagar cache:", err);
      window.location.reload();
    }
  };

  const navItems = [
    { label: "Atendimentos", path: "/atendimento-v2", icon: MessageSquare, badge: unreadCount },
    { label: "Leads", path: "/leads", icon: Users, badge: 0 },
    { label: "Campanhas", path: "/disparos", icon: Send, badge: 0 },
  ];

  const isActive = (path: string) => location.pathname === path;

  const renderRailItem = (item: { label: string; path: string; icon: React.ElementType; badge?: number }) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    return (
      <Tooltip key={item.path} delayDuration={200}>
        <TooltipTrigger asChild>
          <Link
            to={item.path}
            aria-label={item.label}
            className={cn(
              "relative w-11 h-11 rounded-lg flex items-center justify-center transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="w-5 h-5" />
            {!!item.badge && item.badge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Barra lateral fina */}
      <aside className="w-[60px] shrink-0 border-r border-border bg-card flex flex-col items-center py-3 gap-2 z-50">
        {/* Logo */}
        <Link to="/atendimento-v2" className="mb-1" aria-label="Início">
          <img
            src={theme === "dark" ? optimusLogoLight : optimusLogoDark}
            alt="Optimus"
            className="w-8 h-8 object-contain"
          />
        </Link>

        {/* Seletor de cliente (somente super admin) */}
        {isSuperAdmin && (
          <div className="w-full flex justify-center [&_button]:h-9 [&_button]:w-9 [&_button]:px-0 [&_button>span]:hidden [&_button_svg]:mx-auto">
            <ClientSwitcher />
          </div>
        )}

        <div className="w-8 h-px bg-border my-1" />

        {/* Navegação principal */}
        <nav className="flex flex-col items-center gap-1.5 flex-1">
          {navItems.map(renderRailItem)}
        </nav>

        {/* Rodapé */}
        <div className="flex flex-col items-center gap-1.5">
          {renderRailItem({ label: "Configurações", path: "/configuracoes", icon: Settings })}

          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <a
                href="https://wa.me/5582996251871"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Contato Suporte"
                className="w-11 h-11 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Contato Suporte</TooltipContent>
          </Tooltip>

          {/* Status online */}
          <div className="flex justify-center [&_button]:h-9 [&_button]:px-2">
            <OnlineStatusToggle />
          </div>

          {/* Tema */}
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Alternar tema"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Alternar tema</TooltipContent>
          </Tooltip>

          {/* Usuário */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Conta">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {userProfile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="bg-card border-border w-56">
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
              <DropdownMenuItem onClick={handleClearCache} className="cursor-pointer gap-2">
                <Trash2 className="w-4 h-4" />
                Apagar Cache
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/minha-assinatura")} className="cursor-pointer gap-2">
                <CreditCard className="w-4 h-4" />
                Minha Assinatura
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/configuracoes")} className="cursor-pointer gap-2">
                <Building className="w-4 h-4" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-destructive">
                <LogOut className="w-4 h-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Conteúdo */}
      <main
        className={cn(
          "flex-1 min-w-0 min-h-0",
          noPadding ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6"
        )}
      >
        <div className={cn(noPadding ? "h-full flex flex-col" : "min-h-full")}>{children}</div>
      </main>
    </div>
  );
}
