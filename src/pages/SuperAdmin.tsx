import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Building2, 
  Users, 
  CreditCard, 
  DollarSign, 
  Settings,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  TrendingUp,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { DispatchPricingConfig } from "@/components/admin/DispatchPricingConfig";

interface Organization {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  plan: string;
  subscription_status: string;
  max_users: number;
  max_channels: number;
  created_at: string;
  user_count?: number;
}

const planConfig: Record<string, { label: string; className: string }> = {
  free: { label: "Free", className: "bg-muted text-muted-foreground" },
  starter: { label: "Starter", className: "bg-blue-500/10 text-blue-500" },
  professional: { label: "Professional", className: "bg-primary/10 text-primary" },
  enterprise: { label: "Enterprise", className: "bg-warning/10 text-warning" },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-green-500/10 text-green-500" },
  trial: { label: "Trial", className: "bg-blue-500/10 text-blue-500" },
  past_due: { label: "Atrasada", className: "bg-warning/10 text-warning" },
  canceled: { label: "Cancelada", className: "bg-destructive/10 text-destructive" },
};

export default function SuperAdmin() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: roleLoading, role } = useUserRole();
  const navigate = useNavigate();
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewOrgDialogOpen, setIsNewOrgDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgPlan, setNewOrgPlan] = useState("free");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    // Only redirect after role has been fully loaded and confirmed not super_admin
    // Also check that role is explicitly not super_admin (not just null during loading)
    if (!roleLoading && role !== null && !isSuperAdmin) {
      navigate("/");
    }
  }, [roleLoading, isSuperAdmin, role, navigate]);

  useEffect(() => {
    if (user && isSuperAdmin) {
      fetchOrganizations();
    }
  }, [user, isSuperAdmin]);

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching organizations:", error);
        toast.error("Erro ao carregar organizações");
        return;
      }

      // Get user counts per organization
      const { data: profileCounts } = await supabase
        .from("profiles")
        .select("organization_id");

      const countMap: Record<string, number> = {};
      (profileCounts || []).forEach((p) => {
        if (p.organization_id) {
          countMap[p.organization_id] = (countMap[p.organization_id] || 0) + 1;
        }
      });

      setOrganizations((data || []).map((org) => ({
        ...org,
        user_count: countMap[org.id] || 0,
      })));
    } catch (err) {
      console.error("Error fetching organizations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.from("organizations").insert({
        name: newOrgName.trim(),
        slug: newOrgSlug.trim().toLowerCase().replace(/\s+/g, "-"),
        plan: newOrgPlan,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("Já existe uma organização com esse slug");
        } else {
          toast.error("Erro ao criar organização");
        }
        return;
      }

      toast.success("Organização criada com sucesso!");
      setIsNewOrgDialogOpen(false);
      setNewOrgName("");
      setNewOrgSlug("");
      setNewOrgPlan("free");
      fetchOrganizations();
    } catch (err) {
      console.error("Error creating organization:", err);
      toast.error("Erro ao criar organização");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleOrgStatus = async (org: Organization) => {
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ is_active: !org.is_active })
        .eq("id", org.id);

      if (error) {
        toast.error("Erro ao atualizar status");
        return;
      }

      toast.success(org.is_active ? "Organização desativada" : "Organização ativada");
      fetchOrganizations();
    } catch (err) {
      console.error("Error toggling org status:", err);
    }
  };

  const handleDeleteOrganization = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta organização? Esta ação não pode ser desfeita.")) {
      return;
    }

    try {
      const { error } = await supabase.from("organizations").delete().eq("id", id);

      if (error) {
        toast.error("Erro ao excluir organização");
        return;
      }

      toast.success("Organização excluída");
      fetchOrganizations();
    } catch (err) {
      console.error("Error deleting organization:", err);
    }
  };

  const filteredOrganizations = organizations.filter((org) =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeOrgs = organizations.filter((o) => o.is_active).length;
  const totalUsers = organizations.reduce((acc, o) => acc + (o.user_count || 0), 0);

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive flex items-center justify-center">
            <Settings className="w-5 h-5 text-destructive-foreground" />
          </div>
          <div>
            <span className="text-lg font-bold text-foreground">Super Admin</span>
            <p className="text-xs text-muted-foreground">Painel do Desenvolvedor</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          Voltar ao Sistema
        </Button>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Clientes
              </CardTitle>
              <Building2 className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{organizations.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Clientes Ativos
              </CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeOrgs}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Usuários
              </CardTitle>
              <Users className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Receita Mensal
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ 0,00</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="clients" className="space-y-4">
          <TabsList>
            <TabsTrigger value="clients" className="gap-2">
              <Building2 className="w-4 h-4" />
              Clientes
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-2">
              <DollarSign className="w-4 h-4" />
              Preços de Disparo
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              Configurações
            </TabsTrigger>
          </TabsList>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar clientes..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button onClick={() => setIsNewOrgDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Cliente
              </Button>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrganizations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum cliente encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrganizations.map((org) => (
                      <TableRow key={org.id} className={!org.is_active ? "opacity-50" : ""}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{org.name}</p>
                            <p className="text-sm text-muted-foreground">{org.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={planConfig[org.plan]?.className || ""}>
                            {planConfig[org.plan]?.label || org.plan}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig[org.subscription_status]?.className || ""}>
                            {statusConfig[org.subscription_status]?.label || org.subscription_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {org.user_count} / {org.max_users}
                        </TableCell>
                        <TableCell>
                          {new Date(org.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                className="gap-2"
                                onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                              >
                                <Eye className="w-4 h-4" />
                                Ver detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2">
                                <Edit className="w-4 h-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => handleToggleOrgStatus(org)}
                              >
                                {org.is_active ? (
                                  <>
                                    <XCircle className="w-4 h-4" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4" />
                                    Ativar
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 text-destructive"
                                onClick={() => handleDeleteOrganization(org.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing">
            <DispatchPricingConfig />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Configurações do Sistema</CardTitle>
                <CardDescription>
                  Configurações gerais do sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Em breve: configurações de email, integrações, etc.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* New Organization Dialog */}
        <Dialog open={isNewOrgDialogOpen} onOpenChange={setIsNewOrgDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>
                Cadastre uma nova organização/cliente no sistema
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Empresa</Label>
                <Input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Empresa XYZ"
                />
              </div>
              <div className="space-y-2">
                <Label>Slug (identificador único)</Label>
                <Input
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value)}
                  placeholder="empresa-xyz"
                />
                <p className="text-xs text-muted-foreground">
                  Usado para identificar a organização no sistema
                </p>
              </div>
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={newOrgPlan} onValueChange={setNewOrgPlan}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewOrgDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateOrganization} disabled={isCreating}>
                {isCreating ? "Criando..." : "Criar Cliente"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
