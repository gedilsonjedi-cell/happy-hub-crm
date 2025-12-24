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
import { Search, Plus, UserPlus, Trash2, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
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

export default function CarteiraClientes() {
  const { user } = useAuth();
  const { organizationId, isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [assignToUserId, setAssignToUserId] = useState<string>("");

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
          lead:leads(id, name, phone, email)
        `)
        .eq('organization_id', organizationId);

      // If not admin, only show own portfolio
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

  // Fetch organization users for filter and assignment
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
    enabled: !!organizationId && canManageAll,
  });

  // Fetch available leads (not yet in any portfolio)
  const { data: availableLeads = [] } = useQuery({
    queryKey: ['available-leads', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      // Get leads that are not in any portfolio
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
      toast.success("Cliente adicionado à carteira com sucesso!");
      setIsAddDialogOpen(false);
      setSelectedLeadId("");
      setAssignToUserId("");
    },
    onError: (error: any) => {
      toast.error("Erro ao adicionar cliente", {
        description: error.message,
      });
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
      toast.success("Cliente removido da carteira!");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover cliente", {
        description: error.message,
      });
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
                  <CardTitle className="text-2xl">{portfolioEntries.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Atendentes com Carteira</CardDescription>
                  <CardTitle className="text-2xl">
                    {new Set(portfolioEntries.map(e => e.user_id)).size}
                  </CardTitle>
                </CardHeader>
              </Card>
            </>
          )}
        </div>

        {/* Filters */}
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromPortfolio.mutate(entry.id)}
                            disabled={removeFromPortfolio.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
