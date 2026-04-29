import { AlertTriangle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription } from "@/hooks/useSubscription";

const SUPPORT_PHONE = "5582996251871";

export function SubscriptionBlockScreen() {
  const { organization } = useSubscription();

  const subscriptionCost = organization?.custom_subscription_price
    ? Number(organization.custom_subscription_price)
    : 299.9;

  const orgName = (organization as { name?: string } | null)?.name || "minha empresa";

  const message =
    `Olá, eu sou a empresa ${orgName}, sou cliente da Optimus CRM e quero renovar meu plano.`;

  const whatsappUrl = `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(message)}`;

  const handlePayOnWhatsApp = () => {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="border-destructive/50 shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Assinatura Expirada</CardTitle>
            <CardDescription className="text-base">
              Sua assinatura venceu. Para continuar usando o sistema, renove seu plano com nosso suporte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Subscription value */}
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Valor da assinatura</p>
              <p className="text-3xl font-bold">
                R$ {subscriptionCost.toFixed(2).replace(".", ",")}
              </p>
            </div>

            {/* Pay on WhatsApp */}
            <Button
              className="w-full bg-[#25D366] hover:bg-[#20BA5A] text-white"
              size="lg"
              onClick={handlePayOnWhatsApp}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Pagar agora no WhatsApp
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Você será direcionado ao nosso suporte no WhatsApp para concluir a renovação do seu plano.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
