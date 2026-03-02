import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CreditCard, 
  Users, 
  Radio, 
  Calendar, 
  Trash2, 
  Package,
  AlertTriangle,
  CheckCircle,
  Clock
} from "lucide-react";

interface OrganizationAddon {
  id: string;
  organization_id: string;
  product_id: string;
  quantity: number;
  price_per_unit: number;
  is_active: boolean;
  created_at: string;
  cancelled_at: string | null;
  store_products: {
    name: string;
    description: string | null;
  };
}

export default function MinhaAssinatura() {
  const { user } = useAuth();
  const { effectiveOrganizationId, isImpersonating } = useEffectiveOrganizationId();
  const queryClient = useQueryClient();
  const [cancelAddonId, setCancelAddonId] = useState<string | null>(null);

  // Get organization info directly using effective organization ID
  const { data: organization, isLoading: organizationLoading } = useQuery({
    queryKey: ["organization-details", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("id, subscription_status, subscription_paid_until, subscription_started_at, subscription_ends_at, max_users, max_channels, has_paid_first_subscription, custom_subscription_price")
        .eq("id", effectiveOrganizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOrganizationId,
  });

  // Calculate subscription status from organization data
  const getSubscriptionStatus = () => {
    if (!organization) {
      return { isActive: true, paidUntil: null, daysRemaining: 0, needsPayment: false };
    }
    const paidUntil = organization.subscription_paid_until 
      ? new Date(organization.subscription_paid_until) 
      : null;
    const now = new Date();
    if (!paidUntil) {
      const endsAt = organization.subscription_ends_at 
        ? new Date(organization.subscription_ends_at) 
        : null;
      if (endsAt && endsAt < now) {
        return { isActive: false, paidUntil: null, daysRemaining: 0, needsPayment: true };
      }
      return {
        isActive: organization.subscription_status === 'active' || organization.subscription_status === 'trial',
        paidUntil: null,
        daysRemaining: endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 30,
        needsPayment: false,
      };
    }
    const daysRemaining = Math.ceil((paidUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isActive = daysRemaining > 0;
    const needsPayment = daysRemaining <= 0;
    return { isActive, paidUntil, daysRemaining: Math.max(0, daysRemaining), needsPayment };
  };

  const { isActive, paidUntil, daysRemaining, needsPayment } = getSubscriptionStatus();
  const subscriptionLoading = organizationLoading;

  // Get subscription pricing
  const { data: pricing } = useQuery({
    queryKey: ["subscription-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_pricing")
        .select("base_price, promotional_price")
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as { base_price: number; promotional_price: number } | null;
    },
  });

  // Get active add-ons
  const { data: addons, isLoading: addonsLoading } = useQuery({
    queryKey: ["organization-addons", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return [];
      
      const { data, error } = await supabase
        .from("organization_addons")
        .select(`
          *,
          store_products (name, description)
        `)
        .eq("organization_id", effectiveOrganizationId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as OrganizationAddon[];
    },
    enabled: !!effectiveOrganizationId,
  });

  // Cancel add-on mutation
  const cancelAddonMutation = useMutation({
    mutationFn: async (addonId: string) => {
      const { data, error } = await supabase.rpc("cancel_addon", {
        _addon_id: addonId
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-addons"] });
      queryClient.invalidateQueries({ queryKey: ["organization-subscription"] });
      toast.success("Add-on cancelado com sucesso!");
      setCancelAddonId(null);
    },
    onError: (error) => {
      console.error("Error canceling addon:", error);
      toast.error("Erro ao cancelar add-on");
    },
  });

  // Calculate totals - use custom price if set, otherwise standard pricing
  const hasCustomPrice = !!organization?.custom_subscription_price;
  const customPrice = hasCustomPrice ? Number(organization.custom_subscription_price) : null;
  const isFirstSubscription = !organization?.has_paid_first_subscription;
  const basePrice = customPrice ?? (pricing?.base_price || 229.90);
  const promotionalPrice = customPrice ?? (pricing?.promotional_price || 129.90);
  const currentPrice = hasCustomPrice ? customPrice! : (isFirstSubscription ? promotionalPrice : basePrice);
  const addonsTotal = addons?.reduce((sum, addon) => sum + (addon.quantity * addon.price_per_unit), 0) || 0;
  const totalMonthly = currentPrice + addonsTotal;

  const getStatusBadge = () => {
    if (needsPayment) {
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Pagamento Pendente</Badge>;
    }
    if (isActive) {
      return <Badge className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> Ativa</Badge>;
    }
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Inativa</Badge>;
  };

  const getAddonIcon = (name: string) => {
    if (name.toLowerCase().includes("usuário")) return <Users className="h-5 w-5" />;
    if (name.toLowerCase().includes("canal")) return <Radio className="h-5 w-5" />;
    return <Package className="h-5 w-5" />;
  };

  if (subscriptionLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minha Assinatura</h1>
          <p className="text-muted-foreground">
            Gerencie seu plano e add-ons
          </p>
        </div>

        {/* Subscription Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle>Plano Mensal</CardTitle>
                  <CardDescription>Seu plano de assinatura atual</CardDescription>
                </div>
              </div>
              {getStatusBadge()}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  {hasCustomPrice ? "Plano Personalizado" : (isFirstSubscription ? "Primeiro Mês (Promocional)" : "Valor Base")}
                </p>
                <p className="text-2xl font-bold">
                  R$ {currentPrice.toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!hasCustomPrice && isFirstSubscription && (
                    <span className="text-primary">Depois: R$ {basePrice.toFixed(2).replace(".", ",")}/mês</span>
                  )}
                  {(hasCustomPrice || !isFirstSubscription) && "por mês"}
                </p>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Próximo Vencimento</p>
                <p className="text-2xl font-bold">
                  {paidUntil 
                    ? format(paidUntil, "dd/MM/yyyy", { locale: ptBR })
                    : "—"
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  {daysRemaining > 0 ? `${daysRemaining} dias restantes` : "Vencido"}
                </p>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Limites do Plano</p>
                <div className="flex items-center gap-4 mt-1">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{organization?.max_users || 1}</span>
                    <span className="text-xs text-muted-foreground">usuários</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Radio className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{organization?.max_channels || 1}</span>
                    <span className="text-xs text-muted-foreground">canais</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Add-ons Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle>Add-ons Ativos</CardTitle>
                  <CardDescription>
                    Recursos adicionais que serão cobrados junto com seu plano
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" onClick={() => window.location.href = "/loja"}>
                Adicionar Mais
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {addonsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : addons && addons.length > 0 ? (
              <div className="space-y-3">
                {addons.map((addon) => (
                  <div 
                    key={addon.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        {getAddonIcon(addon.store_products.name)}
                      </div>
                      <div>
                        <p className="font-medium">{addon.store_products.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Quantidade: {addon.quantity} × R$ {addon.price_per_unit.toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">
                          R$ {(addon.quantity * addon.price_per_unit).toFixed(2).replace(".", ",")}
                        </p>
                        <p className="text-xs text-muted-foreground">por mês</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setCancelAddonId(addon.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum add-on ativo</p>
                <p className="text-sm">
                  Visite a loja para adicionar usuários ou canais extras
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Summary Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Calendar className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Resumo Mensal</CardTitle>
                <CardDescription>
                  Valor total que será cobrado na próxima renovação
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {isFirstSubscription ? "Primeiro Mês (Promocional)" : "Plano Base"}
                </span>
                <span>R$ {currentPrice.toFixed(2).replace(".", ",")}</span>
              </div>
              
              {addons && addons.length > 0 && (
                <>
                  {addons.map((addon) => (
                    <div key={addon.id} className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        {addon.store_products.name} (×{addon.quantity})
                      </span>
                      <span>R$ {(addon.quantity * addon.price_per_unit).toFixed(2).replace(".", ",")}</span>
                    </div>
                  ))}
                </>
              )}
              
              <Separator />
              
              <div className="flex justify-between items-center font-bold text-lg">
                <span>Total Mensal</span>
                <span className="text-primary">
                  R$ {totalMonthly.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cancel Add-on Dialog */}
      <AlertDialog open={!!cancelAddonId} onOpenChange={(open) => !open && setCancelAddonId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Add-on</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar este add-on? O limite será reduzido imediatamente
              e ele não será mais cobrado na próxima renovação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelAddonId && cancelAddonMutation.mutate(cancelAddonId)}
            >
              Cancelar Add-on
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
