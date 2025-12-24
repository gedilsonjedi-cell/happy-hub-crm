import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizationBalance } from "@/hooks/useOrganizationBalance";
import { useSubscription } from "@/hooks/useSubscription";
import { PixPaymentDialog } from "@/components/payment/PixPaymentDialog";
import { 
  ShoppingBag, 
  CreditCard, 
  Check, 
  AlertTriangle, 
  Crown,
  Zap,
  Wallet,
  Calendar
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
  store_products: {
    name: string;
  } | null;
}

export default function Loja() {
  const { user } = useAuth();
  const { currentBalance, organizationId } = useOrganizationBalance();
  const { isActive, paidUntil, daysRemaining, needsPayment } = useSubscription();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });

  useEffect(() => {
    fetchProducts();
    if (organizationId) {
      fetchPurchases();
    }
  }, [organizationId]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("store_products")
        .select("*")
        .eq("is_active", true)
        .order("product_type", { ascending: false });

      if (error) throw error;
      setProducts(data || []);
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
    if (!organizationId) return;

    try {
      const { data, error } = await supabase
        .from("store_purchases")
        .select(`
          *,
          store_products (name)
        `)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setPurchases(data || []);
    } catch (error) {
      console.error("Error fetching purchases:", error);
    }
  };

  const handlePurchase = async (product: Product) => {
    if (!organizationId) {
      toast({
        title: "Erro",
        description: "Organização não encontrada.",
        variant: "destructive",
      });
      return;
    }

    if (currentBalance < product.price) {
      toast({
        title: "Saldo insuficiente",
        description: `Você precisa de ${formatCurrency(product.price)} para comprar este produto. Seu saldo atual é ${formatCurrency(currentBalance)}.`,
        variant: "destructive",
      });
      return;
    }

    setConfirmDialog({ open: true, product });
  };

  const confirmPurchase = async () => {
    const product = confirmDialog.product;
    if (!product || !organizationId) return;

    setPurchasing(product.id);
    setConfirmDialog({ open: false, product: null });

    try {
      const { data, error } = await supabase.rpc("purchase_product", {
        _organization_id: organizationId,
        _product_id: product.id,
      });

      if (error) throw error;

      if (data) {
        toast({
          title: "Compra realizada!",
          description: `${product.name} foi adquirido com sucesso.`,
        });
        fetchPurchases();
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
    if (productName.toLowerCase().includes("api")) return <Zap className="w-6 h-6 text-warning" />;
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
                const canAfford = currentBalance >= product.price;
                const isSubscription = product.product_type === "subscription";
                
                return (
                  <Card key={product.id} className={isSubscription ? "border-primary" : ""}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        {getProductIcon(product.product_type, product.name)}
                        {isSubscription && (
                          <Badge variant="secondary">Mensal</Badge>
                        )}
                      </div>
                      <CardTitle className="mt-2">{product.name}</CardTitle>
                      <CardDescription>{product.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-primary">
                        {formatCurrency(product.price)}
                      </div>
                      {isSubscription && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Renovação mensal usando saldo
                        </p>
                      )}
                    </CardContent>
                    <CardFooter>
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
                            Comprar
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4" />
                            Adicionar Saldo
                          </>
                        )}
                      </Button>
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
        organizationId={organizationId || ""}
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
              Você está prestes a comprar <strong>{confirmDialog.product?.name}</strong> por{" "}
              <strong>{confirmDialog.product ? formatCurrency(confirmDialog.product.price) : ""}</strong>.
              <br /><br />
              O valor será debitado do seu saldo atual de{" "}
              <strong>{formatCurrency(currentBalance)}</strong>.
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
