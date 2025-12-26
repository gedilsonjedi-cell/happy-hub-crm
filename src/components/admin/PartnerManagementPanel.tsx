import { useState, useEffect } from "react";
import { 
  Gift, 
  Plus, 
  Loader2,
  Package,
  Users,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StoreProduct {
  id: string;
  name: string;
  price: number;
  product_type: string;
  is_active: boolean;
}

interface PartnerManagementPanelProps {
  organizationId: string;
  organizationName: string;
  isPartner: boolean;
  onPartnerStatusChange: () => void;
}

export function PartnerManagementPanel({ 
  organizationId, 
  organizationName,
  isPartner, 
  onPartnerStatusChange 
}: PartnerManagementPanelProps) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [isFree, setIsFree] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [togglingPartner, setTogglingPartner] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("store_products")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePartner = async () => {
    setTogglingPartner(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ 
          is_partner: !isPartner,
          // If becoming a partner, set status to active
          ...((!isPartner) ? { subscription_status: "active" } : {})
        })
        .eq("id", organizationId);

      if (error) throw error;

      toast.success(isPartner ? "Status de parceiro removido" : "Organização definida como parceira");
      onPartnerStatusChange();
    } catch (error) {
      console.error("Error toggling partner status:", error);
      toast.error("Erro ao alterar status de parceiro");
    } finally {
      setTogglingPartner(false);
    }
  };

  const handleAddProduct = async () => {
    if (!selectedProductId) {
      toast.error("Selecione um produto");
      return;
    }

    setIsAdding(true);
    try {
      const { error } = await supabase.rpc("admin_add_product_to_organization", {
        _organization_id: organizationId,
        _product_id: selectedProductId,
        _quantity: quantity,
        _is_free: isFree,
      });

      if (error) throw error;

      toast.success("Produto adicionado com sucesso!");
      setIsAddProductDialogOpen(false);
      setSelectedProductId("");
      setQuantity(1);
      setIsFree(true);
      onPartnerStatusChange();
    } catch (error) {
      console.error("Error adding product:", error);
      toast.error("Erro ao adicionar produto");
    } finally {
      setIsAdding(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const totalPrice = selectedProduct ? selectedProduct.price * quantity : 0;

  const getProductIcon = (product: StoreProduct) => {
    if (product.name.toLowerCase().includes("usuário")) return Users;
    if (product.name.toLowerCase().includes("canal") || product.name.toLowerCase().includes("whatsapp")) return MessageSquare;
    return Package;
  };

  return (
    <Card className={isPartner ? "border-primary/50 bg-primary/5" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isPartner ? "bg-primary/20" : "bg-muted"}`}>
              <Gift className={`w-5 h-5 ${isPartner ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div>
              <CardTitle className="text-lg">Plano de Parceria</CardTitle>
              <CardDescription>
                {isPartner 
                  ? "Este cliente é um parceiro e não paga assinatura automática" 
                  : "Ative para que este cliente seja um parceiro"}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {isPartner ? "Parceiro ativo" : "Cliente regular"}
            </span>
            <Switch 
              checked={isPartner} 
              onCheckedChange={handleTogglePartner}
              disabled={togglingPartner}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPartner && (
          <>
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <h4 className="font-medium text-primary mb-2">Benefícios do Parceiro</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Sem cobrança automática de assinatura mensal</li>
                <li>• Só paga por recursos adicionais comprados</li>
                <li>• Recursos podem ser adicionados gratuitamente pelo admin</li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <h4 className="font-medium">Adicionar Recursos Manualmente</h4>
                <p className="text-sm text-muted-foreground">
                  Adicione produtos da loja gratuitamente ou com cobrança
                </p>
              </div>
              <Button onClick={() => setIsAddProductDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Adicionar Produto
              </Button>
            </div>
          </>
        )}
      </CardContent>

      {/* Add Product Dialog */}
      <Dialog open={isAddProductDialogOpen} onOpenChange={setIsAddProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Produto</DialogTitle>
            <DialogDescription>
              Adicione um produto da loja para {organizationName}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => {
                      const Icon = getProductIcon(product);
                      return (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            <span>{product.name}</span>
                            <span className="text-muted-foreground">
                              - R$ {product.price.toFixed(2)}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Switch 
                    id="is-free" 
                    checked={isFree} 
                    onCheckedChange={setIsFree}
                  />
                  <Label htmlFor="is-free" className="cursor-pointer">
                    {isFree ? "Gratuito (cortesia)" : "Cobrar do saldo"}
                  </Label>
                </div>
                {selectedProduct && (
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {isFree ? "Sem cobrança" : "Valor total:"}
                    </p>
                    <p className={`font-bold ${isFree ? "text-green-500" : "text-primary"}`}>
                      {isFree ? "R$ 0,00" : `R$ ${totalPrice.toFixed(2)}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddProductDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddProduct} disabled={isAdding || !selectedProductId}>
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
