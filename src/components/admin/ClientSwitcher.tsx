import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Settings, 
  LogOut,
  Eye,
  X,
  Search
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

interface ClientSwitcherProps {
  compact?: boolean;
}

export function ClientSwitcher({ compact = false }: ClientSwitcherProps) {
  const { isSuperAdmin } = useUserRole();
  const { 
    organizations, 
    selectedOrganization, 
    setSelectedOrganization,
    isImpersonating 
  } = useSuperAdmin();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOrganizations = organizations.filter(org => 
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isSuperAdmin) return null;

  const currentName = selectedOrganization?.name || "Selecionar cliente";
  const initial = selectedOrganization?.name?.trim().charAt(0).toUpperCase() || "C";

  const trigger = (
    <DropdownMenuTrigger asChild>
      {compact ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "group h-10 w-10 rounded-full bg-transparent p-0 hover:bg-transparent data-[state=open]:bg-transparent",
            isImpersonating && "text-primary"
          )}
          aria-label={`Cliente: ${currentName}`}
        >
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary transition-colors group-hover:bg-primary/20",
              isImpersonating && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
            )}
          >
            {initial}
          </span>
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-10 w-full min-w-0 justify-start gap-2 px-2.5",
            isImpersonating && "border-primary/40 bg-primary/5"
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
            {currentName}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      )}
    </DropdownMenuTrigger>
  );

  return (
    <div className={cn("flex min-w-0 items-center", compact ? "justify-center" : "w-full")}>
      {!compact && isImpersonating && (
        <div className="hidden sm:flex items-center gap-2 bg-warning/10 text-warning px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-warning/20">
          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="text-xs sm:text-sm font-medium max-w-[100px] truncate">
            {selectedOrganization?.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 sm:h-5 sm:w-5 hover:bg-warning/20"
            onClick={() => setSelectedOrganization(null)}
          >
            <X className="w-2 h-2 sm:w-3 sm:h-3" />
          </Button>
        </div>
      )}

      <DropdownMenu>
        {compact ? (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">{currentName}</TooltipContent>
          </Tooltip>
        ) : trigger}
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Clientes</span>
            <Badge variant="outline" className="text-xs">
              {organizations.length}
            </Badge>
          </DropdownMenuLabel>
          
          <div className="px-2 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          <DropdownMenuSeparator />
          
          {filteredOrganizations.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {searchQuery ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </div>
          ) : (
            <>
              {filteredOrganizations.slice(0, 10).map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  className={cn(
                    "cursor-pointer",
                    selectedOrganization?.id === org.id && "bg-primary/10"
                  )}
                  onClick={() => setSelectedOrganization(org)}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        org.is_active ? "bg-success" : "bg-muted"
                      )} />
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground">{org.slug}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {org.plan}
                    </Badge>
                  </div>
                </DropdownMenuItem>
              ))}
              
              {filteredOrganizations.length > 10 && (
                <DropdownMenuItem 
                  className="text-center text-muted-foreground"
                  onClick={() => navigate("/super-admin")}
                >
                  Ver todos ({filteredOrganizations.length})
                </DropdownMenuItem>
              )}
            </>
          )}

          <DropdownMenuSeparator />
          
          {isImpersonating && (
            <DropdownMenuItem
              className="text-warning cursor-pointer"
              onClick={() => setSelectedOrganization(null)}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair da visualização
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => navigate("/super-admin")}
          >
            <Settings className="w-4 h-4 mr-2" />
            Painel Super Admin
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
