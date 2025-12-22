import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Building2, 
  ChevronDown, 
  Settings, 
  LogOut,
  Eye,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

export function ClientSwitcher() {
  const { isSuperAdmin } = useUserRole();
  const { 
    organizations, 
    selectedOrganization, 
    setSelectedOrganization,
    isImpersonating 
  } = useSuperAdmin();
  const navigate = useNavigate();

  if (!isSuperAdmin) return null;

  return (
    <div className="flex items-center gap-2">
      {isImpersonating && (
        <div className="flex items-center gap-2 bg-warning/10 text-warning px-3 py-1.5 rounded-lg border border-warning/20">
          <Eye className="w-4 h-4" />
          <span className="text-sm font-medium">
            Visualizando: {selectedOrganization?.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:bg-warning/20"
            onClick={() => setSelectedOrganization(null)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className={cn(
              "gap-2",
              isImpersonating && "border-warning/50"
            )}
          >
            <Building2 className="w-4 h-4" />
            <span className="hidden md:inline">
              {isImpersonating ? "Trocar Cliente" : "Clientes"}
            </span>
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Clientes</span>
            <Badge variant="outline" className="text-xs">
              {organizations.length}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {organizations.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              Nenhum cliente cadastrado
            </div>
          ) : (
            <>
              {organizations.slice(0, 10).map((org) => (
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
                        org.is_active ? "bg-green-500" : "bg-muted"
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
              
              {organizations.length > 10 && (
                <DropdownMenuItem 
                  className="text-center text-muted-foreground"
                  onClick={() => navigate("/super-admin")}
                >
                  Ver todos ({organizations.length})
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
