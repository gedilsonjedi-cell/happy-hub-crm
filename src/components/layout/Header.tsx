import { Link } from "react-router-dom";
import { MessageSquare, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
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
          <Link to="/numeros" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Números
          </Link>
          <Link to="/recarga" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Recarga
          </Link>
          <Link to="/admin" className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Admin
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

        {/* User */}
        <span className="text-sm text-muted-foreground hidden md:block">
          gedilson.junior@h...
        </span>

        {/* Logout */}
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">Sair</span>
        </Button>
      </div>
    </header>
  );
}
