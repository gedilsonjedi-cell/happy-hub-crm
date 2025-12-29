import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  CreditCard,
  History,
  AlertCircle,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  QrCode
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PixPaymentDialog } from "@/components/payment/PixPaymentDialog";
import { AutoRechargeConfig } from "@/components/payment/AutoRechargeConfig";

interface BalanceData {
  balance: number;
  total_credits_added: number;
  total_spent: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference_type: string | null;
  created_at: string;
}

export default function Saldo() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const transactionsPerPage = 5;

  useEffect(() => {
    if (user) {
      fetchOrganizationAndBalance();
    }
  }, [user]);

  const fetchOrganizationAndBalance = async () => {
    try {
      // Get user's organization
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .single();

      if (profileError || !profile?.organization_id) {
        console.error("Error fetching profile:", profileError);
        setLoading(false);
        return;
      }

      setOrganizationId(profile.organization_id);

      // Fetch balance
      const { data: balanceData, error: balanceError } = await supabase
        .from("organization_balance")
        .select("balance, total_credits_added, total_spent")
        .eq("organization_id", profile.organization_id)
        .single();

      if (balanceError && balanceError.code !== "PGRST116") {
        console.error("Error fetching balance:", balanceError);
      } else {
        setBalance(balanceData || { balance: 0, total_credits_added: 0, total_spent: 0 });
      }

      // Fetch transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from("balance_transactions")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (transactionsError) {
        console.error("Error fetching transactions:", transactionsError);
      } else {
        setTransactions(transactionsData || []);
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPixDialog = () => {
    setPixDialogOpen(true);
  };

  const handlePaymentCreated = () => {
    fetchOrganizationAndBalance();
  };

  const formatCurrency = (value: number, forceDecimals = false) => {
    // For small values (less than 0.01), show more decimal places
    if (forceDecimals || (value > 0 && value < 0.01)) {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(value);
    }
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getTransactionIcon = (type: string) => {
    return type === "credit" ? (
      <ArrowUpRight className="w-4 h-4 text-green-500" />
    ) : (
      <ArrowDownRight className="w-4 h-4 text-red-500" />
    );
  };

  const getTransactionBadge = (type: string) => {
    return type === "credit" ? (
      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
        Crédito
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
        Débito
      </Badge>
    );
  };

  const getBalanceStatus = () => {
    if (!balance) return { color: "text-muted-foreground", message: "Sem saldo" };
    if (balance.balance <= 0) return { color: "text-destructive", message: "Saldo zerado" };
    if (balance.balance < 10) return { color: "text-yellow-500", message: "Saldo baixo" };
    return { color: "text-green-500", message: "Saldo disponível" };
  };

  const status = getBalanceStatus();

  // Pagination logic
  const totalPages = Math.ceil(transactions.length / transactionsPerPage);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * transactionsPerPage,
    currentPage * transactionsPerPage
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meu Saldo</h1>
            <p className="text-muted-foreground">
              Gerencie seus créditos e visualize o histórico de transações
            </p>
          </div>
          <Button onClick={handleOpenPixDialog} className="gap-2">
            <CreditCard className="w-4 h-4" />
            Adicionar Créditos
          </Button>
        </div>

        {/* PIX Payment Dialog */}
        {organizationId && (
          <PixPaymentDialog
            open={pixDialogOpen}
            onOpenChange={setPixDialogOpen}
            organizationId={organizationId}
            onPaymentCreated={handlePaymentCreated}
          />
        )}

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Current Balance */}
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Saldo Atual
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="space-y-1">
                  <p className={`text-3xl font-bold ${status.color}`}>
                    {formatCurrency(balance?.balance || 0)}
                  </p>
                  <p className={`text-sm ${status.color}`}>{status.message}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Credits */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                Total de Créditos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-green-500">
                    {formatCurrency(balance?.total_credits_added || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Adicionados</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Spent */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                Total Gasto
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-red-500">
                    {formatCurrency(balance?.total_spent || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Em mensagens</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Low Balance Warning */}
        {balance && balance.balance < 10 && balance.balance > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
                <div>
                  <p className="font-medium text-yellow-600">Saldo baixo</p>
                  <p className="text-sm text-muted-foreground">
                    Seu saldo está baixo. Considere adicionar mais créditos para continuar trocando mensagens.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Zero Balance Warning */}
        {balance && balance.balance <= 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Saldo insuficiente</p>
                  <p className="text-sm text-muted-foreground">
                    Você não possui saldo para trocar mensagens. Adicione créditos para continuar.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auto Recharge Config - Above Transaction History */}
        {organizationId && user?.email && (
          <AutoRechargeConfig 
            organizationId={organizationId} 
            userEmail={user.email} 
          />
        )}

        {/* Transaction History with Pagination */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="w-5 h-5" />
              Histórico de Transações
            </CardTitle>
            <CardDescription>
              {transactions.length > 0 
                ? `Mostrando ${Math.min(transactionsPerPage, paginatedTransactions.length)} de ${transactions.length} transações`
                : "Suas transações aparecerão aqui"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhuma transação encontrada</p>
                <p className="text-sm">As transações aparecerão aqui quando você adicionar créditos ou trocar mensagens</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Saldo Após</TableHead>
                        <TableHead className="text-right">Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTransactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTransactionIcon(transaction.type)}
                              {getTransactionBadge(transaction.type)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {transaction.description || 
                                (transaction.type === "credit" ? "Adição de créditos" : "Troca de mensagens")}
                            </span>
                            {transaction.reference_type && (
                              <span className="text-xs text-muted-foreground block">
                                {transaction.reference_type}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={transaction.type === "credit" ? "text-green-500" : "text-red-500"}>
                              {transaction.type === "credit" ? "+" : "-"}
                              {formatCurrency(transaction.amount)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(transaction.balance_after)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {format(new Date(transaction.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="w-5 h-5" />
              Informações de Cobrança
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Marketing</p>
                <p className="text-lg font-semibold">R$ 0,007 / mensagem</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Utilitário</p>
                <p className="text-lg font-semibold">R$ 0,007 / mensagem</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Serviço</p>
                <p className="text-lg font-semibold">R$ 0,007 / mensagem</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              * O valor é debitado automaticamente do seu saldo a cada mensagem enviada com sucesso.
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
