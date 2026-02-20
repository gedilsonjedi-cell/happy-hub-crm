import { Link } from "react-router-dom";
import { LogOut, User, RefreshCw, Menu, Sun, Moon, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { ClientSwitcher } from "@/components/admin/ClientSwitcher";

import { OnlineStatusToggle } from "@/components/header/OnlineStatusToggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarState } from "@/hooks/useSidebarState";
import { useTheme } from "next-themes";
import optimusLogo from "@/assets/optimus-logo.png";
import optimusLogoDark from "@/assets/optimus-logo-dark.png";
export function Header() {
  const { user, signOut } = useAuth();
  const { syncing } = useUserRole();
  const { isMobile, setMobileOpen } = useSidebarState();
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-2 sm:px-4 fixed top-0 left-0 right-0 z-50">
      {/* Left Section */}
      <div className="flex items-center gap-1 sm:gap-3">
        {/* Mobile menu button */}
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            className="h-8 w-8 sm:h-9 sm:w-9 text-sidebar-muted hover:text-sidebar-foreground shrink-0"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}
        
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img 
            src={theme === "dark" ? optimusLogo : optimusLogoDark} 
            alt="Optimus CRM" 
            className="h-10 sm:h-[60px] w-auto object-contain"
          />
        </Link>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
        {/* Sync Indicator */}
        {syncing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-muted-foreground">
                <RefreshCw className={cn("w-3 h-3 sm:w-4 sm:h-4 animate-spin")} />
                <span className="text-xs hidden md:inline">Sincronizando...</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Atualizando permissões
            </TooltipContent>
          </Tooltip>
        )}

        {/* Support WhatsApp */}
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="https://wa.me/5582996251871"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-2 sm:px-3 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 transition-colors text-xs font-medium border border-green-500/20"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Suporte</span>
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Contato Suporte via WhatsApp
          </TooltipContent>
        </Tooltip>

        {/* Theme Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </TooltipContent>
        </Tooltip>

        {/* Client Switcher (Super Admin only) */}
        <ClientSwitcher />

        {/* Online/Offline Status Toggle */}
        <OnlineStatusToggle />


        {/* User Profile Link */}
        {user && (
          <Link 
            to="/perfil" 
            className="flex items-center gap-1 sm:gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
            </div>
            <span className="hidden lg:block text-xs">{user.email?.substring(0, 15)}...</span>
          </Link>
        )}

        {/* Logout */}
        <Button 
          variant="ghost" 
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
