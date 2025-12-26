import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationBalance } from "@/hooks/useOrganizationBalance";
import { PixPaymentDialog } from "@/components/payment/PixPaymentDialog";
import { toast } from "@/hooks/use-toast";
import { Crown, Sparkles, CreditCard, Wallet } from "lucide-react";

interface PremiumFeaturePaywallProps {
  open: boolean;
  productName: string;
  onClose: () => void;
  onPurchased?: () => void;
  redirectOnClose?: string;
}

export function PremiumFeaturePaywall({
  open,
  productName,
  onClose,
  onPurchased,
  redirectOnClose = "/",
}: PremiumFeaturePaywallProps) {
  const navigate = useNavigate();
  const { currentBalance, organizationId } = useOrganizationBalance();
  const [product, setProduct] = useState<{
    id: string;
    name: string;
    description: string | null;
    price: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);

  // Fetch product info when dialog opens
  useState(() => {
    if (open && productName) {
      fetchProduct();
    }
  });

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("store_products")
        .select("id, name, description, price")
        .ilike("name", `%${productName}%`)
        .eq("product_type", "addon")
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      setProduct(data);
    } catch (error) {
      console.error("Error fetching product:", error);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when dialog opens
  if (open && !product && !loading) {
    fetchProduct();
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const canAfford = product ? currentBalance >= product.price : false;

  const handlePurchase = async () => {
    if (!product || !organizationId) return;

    if (!canAfford) {
      setPixDialogOpen(true);
      return;
    }

    setPurchasing(true);
    try {
      const { data, error } = await supabase.rpc("purchase_product", {
        _organization_id: organizationId,
        _product_id: product.id,
        _quantity: 1,
      });

      if (error) throw error;

      if (data) {
        toast({
          title: "Recurso ativado!",
          description: `${product.name} foi ativado com sucesso.`,
        });
        onPurchased?.();
        onClose();
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
      setPurchasing(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) {
          navigate(redirectOnClose);
          onClose();
        }
      }}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Crown className="w-8 h-8 text-primary" />
            </div>
            <DialogTitle className="text-xl text-center">Recurso Premium</DialogTitle>
            <DialogDescription className="text-center">
              Este é um recurso exclusivo que requer uma assinatura adicional.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              Carregando...
            </div>
          ) : product ? (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{product.name}</h3>
                    <Badge variant="outline" className="text-xs mt-1">
                      Add-on Mensal
                    </Badge>
                  </div>
                </div>
                
                {product.description && (
                  <p className="text-sm text-muted-foreground">
                    {product.description}
                  </p>
                )}

                <div className="pt-2 border-t">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">Valor mensal:</span>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-primary">
                        {formatCurrency(product.price)}
                      </span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cobrado mensalmente junto com sua assinatura
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm bg-background border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Seu saldo:</span>
                </div>
                <span className={`font-semibold ${canAfford ? "text-green-600" : "text-destructive"}`}>
                  {formatCurrency(currentBalance)}
                </span>
              </div>

              {!canAfford && (
                <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3 text-center">
                  Saldo insuficiente. Adicione créditos para ativar este recurso.
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Produto não encontrado.
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {product && (
              <>
                {canAfford ? (
                  <Button
                    onClick={handlePurchase}
                    disabled={purchasing}
                    className="w-full gap-2"
                  >
                    {purchasing ? (
                      "Processando..."
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Ativar {product.name}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => setPixDialogOpen(true)}
                    className="w-full gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    Adicionar Saldo via PIX
                  </Button>
                )}
              </>
            )}
            <Button variant="ghost" onClick={() => {
              navigate(redirectOnClose);
              onClose();
            }} className="w-full">
              Voltar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {organizationId && (
        <PixPaymentDialog
          open={pixDialogOpen}
          onOpenChange={setPixDialogOpen}
          organizationId={organizationId}
        />
      )}
    </>
  );
}
