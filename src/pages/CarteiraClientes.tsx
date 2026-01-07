import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserPlus, Trash2, Users, ArrowRightLeft, BarChart3, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
}

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface PortfolioEntry {
  id: string;
  lead_id: string;
  user_id: string;
  created_at: string;
  lead: Lead;
  owner?: Profile;
}

interface AttendantStats {
  userId: string;
  name: string;
  totalClients: number;
  convertedLeads: number;
  conversionRate: number;
}

export default function CarteiraClientes() {
  const { user } = useAuth();
  const { effectiveOrganizationId: organizationId } = useEffectiveOrganizationId();
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [assignToUserId, setAssignToUserId] = useState<string>("");
  const [transferEntry, setTransferEntry] = useState<PortfolioEntry | null>(null);
  const [transferToUserId, setTransferToUserId] = useState<string>("");

  const canManageAll = isAdmin || isSuperAdmin;

  // Fetch portfolio entries
  const { data: portfolioEntries = [], isLoading: loadingPortfolio } = useQuery({
    queryKey: ['client-portfolio', organizationId, selectedUserId],
    queryFn: async () => {
      if (!organizationId) return [];

      let query = supabase
        .from('client_portfolios')
        .select(`
          id,
          lead_id,
          user_id,
          created_at,
          lead:leads(id, name, phone, email, status)
        `)
        .eq('organization_id', organizationId);

      if (!canManageAll) {
        query = query.eq('user_id', user?.id);
      } else if (selectedUserId !== "all") {
        query = query.eq('user_id', selectedUserId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as PortfolioEntry[];
    },
    enabled: !!organizationId && !roleLoading,
  });

  // Fetch all portfolio entries for stats (admin only)
  const { data: allPortfolioEntries = [] } = useQuery({
    queryKey: ['all-portfolio-stats', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('client_portfolios')
        .select(`
          id,
          lead_id,
          user_id,
          lead:leads(id, status)
        `)
        .eq('organization_id', organizationId);

      if (error) throw error;
      return data as unknown as PortfolioEntry[];
    },
    enabled: !!organizationId && canManageAll,
  });

  // Fetch organization users
  const { data: orgUsers = [] } = useQuery({
    queryKey: ['org-users', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, email')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!organizationId,
  });

  // Fetch available leads
  const { data: availableLeads = [] } = useQuery({
    queryKey: ['available-leads', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data: portfolioLeadIds } = await supabase
        .from('client_portfolios')
        .select('lead_id')
        .eq('organization_id', organizationId);

      const existingLeadIds = portfolioLeadIds?.map(p => p.lead_id) || [];

      let query = supabase
        .from('leads')
        .select('id, name, phone, email')
        .eq('organization_id', organizationId);

      if (existingLeadIds.length > 0) {
        query = query.not('id', 'in', `(${existingLeadIds.join(',')})`);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!organizationId && isAddDialogOpen,
  });

  // Calculate attendant statistics
  const attendantStats: AttendantStats[] = canManageAll ? orgUsers.map(orgUser => {
    const userPortfolio = allPortfolioEntries.filter(e => e.user_id === orgUser.user_id);
    const totalClients = userPortfolio.length;
    const convertedLeads = userPortfolio.filter(e => 
      e.lead?.status === 'converted' || e.lead?.status === 'qualified'
    ).length;
    const conversionRate = totalClients > 0 ? (convertedLeads / totalClients) * 100 : 0;

    return {
      userId: orgUser.user_id,
      name: orgUser.display_name || orgUser.email || 'Usuário',
      totalClients,
      convertedLeads,
      conversionRate,
    };
  }).filter(s => s.totalClients > 0).sort((a, b) => b.totalClients - a.totalClients) : [];

  // Add to portfolio mutation
  const addToPortfolio = useMutation({
    mutationFn: async ({ leadId, userId }: { leadId: string; userId: string }) => {
      const { error } = await supabase
        .from('client_portfolios')
        .insert({
          lead_id: leadId,
          user_id: userId,
          organization_id: organizationId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['available-leads'] });
      queryClient.invalidateQueries({ queryKey: ['all-portfolio-stats'] });
      toast.success("Cliente adicionado à carteira com sucesso!");
      setIsAddDialogOpen(false);
      setSelectedLeadId("");
      setAssignToUserId("");
    },
    onError: (error: any) => {
      toast.error("Erro ao adicionar cliente", { description: error.message });
    },
  });

  // Remove from portfolio mutation
  const removeFromPortfolio = useMutation({
    mutationFn: async (portfolioId: string) => {
      const { error } = await supabase
        .from('client_portfolios')
        .delete()
        .eq('id', portfolioId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['available-leads'] });
      queryClient.invalidateQueries({ queryKey: ['all-portfolio-stats'] });
      toast.success("Cliente removido da carteira!");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover cliente", { description: error.message });
    },
  });

  // Transfer client mutation
  const transferClient = useMutation({
    mutationFn: async ({ portfolioId, newUserId }: { portfolioId: string; newUserId: string }) => {
      const { error } = await supabase
        .from('client_portfolios')
        .update({ user_id: newUserId, updated_at: new Date().toISOString() })
        .eq('id', portfolioId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['all-portfolio-stats'] });
      toast.success("Cliente transferido com sucesso!");
      setIsTransferDialogOpen(false);
      setTransferEntry(null);
      setTransferToUserId("");
    },
    onError: (error: any) => {
      toast.error("Erro ao transferir cliente", { description: error.message });
    },
  });

  const filteredEntries = portfolioEntries.filter((entry) => {
    if (!entry.lead) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      entry.lead.name?.toLowerCase().includes(searchLower) ||
      entry.lead.phone?.includes(searchTerm) ||
      entry.lead.email?.toLowerCase().includes(searchLower)
    );
  });

  const getUserName = (userId: string) => {
    const foundUser = orgUsers.find(u => u.user_id === userId);
    return foundUser?.display_name || foundUser?.email || "Usuário";
  };

  const handleAddToPortfolio = () => {
    if (!selectedLeadId) {
      toast.error("Selecione um cliente");
      return;
    }

    const targetUserId = canManageAll && assignToUserId ? assignToUserId : user?.id;
    
    if (!targetUserId) {
      toast.error("Erro ao identificar usuário");
      return;
    }

    addToPortfolio.mutate({ leadId: selectedLeadId, userId: targetUserId });
  };

  const handleTransfer = () => {
    if (!transferEntry || !transferToUserId) {
      toast.error("Selecione um atendente");
      return;
    }

    transferClient.mutate({ portfolioId: transferEntry.id, newUserId: transferToUserId });
  };

  const openTransferDialog = (entry: PortfolioEntry) => {
    setTransferEntry(entry);
    setTransferToUserId("");
    setIsTransferDialogOpen(true);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Carteira de Clientes</h1>
            <p className="text-muted-foreground">
              Gerencie os clientes atribuídos a cada atendente
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Adicionar Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Cliente à Carteira</DialogTitle>
                <DialogDescription>
                  Selecione um cliente para adicionar à carteira
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLeads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.name} - {lead.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableLeads.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum cliente disponível. Todos já estão em carteiras.
                    </p>
                  )}
                </div>

                {canManageAll && (
                  <div className="space-y-2">
                    <Label>Atribuir para</Label>
                    <Select value={assignToUserId} onValueChange={setAssignToUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um atendente" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgUsers.map((orgUser) => (
                          <SelectItem key={orgUser.user_id} value={orgUser.user_id}>
                            {orgUser.display_name || orgUser.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleAddToPortfolio}
                  disabled={!selectedLeadId || addToPortfolio.isPending}
                >
                  {addToPortfolio.isPending ? "Adicionando..." : "Adicionar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="portfolio" className="space-y-4">
          <TabsList>
            <TabsTrigger value="portfolio" className="gap-2">
              <Users className="w-4 h-4" />
              Carteira
            </TabsTrigger>
            {canManageAll && (
              <TabsTrigger value="report" className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Relatório
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="portfolio" className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Meus Clientes</CardDescription>
                  <CardTitle className="text-2xl">
                    {portfolioEntries.filter(e => e.user_id === user?.id).length}
                  </CardTitle>
                </CardHeader>
              </Card>
              {canManageAll && (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total na Organização</CardDescription>
                      <CardTitle className="text-2xl">{allPortfolioEntries.length}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Atendentes com Carteira</CardDescription>
                      <CardTitle className="text-2xl">
                        {new Set(allPortfolioEntries.map(e => e.user_id)).size}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </>
              )}
            </div>

            {/* Client Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Clientes na Carteira
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Buscar por nome, telefone ou email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {canManageAll && (
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Filtrar por atendente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os atendentes</SelectItem>
                        {orgUsers.map((orgUser) => (
                          <SelectItem key={orgUser.user_id} value={orgUser.user_id}>
                            {orgUser.display_name || orgUser.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {loadingPortfolio ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum cliente encontrado na carteira
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Email</TableHead>
                          {canManageAll && <TableHead>Responsável</TableHead>}
                          <TableHead>Adicionado em</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">
                              {entry.lead?.name || "—"}
                            </TableCell>
                            <TableCell>{entry.lead?.phone || "—"}</TableCell>
                            <TableCell>{entry.lead?.email || "—"}</TableCell>
                            {canManageAll && (
                              <TableCell>
                                <Badge variant="secondary">
                                  {getUserName(entry.user_id)}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell>
                              {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {canManageAll && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openTransferDialog(entry)}
                                    title="Transferir cliente"
                                  >
                                    <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeFromPortfolio.mutate(entry.id)}
                                  disabled={removeFromPortfolio.isPending}
                                  title="Remover da carteira"
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canManageAll && (
            <TabsContent value="report" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Desempenho por Atendente
                  </CardTitle>
                  <CardDescription>
                    Análise de clientes na carteira e taxa de conversão
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {attendantStats.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum atendente possui clientes na carteira ainda.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Atendente</TableHead>
                            <TableHead className="text-center">Clientes na Carteira</TableHead>
                            <TableHead className="text-center">Leads Convertidos</TableHead>
                            <TableHead className="text-center">Taxa de Conversão</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {attendantStats.map((stat) => (
                            <TableRow key={stat.userId}>
                              <TableCell className="font-medium">{stat.name}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{stat.totalClients}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="default">{stat.convertedLeads}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge 
                                  variant={stat.conversionRate >= 50 ? "default" : stat.conversionRate >= 25 ? "secondary" : "outline"}
                                  className={stat.conversionRate >= 50 ? "bg-green-500" : ""}
                                >
                                  {stat.conversionRate.toFixed(1)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total de Clientes</CardDescription>
                    <CardTitle className="text-2xl">{allPortfolioEntries.length}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Leads Convertidos</CardDescription>
                    <CardTitle className="text-2xl">
                      {allPortfolioEntries.filter(e => 
                        e.lead?.status === 'converted' || e.lead?.status === 'qualified'
                      ).length}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Taxa Média de Conversão</CardDescription>
                    <CardTitle className="text-2xl">
                      {attendantStats.length > 0 
                        ? (attendantStats.reduce((acc, s) => acc + s.conversionRate, 0) / attendantStats.length).toFixed(1)
                        : 0}%
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Atendentes Ativos</CardDescription>
                    <CardTitle className="text-2xl">{attendantStats.length}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Transfer Dialog */}
        <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5" />
                Transferir Cliente
              </DialogTitle>
              <DialogDescription>
                Transfira este cliente para outro atendente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {transferEntry && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">{transferEntry.lead?.name}</p>
                  <p className="text-sm text-muted-foreground">{transferEntry.lead?.phone}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Atual: {getUserName(transferEntry.user_id)}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Transferir para</Label>
                <Select value={transferToUserId} onValueChange={setTransferToUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o novo responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgUsers
                      .filter(u => u.user_id !== transferEntry?.user_id)
                      .map((orgUser) => (
                        <SelectItem key={orgUser.user_id} value={orgUser.user_id}>
                          {orgUser.display_name || orgUser.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleTransfer}
                disabled={!transferToUserId || transferClient.isPending}
              >
                {transferClient.isPending ? "Transferindo..." : "Transferir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
