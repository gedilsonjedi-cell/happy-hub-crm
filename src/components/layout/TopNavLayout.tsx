// Barra lateral fina (somente ícones) — único sistema de navegação do Optimus.
// Mantém o nome de export TopNavLayout para não quebrar imports existentes.
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Users,
  Send,
  GitBranch,
  Settings,
  User,
  Trash2,
  Building,
  LogOut,
  Sun,
  Moon,
  MessageCircle,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  FileText,
  Plug,
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
import optimusIcon from "@/assets/optimus-icon.png";
import { ClientSwitcher } from "@/components/admin/ClientSwitcher";
import { useInsideLayoutShell } from "@/components/layout/LayoutShellContext";

interface TopNavLayoutProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

const SIDEBAR_EXPANDED_KEY = "optimus-sidebar-expanded";

export function TopNavLayout({ children, noPadding = false }: TopNavLayoutProps) {
  const insideShell = useInsideLayoutShell();
  if (insideShell) return <>{children}</>;
  return <TopNavLayoutShell noPadding={noPadding}>{children}</TopNavLayoutShell>;
}

export function TopNavLayoutShell({ children, noPadding = false }: TopNavLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isSuperAdmin, canAccessTemplates, canAccessConexoes } = useUserRole();
  const unreadCount = useUnreadMessagesCount();
  const { theme, setTheme } = useTheme();
  const [userProfile, setUserProfile] = useState<{ display_name: string | null; email: string | null } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_EXPANDED_KEY);
      if (saved) setIsExpanded(saved === "true");
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(isExpanded));
    } catch {
      // ignore storage errors
    }
  }, [isExpanded]);

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
    { label: "Dashboard", path: "/", icon: LayoutDashboard, badge: 0, visible: true },
    { label: "Atendimentos", path: "/atendimento-v2", icon: MessageSquare, badge: unreadCount },
    { label: "Leads", path: "/leads", icon: Users, badge: 0 },
    { label: "Campanhas", path: "/disparos", icon: Send, badge: 0 },
    { label: "Pipeline", path: "/pipeline", icon: GitBranch, badge: 0 },
    { label: "Templates", path: "/templates", icon: FileText, badge: 0, visible: canAccessTemplates },
    { label: "Conexões", path: "/conexoes", icon: Plug, badge: 0, visible: canAccessConexoes },
  ].filter((item) => item.visible !== false);

  const isActive = (path: string) => location.pathname === path;

  const renderRailItem = (item: { label: string; path: string; icon: React.ElementType; badge?: number }) => {
    const Icon = item.icon;
    const active = isActive(item.path);

    const content = (
      <Link
        to={item.path}
        aria-label={item.label}
        className={cn(
          "relative rounded-md flex items-center transition-colors shrink-0",
          isExpanded
            ? "w-full h-10 px-3 gap-3 justify-start"
            : "w-11 h-11 justify-center",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="w-5 h-5 shrink-0" />
        {isExpanded && <span className="text-sm font-medium truncate">{item.label}</span>}
        {!!item.badge && item.badge > 0 && (
          <span
            className={cn(
              "min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center",
              isExpanded ? "ml-auto" : "absolute -top-0.5 -right-0.5"
            )}
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    );

    if (isExpanded) return <div key={item.path}>{content}</div>;

    return (
      <Tooltip key={item.path} delayDuration={200}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="h-screen bg-[hsl(var(--app-background))] flex overflow-hidden">
      {/* Barra lateral fina / expandida */}
      <aside
        className={cn(
          "shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col py-3 gap-2 z-50 transition-all duration-300 ease-in-out relative shadow-card",
          isExpanded ? "w-[240px] px-3" : "w-[60px] items-center px-0"
        )}
      >
        {/* Botão expandir/recolher */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="absolute -right-3 top-20 h-6 w-6 rounded-full border-border bg-card shadow-sm hover:bg-muted z-50 p-0"
              onClick={() => setIsExpanded((v) => !v)}
              aria-label={isExpanded ? "Recolher menu" : "Expandir menu"}
            >
              {isExpanded ? (
                <ChevronLeft className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isExpanded ? "Colapsar menu" : "Expandir menu"}
          </TooltipContent>
        </Tooltip>

        {/* Logo */}
        <Link
          to="/atendimento-v2"
          className={cn("mb-1 flex items-center rounded-lg", isExpanded ? "justify-start gap-3 px-2" : "justify-center")}
          aria-label="Início"
        >
          <img
            src={optimusIcon}
            alt="Optimus"
            className="w-11 h-11 object-contain shrink-0"
          />
          {isExpanded && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">Optimus CRM</p>
              <p className="truncate text-xs text-muted-foreground">Central de operações</p>
            </div>
          )}
        </Link>

        {/* Seletor de cliente (somente super admin) */}
        {isSuperAdmin && (
          <div
            className={cn(
              "min-w-0",
              isExpanded ? "w-full" : "flex w-full justify-center"
            )}
          >
            <ClientSwitcher compact={!isExpanded} />
          </div>
        )}

        <div className={cn("bg-border my-1", isExpanded ? "w-full h-px" : "w-8 h-px")} />

        {/* Navegação principal */}
        <nav className={cn("flex flex-col gap-1.5 flex-1", isExpanded ? "w-full" : "items-center")}> 
          {navItems.map(renderRailItem)}
        </nav>

        {/* Rodapé */}
        <div className={cn("flex flex-col gap-1.5", isExpanded ? "w-full" : "items-center")}>
          {renderRailItem({ label: "Configurações", path: "/configuracoes", icon: Settings })}

          {isExpanded ? (
            <a
              href="https://wa.me/5582996251871"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contato Suporte"
              className="w-full h-10 px-3 gap-3 rounded-lg flex items-center justify-start text-green-600 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors"
            >
              <MessageCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium truncate">Contato Suporte</span>
            </a>
          ) : (
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
          )}

          {/* Status online */}
          <div className={cn("w-full", isExpanded ? "" : "flex justify-center [&_button]:h-9 [&_button]:px-2")}>
            <OnlineStatusToggle />
          </div>

          {/* Tema */}
          {isExpanded ? (
            <Button
              variant="ghost"
              className="w-full h-10 px-3 justify-start gap-3 text-muted-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
              <span className="text-sm font-medium">Alternar tema</span>
            </Button>
          ) : (
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
          )}

          {/* Usuário */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {isExpanded ? (
                <Button
                  variant="ghost"
                  className="w-full h-11 px-2 justify-start gap-2 text-left"
                  aria-label="Conta"
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {userProfile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start min-w-0">
                    <p className="text-sm font-medium truncate w-full">
                      {userProfile?.display_name || user?.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate w-full">{user?.email}</p>
                  </div>
                </Button>
              ) : (
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Conta">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {userProfile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              )}
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
          "flex-1 min-w-0 min-h-0 bg-[hsl(var(--app-background))] transition-all duration-300 ease-in-out",
          noPadding ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6"
        )}
      >
        <div className={cn(noPadding ? "h-full flex flex-col" : "min-h-full")}>{children}</div>
      </main>
    </div>
  );
}
