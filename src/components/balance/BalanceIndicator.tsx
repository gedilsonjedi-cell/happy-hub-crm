import { Link } from "react-router-dom";
import { Wallet, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrganizationBalance } from "@/hooks/useOrganizationBalance";
import { cn } from "@/lib/utils";

interface BalanceIndicatorProps {
  showDetails?: boolean;
}

export function BalanceIndicator({ showDetails = false }: BalanceIndicatorProps) {
  const { balance, isLoading } = useOrganizationBalance();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border/50 animate-pulse">
        <Wallet className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-muted-foreground">...</span>
      </div>
    );
  }

  const currentBalance = balance?.balance ?? 0;
  const totalCredits = balance?.total_credits_added ?? 0;
  const totalSpent = balance?.total_spent ?? 0;
  const isLowBalance = currentBalance > 0 && currentBalance < 10;
  const hasNoBalance = currentBalance <= 0;

  const getStatusStyles = () => {
    if (hasNoBalance) {
      return "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20";
    }
    if (isLowBalance) {
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20";
    }
    return "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20";
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link 
          to="/saldo"
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
            getStatusStyles()
          )}
        >
          {hasNoBalance ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Wallet className="w-4 h-4" />
          )}
          <span className="text-sm font-semibold">
            {formatCurrency(currentBalance)}
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <div className="space-y-2 py-1">
          <p className="font-semibold text-sm">Saldo da Organização</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Wallet className="w-3 h-3" />
              <span>Disponível: {formatCurrency(currentBalance)}</span>
            </div>
            <div className="flex items-center gap-2 text-green-500">
              <TrendingUp className="w-3 h-3" />
              <span>Total recarregado: {formatCurrency(totalCredits)}</span>
            </div>
            <div className="flex items-center gap-2 text-red-500">
              <TrendingDown className="w-3 h-3" />
              <span>Total gasto: {formatCurrency(totalSpent)}</span>
            </div>
          </div>
          {hasNoBalance && (
            <p className="text-destructive text-xs mt-2">
              Clique para adicionar créditos
            </p>
          )}
          {isLowBalance && (
            <p className="text-yellow-600 text-xs mt-2">
              Saldo baixo - recarregue em breve
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
