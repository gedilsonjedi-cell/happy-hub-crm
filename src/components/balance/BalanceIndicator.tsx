import { Wallet, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrganizationBalance } from "@/hooks/useOrganizationBalance";

interface BalanceIndicatorProps {
  showDetails?: boolean;
}

export function BalanceIndicator({ showDetails = false }: BalanceIndicatorProps) {
  const { currentBalance, isLoading } = useOrganizationBalance();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isLoading) {
    return (
      <Badge variant="outline" className="animate-pulse">
        <Wallet className="h-3 w-3 mr-1" />
        ...
      </Badge>
    );
  }

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
              <Wallet className="h-3 w-3 mr-1" />
            )}
            {showDetails ? formatCurrency(currentBalance) : (
              currentBalance > 0 ? formatCurrency(currentBalance) : "Sem saldo"
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {hasNoBalance 
              ? "Sem saldo para enviar mensagens. Entre em contato para recarregar."
              : isLowBalance
              ? "Saldo baixo. Considere recarregar."
              : "Saldo disponível para envio de mensagens"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
