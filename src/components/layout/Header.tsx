import { Link } from "react-router-dom";
import { MessageSquare, LogOut, Wallet, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">
            <span className="text-foreground">Whats</span>
            <span className="text-primary">Code</span>
          </span>
        </Link>

        {/* Main Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Início
          </Link>
          <Link to="/templates" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Templates
          </Link>
          <Link to="/conexoes" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Conexões
          </Link>
        </nav>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Balance */}
        <div className="flex items-center gap-2 bg-warning/10 text-warning px-3 py-1.5 rounded-lg border border-warning/20">
          <Wallet className="w-4 h-4" />
          <span className="text-sm font-semibold">R$ 31.00</span>
        </div>

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
