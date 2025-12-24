import { Link } from "react-router-dom";
import { AlertTriangle, Clock, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";

export function SubscriptionAlert() {
  const { daysRemaining, needsPayment, isLoading, isActive } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if loading, dismissed, or more than 7 days remaining
  if (isLoading || dismissed) return null;
  
  // Don't show if subscription is active and more than 7 days remaining
  if (isActive && daysRemaining > 7) return null;

  // Subscription expired
  if (needsPayment) {
    return (
      <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-center gap-3 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="font-medium">
          Sua assinatura expirou. Renove agora para continuar usando a plataforma.
        </span>
        <Link to="/loja">
          <Button size="sm" variant="secondary" className="h-7 text-xs">
            Renovar Agora
          </Button>
        </Link>
      </div>
    );
  }

  // Warning: 7 days or less remaining
  if (daysRemaining <= 7 && daysRemaining > 0) {
    const urgencyColor = daysRemaining <= 3 
      ? "bg-destructive/90 text-destructive-foreground" 
      : "bg-warning text-warning-foreground";

    return (
      <div className={`${urgencyColor} px-4 py-2 flex items-center justify-center gap-3 text-sm`}>
        <Clock className="w-4 h-4 shrink-0" />
        <span className="font-medium">
          {daysRemaining === 1 
            ? "Sua assinatura expira amanhã!" 
            : `Sua assinatura expira em ${daysRemaining} dias.`}
        </span>
        <Link to="/loja">
          <Button size="sm" variant="secondary" className="h-7 text-xs">
            Renovar
          </Button>
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Fechar alerta"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}
