import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function usePixPaymentNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Get user's organization first
    const setupSubscription = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.organization_id) return;

      const channel = supabase
        .channel("pix-payment-updates")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "pix_payments",
            filter: `organization_id=eq.${profile.organization_id}`,
          },
          (payload) => {
            const newStatus = payload.new.status;
            const oldStatus = payload.old.status;
            const amount = payload.new.amount;
            const paymentType = payload.new.payment_type;

            // Only notify when status changes to approved
            if (newStatus === "approved" && oldStatus !== "approved") {
              const formattedAmount = new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(amount);

              if (paymentType === "balance") {
                toast.success("Pagamento PIX confirmado!", {
                  description: `${formattedAmount} foi creditado ao seu saldo.`,
                  duration: 10000,
                });
              } else if (paymentType === "subscription") {
                toast.success("Assinatura ativada!", {
                  description: `Pagamento de ${formattedAmount} confirmado. Sua assinatura está ativa.`,
                  duration: 10000,
                });
              }
            } else if (newStatus === "rejected" || newStatus === "cancelled") {
              toast.error("Pagamento não aprovado", {
                description: "Seu pagamento PIX foi recusado ou cancelado.",
                duration: 8000,
              });
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    const cleanup = setupSubscription();
    
    return () => {
      cleanup.then((unsub) => unsub?.());
    };
  }, [user]);
}
