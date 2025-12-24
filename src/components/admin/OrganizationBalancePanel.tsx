import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOrganizationBalance } from "@/hooks/useOrganizationBalance";
import { Wallet, Plus, ArrowUpRight, ArrowDownRight, Clock, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OrganizationBalancePanelProps {
  organizationId: string;
  organizationName?: string;
  showAddCredits?: boolean;
}

export function OrganizationBalancePanel({
  organizationId,
  organizationName,
  showAddCredits = true,
}: OrganizationBalancePanelProps) {
  const { 
    balance, 
    transactions, 
    isLoading, 
    addCredits, 
    isAddingCredits,
    currentBalance 
  } = useOrganizationBalance(organizationId);
  
  const [creditAmount, setCreditAmount] = useState("");
  const [description, setDescription] = useState("");

  const handleAddCredits = () => {
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    addCredits({
      amount,
      description: description || `Créditos adicionados manualmente`,
      referenceType: "manual",
    });
    
    setCreditAmount("");
    setDescription("");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Saldo de Créditos
              </CardTitle>
              {organizationName && (
                <CardDescription>{organizationName}</CardDescription>
              )}
            </div>
            <Badge variant={currentBalance > 0 ? "default" : "destructive"}>
              {currentBalance > 0 ? "Ativo" : "Sem saldo"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 rounded-lg bg-primary/10">
              <p className="text-sm text-muted-foreground">Saldo Atual</p>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(currentBalance)}
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-green-500/10">
              <p className="text-sm text-muted-foreground">Total Creditado</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(balance?.total_credits_added ?? 0)}
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-red-500/10">
              <p className="text-sm text-muted-foreground">Total Gasto</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(balance?.total_spent ?? 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Credits Form */}
      {showAddCredits && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-4 w-4" />
              Adicionar Créditos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="credit-amount">Valor (R$)</Label>
                <Input
                  id="credit-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  placeholder="Ex: Recarga via Pix"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={1}
                />
              </div>
            </div>
            <Button 
              onClick={handleAddCredits} 
              className="mt-4"
              disabled={isAddingCredits || !creditAmount || parseFloat(creditAmount) <= 0}
            >
              {isAddingCredits ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Adicionar Créditos
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Transactions History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-4 w-4" />
            Histórico de Transações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        transaction.type === "credit" 
                          ? "bg-green-500/10" 
                          : "bg-red-500/10"
                      }`}>
                        {transaction.type === "credit" ? (
                          <ArrowDownRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {transaction.description || (
                            transaction.type === "credit" 
                              ? "Crédito adicionado" 
                              : "Débito"
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(transaction.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        {transaction.reference_type && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {transaction.reference_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${
                        transaction.type === "credit" 
                          ? "text-green-600" 
                          : "text-red-600"
                      }`}>
                        {transaction.type === "credit" ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Saldo: {formatCurrency(transaction.balance_after)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma transação encontrada
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
