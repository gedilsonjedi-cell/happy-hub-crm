import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CreditCard,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  Package,
  Users,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Transaction {
  id: string;
  organization_id: string;
  organization_name?: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

const transactionTypeConfig: Record<string, { label: string; icon: typeof CreditCard; className: string }> = {
  credit: { label: "Crédito", icon: TrendingUp, className: "text-green-500 bg-green-500/10" },
  debit: { label: "Débito", icon: TrendingDown, className: "text-red-500 bg-red-500/10" },
  subscription_renewal: { label: "Renovação", icon: Calendar, className: "text-blue-500 bg-blue-500/10" },
  subscription_payment: { label: "Assinatura", icon: CreditCard, className: "text-primary bg-primary/10" },
  pix_payment: { label: "PIX", icon: CreditCard, className: "text-green-500 bg-green-500/10" },
  addon_purchase: { label: "Add-on", icon: Package, className: "text-purple-500 bg-purple-500/10" },
  product_purchase: { label: "Produto", icon: Package, className: "text-purple-500 bg-purple-500/10" },
  manual_credit: { label: "Crédito Manual", icon: TrendingUp, className: "text-green-500 bg-green-500/10" },
  manual_adjustment: { label: "Ajuste Manual", icon: RefreshCw, className: "text-yellow-500 bg-yellow-500/10" },
};

export function PaymentHistoryPanel() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stats, setStats] = useState({
    totalCredits: 0,
    totalDebits: 0,
    transactionsToday: 0,
    transactionsThisMonth: 0,
  });

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      // Fetch transactions with organization names
      const { data: transactionsData, error: transactionsError } = await supabase
        .from("balance_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (transactionsError) {
        console.error("Error fetching transactions:", transactionsError);
        toast.error("Erro ao carregar transações");
        return;
      }

      // Fetch organization names
      const orgIds = [...new Set(transactionsData?.map(t => t.organization_id) || [])];
      const { data: orgsData } = await supabase
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);

      const orgMap = new Map(orgsData?.map(o => [o.id, o.name]) || []);

      const enrichedTransactions = (transactionsData || []).map(t => ({
        ...t,
        organization_name: orgMap.get(t.organization_id) || "Desconhecido",
      }));

      setTransactions(enrichedTransactions);

      // Calculate stats
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const totalCredits = enrichedTransactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      
      const totalDebits = enrichedTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const transactionsToday = enrichedTransactions.filter(t => 
        new Date(t.created_at) >= startOfDay
      ).length;

      const transactionsThisMonth = enrichedTransactions.filter(t => 
        new Date(t.created_at) >= startOfMonth
      ).length;

      setStats({
        totalCredits,
        totalDebits,
        transactionsToday,
        transactionsThisMonth,
      });
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = 
      t.organization_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.type.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === "all" || t.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const getTypeConfig = (type: string) => {
    return transactionTypeConfig[type] || { 
      label: type, 
      icon: CreditCard, 
      className: "text-muted-foreground bg-muted" 
    };
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Créditos
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              R$ {stats.totalCredits.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Débitos
            </CardTitle>
            <TrendingDown className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              R$ {stats.totalDebits.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transações Hoje
            </CardTitle>
            <Clock className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.transactionsToday}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Este Mês
            </CardTitle>
            <Calendar className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.transactionsThisMonth}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Histórico de Pagamentos
          </CardTitle>
          <CardDescription>
            Todas as transações financeiras dos clientes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente ou descrição..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="credit">Crédito</SelectItem>
                <SelectItem value="debit">Débito</SelectItem>
                <SelectItem value="subscription_renewal">Renovação</SelectItem>
                <SelectItem value="subscription_payment">Assinatura</SelectItem>
                <SelectItem value="pix_payment">PIX</SelectItem>
                <SelectItem value="addon_purchase">Add-on</SelectItem>
                <SelectItem value="product_purchase">Produto</SelectItem>
                <SelectItem value="manual_credit">Crédito Manual</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchTransactions} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Saldo Após</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Carregando...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma transação encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction) => {
                    const config = getTypeConfig(transaction.type);
                    const TypeIcon = config.icon;
                    const isPositive = transaction.amount > 0;

                    return (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {format(new Date(transaction.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(transaction.created_at), "HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{transaction.organization_name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`gap-1 ${config.className}`}>
                            <TypeIcon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground max-w-xs truncate block">
                            {transaction.description || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium ${isPositive ? "text-green-500" : "text-red-500"}`}>
                            {isPositive ? "+" : ""}R$ {Math.abs(transaction.amount).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-muted-foreground">
                            R$ {transaction.balance_after.toFixed(2)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {filteredTransactions.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Mostrando {filteredTransactions.length} transações
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
