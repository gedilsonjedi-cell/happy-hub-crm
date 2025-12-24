import { CreditCard, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrganizationBalance } from "@/hooks/useOrganizationBalance";

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
      <Badge variant="outline" className="animate-pulse">
        <CreditCard className="h-3 w-3 mr-1" />
        ...
      </Badge>
    );
  }

  const totalCredits = balance?.total_credits_added ?? 0;
  const currentBalance = balance?.balance ?? 0;
  const totalSpent = balance?.total_spent ?? 0;
  const isLowBalance = currentBalance < 5;
  const hasNoBalance = currentBalance <= 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={hasNoBalance ? "destructive" : isLowBalance ? "secondary" : "default"}
            className="cursor-default"
          >
            {hasNoBalance ? (
              <AlertTriangle className="h-3 w-3 mr-1" />
            ) : (
              <CreditCard className="h-3 w-3 mr-1" />
            )}
            {formatCurrency(totalCredits)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-semibold">Recarga para Mensagens</p>
            <p>Total recarregado: {formatCurrency(totalCredits)}</p>
            <p>Saldo disponível: {formatCurrency(currentBalance)}</p>
            <p>Total utilizado: {formatCurrency(totalSpent)}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
