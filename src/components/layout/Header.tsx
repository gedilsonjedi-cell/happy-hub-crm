import { Link } from "react-router-dom";
import { MessageSquare, LogOut, User, RefreshCw, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { ClientSwitcher } from "@/components/admin/ClientSwitcher";
import { BalanceIndicator } from "@/components/balance/BalanceIndicator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarState } from "@/hooks/useSidebarState";

export function Header() {
  const { user, signOut } = useAuth();
  const { syncing } = useUserRole();
  const { isMobile, setMobileOpen } = useSidebarState();

  return (
    <header className="h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-50">
      {/* Left Section */}
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            className="h-9 w-9 text-sidebar-muted hover:text-sidebar-foreground"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}
        
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">
            <span className="text-foreground">Whats</span>
            <span className="text-primary">Code</span>
          </span>
        </Link>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        {/* Sync Indicator */}
        {syncing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <RefreshCw className={cn("w-4 h-4 animate-spin")} />
                <span className="text-xs hidden md:inline">Sincronizando...</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Atualizando permissões
            </TooltipContent>
          </Tooltip>
        )}

        {/* Client Switcher (Super Admin only) */}
        <ClientSwitcher />

        {/* Balance Indicator - Real-time */}
        <BalanceIndicator />

        {/* User Profile Link */}
        {user && (
          <Link 
            to="/perfil" 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <span className="hidden md:block">{user.email?.substring(0, 20)}...</span>
          </Link>
        )}

        {/* Logout */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">Sair</span>
        </Button>
      </div>
    </header>
  );
}
