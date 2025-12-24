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
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
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
  const queryClient = useQueryClient();
  const { paidUntil, daysRemaining, isActive, needsPayment, organization, isLoading: subscriptionLoading } = useSubscription();
  const [cancelAddonId, setCancelAddonId] = useState<string | null>(null);

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
    queryKey: ["organization-addons", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const { data, error } = await supabase
        .from("organization_addons")
        .select(`
          *,
          store_products (name, description)
        `)
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as OrganizationAddon[];
    },
    enabled: !!organization?.id,
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

  // Calculate totals - check if first subscription
  const isFirstSubscription = !organization?.has_paid_first_subscription;
  const basePrice = pricing?.base_price || 229.90;
  const promotionalPrice = pricing?.promotional_price || 129.90;
  const currentPrice = isFirstSubscription ? promotionalPrice : basePrice;
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
                  {isFirstSubscription ? "Primeiro Mês (Promocional)" : "Valor Base"}
                </p>
                <p className="text-2xl font-bold">
                  R$ {currentPrice.toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isFirstSubscription && (
                    <span className="text-primary">Depois: R$ {basePrice.toFixed(2).replace(".", ",")}/mês</span>
                  )}
                  {!isFirstSubscription && "por mês"}
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
