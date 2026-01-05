import * as React from "react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizationBalance } from "@/hooks/useOrganizationBalance";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { PixPaymentDialog } from "@/components/payment/PixPaymentDialog";
import { 
  ShoppingBag, 
  CreditCard, 
  Check, 
  AlertTriangle, 
  Crown,
  Zap,
  Wallet,
  Calendar,
  Minus,
  Plus,
  Users,
  Sparkles
} from "lucide-react";
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

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  product_type: string;
  is_active: boolean;
}

interface Purchase {
  id: string;
  product_id: string;
  amount: number;
  status: string;
  purchased_at: string | null;
  created_at: string;
  quantity: number;
  store_products: {
    name: string;
  } | null;
}

interface ActiveAddon {
  id: string;
  product_id: string;
  is_active: boolean;
  quantity: number;
}

export default function Loja() {
  const { user } = useAuth();
  const { effectiveOrganizationId, isImpersonating } = useEffectiveOrganizationId();
  const { currentBalance } = useOrganizationBalance(effectiveOrganizationId);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [activeAddons, setActiveAddons] = useState<ActiveAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [subscriptionPricing, setSubscriptionPricing] = useState<{ base_price: number; promotional_price: number } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; product: Product | null; quantity: number }>({
    open: false,
    product: null,
    quantity: 1,
  });

  // Get organization info directly using effective organization ID
  const { data: organization } = useQuery({
    queryKey: ["organization-details", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("id, subscription_status, subscription_paid_until, subscription_started_at, subscription_ends_at, max_users, max_channels, has_paid_first_subscription")
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
    const isActiveStatus = daysRemaining > 0;
    const needsPayment = daysRemaining <= 0;
    return { isActive: isActiveStatus, paidUntil, daysRemaining: Math.max(0, daysRemaining), needsPayment };
  };

  const { isActive, paidUntil, daysRemaining, needsPayment } = getSubscriptionStatus();

  // Check if user is on first subscription
  const isFirstSubscription = !organization?.has_paid_first_subscription;

  useEffect(() => {
    fetchProducts();
    fetchSubscriptionPricing();
    if (effectiveOrganizationId) {
      fetchPurchases();
      fetchActiveAddons();
    }
  }, [effectiveOrganizationId]);

  const fetchActiveAddons = async () => {
    if (!effectiveOrganizationId) return;

    try {
      const { data, error } = await supabase
        .from("organization_addons")
        .select("id, product_id, is_active, quantity")
        .eq("organization_id", effectiveOrganizationId)
        .eq("is_active", true);

      if (error) throw error;
      setActiveAddons(data || []);
    } catch (error) {
      console.error("Error fetching active addons:", error);
    }
  };

  const fetchSubscriptionPricing = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_pricing")
        .select("base_price, promotional_price")
        .limit(1)
        .maybeSingle();
      
      if (!error && data) {
        setSubscriptionPricing(data as { base_price: number; promotional_price: number });
      }
    } catch (error) {
      console.error("Error fetching subscription pricing:", error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("store_products")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      
      // Custom sort order: 1. Plano Mensal, 2. Usuários Adicionais, 3. Higienização, 4. Criação da API Oficial
      const sortOrder: Record<string, number> = {
        "Plano Mensal": 1,
        "Usuários Adicionais": 2,
        "Higienização": 3,
        "Criação da API Oficial": 4,
      };
      
      const sortedProducts = (data || []).sort((a, b) => {
        const orderA = sortOrder[a.name] || 99;
        const orderB = sortOrder[b.name] || 99;
        return orderA - orderB;
      });
      
      setProducts(sortedProducts);
      
      // Initialize quantities
      const initialQuantities: Record<string, number> = {};
      (data || []).forEach(p => {
        initialQuantities[p.id] = 1;
      });
      setQuantities(initialQuantities);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast({
        title: "Erro ao carregar produtos",
        description: "Não foi possível carregar a lista de produtos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPurchases = async () => {
    if (!effectiveOrganizationId) return;

    try {
      const { data, error } = await supabase
        .from("store_purchases")
        .select(`
          *,
          store_products (name)
        `)
        .eq("organization_id", effectiveOrganizationId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setPurchases(data || []);
    } catch (error) {
      console.error("Error fetching purchases:", error);
    }
  };

  const handleQuantityChange = (productId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, (prev[productId] || 1) + delta)
    }));
  };

  const setQuantity = (productId: string, value: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, value)
    }));
  };

  const handlePurchase = async (product: Product) => {
    if (!effectiveOrganizationId) {
      toast({
        title: "Erro",
        description: "Organização não encontrada.",
        variant: "destructive",
      });
      return;
    }

    // Determine if this product allows quantity selection
    const isSubscription = product.product_type === "subscription";
    const isAddon = product.product_type === "addon";
    const isHigienizacao = product.name.toLowerCase().includes("higieniza");
    const isUsuariosAdicionais = product.name.toLowerCase().includes("usuário") || product.name.toLowerCase().includes("usuario");
    const isStackableAddon = isAddon && isUsuariosAdicionais;
    const isUniqueAddon = isAddon && isHigienizacao;
    
    // Unique addons and subscriptions always have quantity 1
    // Stackable addons and one_time products use the selected quantity
    const quantity = (isSubscription || isUniqueAddon) ? 1 : (quantities[product.id] || 1);
    const totalPrice = product.price * quantity;

    if (currentBalance < totalPrice) {
      toast({
        title: "Saldo insuficiente",
        description: `Você precisa de ${formatCurrency(totalPrice)} para esta compra. Seu saldo atual é ${formatCurrency(currentBalance)}.`,
        variant: "destructive",
      });
      return;
    }

    setConfirmDialog({ open: true, product, quantity });
  };

  const confirmPurchase = async () => {
    const product = confirmDialog.product;
    const quantity = confirmDialog.quantity;
    if (!product || !effectiveOrganizationId) return;

    setPurchasing(product.id);
    setConfirmDialog({ open: false, product: null, quantity: 1 });

    try {
      const { data, error } = await supabase.rpc("purchase_product", {
        _organization_id: effectiveOrganizationId,
        _product_id: product.id,
        _quantity: quantity,
      });

      if (error) throw error;

      if (data) {
        toast({
          title: "Compra realizada!",
          description: quantity > 1 
            ? `${quantity}x ${product.name} adquirido(s) com sucesso.`
            : `${product.name} foi adquirido com sucesso.`,
        });
        fetchPurchases();
        fetchActiveAddons(); // Refresh addons to update UI
        // Reset quantity
        setQuantities(prev => ({ ...prev, [product.id]: 1 }));
      } else {
        toast({
          title: "Erro na compra",
          description: "Não foi possível completar a compra. Verifique seu saldo.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error purchasing product:", error);
      toast({
        title: "Erro ao comprar",
        description: "Ocorreu um erro ao processar sua compra.",
        variant: "destructive",
      });
    } finally {
      setPurchasing(null);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getProductIcon = (productType: string, productName: string) => {
    if (productType === "subscription") return <Crown className="w-6 h-6 text-primary" />;
    if (productType === "addon") return <Zap className="w-6 h-6 text-warning" />;
    if (productName.toLowerCase().includes("api")) return <Zap className="w-6 h-6 text-warning" />;
    if (productName.toLowerCase().includes("usuário") || productName.toLowerCase().includes("usuario")) {
      return <Users className="w-6 h-6 text-blue-500" />;
    }
    if (productName.toLowerCase().includes("higieniza")) {
      return <Sparkles className="w-6 h-6 text-emerald-500" />;
    }
    return <ShoppingBag className="w-6 h-6 text-muted-foreground" />;
  };

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Loja</h1>
            <p className="text-muted-foreground">
              Adquira produtos e renove seu plano usando seu saldo
            </p>
          </div>
          <Button onClick={() => setPixDialogOpen(true)} className="gap-2">
            <CreditCard className="w-4 h-4" />
            Adicionar Saldo via PIX
          </Button>
        </div>

        {/* Subscription Status Alert */}
        {needsPayment && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="flex items-center gap-4 py-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive">Assinatura vencida</h3>
                <p className="text-sm text-muted-foreground">
                  Sua assinatura expirou. Renove seu plano para continuar usando a plataforma.
                </p>
              </div>
              <Button 
                variant="destructive"
                onClick={() => {
                  const subscriptionProduct = products.find(p => p.product_type === "subscription");
                  if (subscriptionProduct) handlePurchase(subscriptionProduct);
                }}
              >
                Renovar Agora
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Balance & Subscription Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(currentBalance)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use seu saldo para comprar produtos e renovar seu plano
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status da Assinatura</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge variant={isActive ? "default" : "destructive"}>
                  {isActive ? "Ativa" : "Inativa"}
                </Badge>
                {paidUntil && (
                  <span className="text-sm text-muted-foreground">
                    até {formatDate(paidUntil.toISOString())}
                  </span>
                )}
              </div>
              {isActive && daysRemaining <= 7 && daysRemaining > 0 && (
                <p className="text-xs text-warning mt-1">
                  Restam {daysRemaining} dia{daysRemaining !== 1 ? "s" : ""} para renovação
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Products Grid */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Produtos Disponíveis</h2>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-1/2" />
                  </CardContent>
                  <CardFooter>
                    <Skeleton className="h-10 w-full" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => {
                const isSubscription = product.product_type === "subscription";
                const isAddon = product.product_type === "addon";
                const isMonthly = isSubscription || isAddon;
                
                // Check if this is a unique addon that's already purchased
                const isHigienizacao = product.name.toLowerCase().includes("higieniza");
                const isUsuariosAdicionais = product.name.toLowerCase().includes("usuário") || product.name.toLowerCase().includes("usuario");
                
                // Unique addons: Higienização (can only buy once)
                // Stackable addons: Usuários Adicionais (can buy multiple times with quantity)
                const isUniqueAddon = isAddon && isHigienizacao;
                const isStackableAddon = isAddon && isUsuariosAdicionais;
                
                // Check if already purchased
                const hasActiveAddon = activeAddons.some(addon => addon.product_id === product.id);
                const hasActiveSubscription = isSubscription && isActive;
                const alreadyPurchased = (isUniqueAddon && hasActiveAddon) || (hasActiveSubscription && !needsPayment);
                
                // For stackable addons and one_time products, show quantity selector
                const showQuantitySelector = isStackableAddon || product.product_type === "one_time";
                const quantity = showQuantitySelector ? (quantities[product.id] || 1) : 1;
                
                // Use the real price from subscription_pricing for subscriptions
                const displayPrice = isSubscription && subscriptionPricing
                  ? subscriptionPricing.base_price
                  : product.price;
                const totalPrice = displayPrice * quantity;
                const canAfford = currentBalance >= totalPrice;
                
                return (
                  <Card key={product.id} className={isSubscription ? "border-primary" : isAddon ? "border-warning/50" : ""}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        {getProductIcon(product.product_type, product.name)}
                        {isSubscription && (
                          <Badge variant="secondary">Mensal</Badge>
                        )}
                        {isAddon && (
                          <Badge variant="outline" className="border-warning text-warning">Add-on Mensal</Badge>
                        )}
                      </div>
                      <CardTitle className="mt-2">{product.name}</CardTitle>
                      <CardDescription>
                        {product.description || "Acesso completo à plataforma por 30 dias."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="text-3xl font-bold text-primary">
                          {formatCurrency(displayPrice)}
                          {isMonthly && <span className="text-sm font-normal text-muted-foreground">/mês</span>}
                        </div>
                        {isSubscription && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Renovação mensal usando saldo
                          </p>
                        )}
                        {isAddon && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Cobrado mensalmente junto com sua assinatura
                          </p>
                        )}
                      </div>

                      {/* Quantity Selector - for stackable addons and one_time products */}
                      {showQuantitySelector && !alreadyPurchased && (
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Quantidade</Label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleQuantityChange(product.id, -1)}
                              disabled={quantity <= 1}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              value={quantity}
                              onChange={(e) => setQuantity(product.id, parseInt(e.target.value) || 1)}
                              className="w-16 text-center h-8"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleQuantityChange(product.id, 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          {quantity > 1 && (
                            <p className="text-sm font-medium text-primary">
                              Total: {formatCurrency(totalPrice)}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Already purchased indicator */}
                      {alreadyPurchased && (
                        <div className="flex items-center gap-2 text-primary bg-primary/10 rounded-lg p-3">
                          <Check className="w-5 h-5" />
                          <span className="text-sm font-medium">Produto já adquirido</span>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      {alreadyPurchased ? (
                        <Button
                          className="w-full gap-2"
                          variant="secondary"
                          disabled
                        >
                          <Check className="w-4 h-4" />
                          Ativo
                        </Button>
                      ) : (
                        <Button
                          className="w-full gap-2"
                          variant={isSubscription ? "default" : "outline"}
                          disabled={purchasing === product.id}
                          onClick={() => handlePurchase(product)}
                        >
                          {purchasing === product.id ? (
                            "Processando..."
                          ) : canAfford ? (
                            <>
                              <Check className="w-4 h-4" />
                              Comprar{quantity > 1 ? ` (${quantity}x)` : ""}
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-4 h-4" />
                              Adicionar Saldo
                            </>
                          )}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Purchases */}
        {purchases.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Compras Recentes</h2>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {purchases.map((purchase) => (
                    <div key={purchase.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {purchase.store_products?.name || "Produto"}
                            {purchase.quantity > 1 && ` (x${purchase.quantity})`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(purchase.purchased_at || purchase.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">
                          {formatCurrency(purchase.amount)}
                        </span>
                        <Badge variant={purchase.status === "completed" ? "default" : "secondary"}>
                          {purchase.status === "completed" ? "Concluída" : purchase.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* PIX Dialog */}
      <PixPaymentDialog
        open={pixDialogOpen}
        onOpenChange={setPixDialogOpen}
        organizationId={effectiveOrganizationId || ""}
        onPaymentCreated={() => {
          fetchProducts();
          fetchPurchases();
        }}
      />

      {/* Confirm Purchase Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Compra</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a comprar{" "}
              {confirmDialog.quantity > 1 && <strong>{confirmDialog.quantity}x </strong>}
              <strong>{confirmDialog.product?.name}</strong> por{" "}
              <strong>{confirmDialog.product ? formatCurrency(confirmDialog.product.price * confirmDialog.quantity) : ""}</strong>.
              <br /><br />
              O valor será debitado do seu saldo atual de{" "}
              <strong>{formatCurrency(currentBalance)}</strong>.
              {confirmDialog.product?.name?.toLowerCase().includes("usuário") && confirmDialog.quantity > 0 && (
                <>
                  <br /><br />
                  <span className="text-primary">
                    Isso adicionará {confirmDialog.quantity} usuário(s) ao limite da sua organização.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPurchase}>
              Confirmar Compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
