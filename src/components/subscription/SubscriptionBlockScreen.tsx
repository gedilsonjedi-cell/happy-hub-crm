import { useState } from "react";
import { AlertTriangle, CreditCard, Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganizationBalance } from "@/hooks/useOrganizationBalance";
import { useSubscription } from "@/hooks/useSubscription";
import { PixPaymentDialog } from "@/components/payment/PixPaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function SubscriptionBlockScreen() {
  const { currentBalance, isLoading: balanceLoading, organizationId } = useOrganizationBalance();
  const { organization } = useSubscription();
  const queryClient = useQueryClient();

  const [isPixDialogOpen, setIsPixDialogOpen] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);

  // Use custom price if set, otherwise default base price
  const subscriptionCost = organization?.custom_subscription_price 
    ? Number(organization.custom_subscription_price) 
    : 229.90;
  const hasEnoughBalance = currentBalance >= subscriptionCost;

  const handleRenewWithBalance = async () => {
    if (!organizationId) return;

    setIsRenewing(true);
    try {
      // Get the subscription product
      const { data: product, error: productError } = await supabase
        .from("store_products")
        .select("id")
        .eq("product_type", "subscription")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (productError || !product) {
        toast.error("Produto de assinatura não encontrado");
        return;
      }

      // Use the purchase_product function
      const { data: success, error } = await supabase.rpc("purchase_product", {
        _organization_id: organizationId,
        _product_id: product.id,
        _quantity: 1,
      });

      if (error) {
        if (error.message?.includes("Insufficient balance")) {
          toast.error("Saldo insuficiente para renovar a assinatura");
        } else {
          toast.error("Erro ao renovar assinatura");
          console.error("Renewal error:", error);
        }
        return;
      }

      if (success) {
        toast.success("Assinatura renovada com sucesso!");
        // Invalidate all relevant queries
        queryClient.invalidateQueries({ queryKey: ["organization-subscription"] });
        queryClient.invalidateQueries({ queryKey: ["organization-balance"] });
        // Reload page to update state
        window.location.reload();
      }
    } catch (err) {
      console.error("Error renewing subscription:", err);
      toast.error("Erro ao renovar assinatura");
    } finally {
      setIsRenewing(false);
    }
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
              Sua assinatura venceu. Para continuar usando o sistema, renove sua assinatura.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Balance Info */}
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Seu saldo atual</p>
              {balanceLoading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                <p className="text-2xl font-bold">
                  R$ {currentBalance.toFixed(2).replace(".", ",")}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Valor da assinatura: R$ {subscriptionCost.toFixed(2).replace(".", ",")}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {hasEnoughBalance && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleRenewWithBalance}
                  disabled={isRenewing}
                >
                  {isRenewing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Renovando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Renovar com Saldo (R$ {subscriptionCost.toFixed(2).replace(".", ",")})
                    </>
                  )}
                </Button>
              )}

              <Button
                variant={hasEnoughBalance ? "outline" : "default"}
                className="w-full"
                size="lg"
                onClick={() => setIsPixDialogOpen(true)}
              >
                <Wallet className="w-4 h-4 mr-2" />
                {hasEnoughBalance ? "Adicionar Mais Saldo" : "Adicionar Saldo via PIX"}
              </Button>
            </div>

            {/* Help Text */}
            <p className="text-xs text-center text-muted-foreground">
              Após adicionar saldo, você poderá renovar sua assinatura automaticamente.
              Em caso de dúvidas, entre em contato com o suporte.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* PIX Payment Dialog */}
      {organizationId && (
        <PixPaymentDialog
          open={isPixDialogOpen}
          onOpenChange={setIsPixDialogOpen}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}
