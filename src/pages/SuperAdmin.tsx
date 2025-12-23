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
  Activity,
  Copy,
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
import { SubscriptionPricingConfig } from "@/components/admin/SubscriptionPricingConfig";

interface SubscriptionPricing {
  base_price: number;
  price_per_user: number;
  price_per_channel: number;
  included_users: number;
  included_channels: number;
}

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
  channel_count?: number;
  monthly_cost?: number;
}

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
  const [newOrgMaxUsers, setNewOrgMaxUsers] = useState(1);
  const [newOrgMaxChannels, setNewOrgMaxChannels] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  
  // New client admin fields
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  
  // Edit dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgMaxUsers, setEditOrgMaxUsers] = useState(1);
  const [editOrgMaxChannels, setEditOrgMaxChannels] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  
  // Subscription pricing
  const [subscriptionPricing, setSubscriptionPricing] = useState<SubscriptionPricing | null>(null);

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
      fetchSubscriptionPricing();
    }
  }, [user, isSuperAdmin]);

  const fetchSubscriptionPricing = async () => {
    const { data, error } = await supabase
      .from("subscription_pricing")
      .select("*")
      .single();
    
    if (!error && data) {
      setSubscriptionPricing(data);
    }
  };

  const calculateMonthlyCost = (maxUsers: number, maxChannels: number) => {
    if (!subscriptionPricing) return 0;
    const extraUsers = Math.max(0, maxUsers - subscriptionPricing.included_users);
    const extraChannels = Math.max(0, maxChannels - subscriptionPricing.included_channels);
    return subscriptionPricing.base_price + 
      (extraUsers * subscriptionPricing.price_per_user) + 
      (extraChannels * subscriptionPricing.price_per_channel);
  };

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

  const generateSecurePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    const array = new Uint32Array(12);
    crypto.getRandomValues(array);
    return Array.from(array, (x) => chars[x % chars.length]).join("");
  };

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      toast.error("Preencha o nome e slug da empresa");
      return;
    }

    if (!adminName.trim() || !adminEmail.trim()) {
      toast.error("Preencha o nome e email do administrador");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(adminEmail)) {
      toast.error("Email inválido");
      return;
    }

    setIsCreating(true);
    try {
      // 1. Create organization first
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: newOrgName.trim(),
          slug: newOrgSlug.trim().toLowerCase().replace(/\s+/g, "-"),
          plan: newOrgPlan,
          max_users: newOrgMaxUsers,
          max_channels: newOrgMaxChannels,
        })
        .select()
        .single();

      if (orgError) {
        if (orgError.code === "23505") {
          toast.error("Já existe uma organização com esse slug");
        } else {
          toast.error("Erro ao criar organização");
          console.error("Error creating organization:", orgError);
        }
        return;
      }

      // 2. Generate temporary password
      const tempPassword = generateSecurePassword();

      // 3. Create admin user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: adminEmail.trim(),
        password: tempPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            display_name: adminName.trim(),
          },
        },
      });

      if (authError) {
        // Rollback: delete the organization
        await supabase.from("organizations").delete().eq("id", orgData.id);
        toast.error(`Erro ao criar usuário: ${authError.message}`);
        return;
      }

      if (!authData.user) {
        await supabase.from("organizations").delete().eq("id", orgData.id);
        toast.error("Erro ao criar usuário");
        return;
      }

      // 4. Wait a moment for the profile trigger to run
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 5. Update profile with organization_id and additional data
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          organization_id: orgData.id,
          display_name: adminName.trim(),
        })
        .eq("user_id", authData.user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }

      // 6. Create admin role for the user
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          role: "admin",
        });

      if (roleError) {
        console.error("Error creating role:", roleError);
      }

      // Show success with credentials
      setGeneratedPassword(tempPassword);
      setShowCredentials(true);
      toast.success("Cliente e usuário admin criados com sucesso!");
      fetchOrganizations();
    } catch (err) {
      console.error("Error creating organization:", err);
      toast.error("Erro ao criar organização");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCloseDialog = () => {
    setIsNewOrgDialogOpen(false);
    setNewOrgName("");
    setNewOrgSlug("");
    setNewOrgPlan("free");
    setNewOrgMaxUsers(1);
    setNewOrgMaxChannels(1);
    setAdminName("");
    setAdminEmail("");
    setAdminPhone("");
    setShowCredentials(false);
    setGeneratedPassword("");
  };

  const handleOpenEditDialog = (org: Organization) => {
    setEditingOrg(org);
    setEditOrgName(org.name);
    setEditOrgMaxUsers(org.max_users);
    setEditOrgMaxChannels(org.max_channels);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingOrg(null);
    setEditOrgName("");
    setEditOrgMaxUsers(1);
    setEditOrgMaxChannels(1);
  };

  const handleSaveOrganization = async () => {
    if (!editingOrg) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: editOrgName.trim(),
          max_users: editOrgMaxUsers,
          max_channels: editOrgMaxChannels,
        })
        .eq("id", editingOrg.id);

      if (error) {
        toast.error("Erro ao salvar alterações");
        console.error("Error updating organization:", error);
        return;
      }

      toast.success("Organização atualizada com sucesso!");
      fetchOrganizations();
      handleCloseEditDialog();
    } catch (err) {
      console.error("Error saving organization:", err);
      toast.error("Erro ao salvar alterações");
    } finally {
      setIsSaving(false);
    }
  };

  const copyCredentials = () => {
    const text = `Email: ${adminEmail}\nSenha temporária: ${generatedPassword}`;
    navigator.clipboard.writeText(text);
    toast.success("Credenciais copiadas!");
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
  const totalMonthlyRevenue = organizations
    .filter((o) => o.is_active)
    .reduce((acc, o) => acc + calculateMonthlyCost(o.max_users, o.max_channels), 0);

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
              <div className="text-2xl font-bold">R$ {totalMonthlyRevenue.toFixed(2)}</div>
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
              Precificação
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
                    <TableHead>Valor Mensal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>WhatsApps</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrganizations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhum cliente encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrganizations.map((org) => {
                      const monthlyCost = calculateMonthlyCost(org.max_users, org.max_channels);
                      return (
                        <TableRow key={org.id} className={!org.is_active ? "opacity-50" : ""}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{org.name}</p>
                              <p className="text-sm text-muted-foreground">{org.slug}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium text-primary">
                              R$ {monthlyCost.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusConfig[org.subscription_status]?.className || ""}>
                              {statusConfig[org.subscription_status]?.label || org.subscription_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {org.user_count || 0} / {org.max_users}
                          </TableCell>
                          <TableCell>
                            {org.max_channels}
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
                              <DropdownMenuItem 
                                className="gap-2"
                                onClick={() => handleOpenEditDialog(org)}
                              >
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
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing" className="space-y-6">
            <SubscriptionPricingConfig />
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
        <Dialog open={isNewOrgDialogOpen} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>
                Cadastre uma nova organização e crie o usuário administrador
              </DialogDescription>
            </DialogHeader>
            
            {showCredentials ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-sm font-medium text-green-600 mb-2">
                    ✓ Cliente criado com sucesso!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Compartilhe as credenciais abaixo com o cliente:
                  </p>
                </div>
                
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-mono text-sm">{adminEmail}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Senha Temporária</Label>
                    <p className="font-mono text-sm">{generatedPassword}</p>
                  </div>
                </div>
                
                <Button onClick={copyCredentials} className="w-full gap-2">
                  <Copy className="w-4 h-4" />
                  Copiar Credenciais
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Dados da Empresa</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome da Empresa *</Label>
                    <Input
                      value={newOrgName}
                      onChange={(e) => {
                        setNewOrgName(e.target.value);
                        // Auto-generate slug
                        setNewOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
                      }}
                      placeholder="Empresa XYZ"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug *</Label>
                    <Input
                      value={newOrgSlug}
                      onChange={(e) => setNewOrgSlug(e.target.value)}
                      placeholder="empresa-xyz"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Qtd. Usuários</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newOrgMaxUsers}
                      onChange={(e) => setNewOrgMaxUsers(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Qtd. WhatsApps</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newOrgMaxChannels}
                      onChange={(e) => setNewOrgMaxChannels(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                </div>

                {subscriptionPricing && (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                    <p className="text-sm font-medium text-primary">
                      Valor mensal: R$ {calculateMonthlyCost(newOrgMaxUsers, newOrgMaxChannels).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Base R$ {subscriptionPricing.base_price.toFixed(2)} 
                      {newOrgMaxUsers > subscriptionPricing.included_users && 
                        ` + ${newOrgMaxUsers - subscriptionPricing.included_users} usuário(s) extra × R$ ${subscriptionPricing.price_per_user.toFixed(2)}`}
                      {newOrgMaxChannels > subscriptionPricing.included_channels && 
                        ` + ${newOrgMaxChannels - subscriptionPricing.included_channels} WhatsApp(s) extra × R$ ${subscriptionPricing.price_per_channel.toFixed(2)}`}
                    </p>
                  </div>
                )}

                <div className="pt-2 space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Dados do Administrador</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Nome Completo *</Label>
                  <Input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="João Silva"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="joao@empresa.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  * Uma senha temporária será gerada automaticamente. O cliente poderá alterá-la após o primeiro acesso.
                </p>
              </div>
            )}
            
            <DialogFooter>
              {showCredentials ? (
                <Button onClick={handleCloseDialog}>
                  Fechar
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleCloseDialog}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateOrganization} disabled={isCreating}>
                    {isCreating ? "Criando..." : "Criar Cliente"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Organization Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={handleCloseEditDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
              <DialogDescription>
                Altere os dados da organização
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Empresa</Label>
                <Input
                  value={editOrgName}
                  onChange={(e) => setEditOrgName(e.target.value)}
                  placeholder="Nome da empresa"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Qtd. Usuários</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editOrgMaxUsers}
                    onChange={(e) => setEditOrgMaxUsers(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Qtd. WhatsApps</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editOrgMaxChannels}
                    onChange={(e) => setEditOrgMaxChannels(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
              </div>

              {subscriptionPricing && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm font-medium text-primary">
                    Valor mensal: R$ {calculateMonthlyCost(editOrgMaxUsers, editOrgMaxChannels).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base R$ {subscriptionPricing.base_price.toFixed(2)} 
                    {editOrgMaxUsers > subscriptionPricing.included_users && 
                      ` + ${editOrgMaxUsers - subscriptionPricing.included_users} usuário(s) extra × R$ ${subscriptionPricing.price_per_user.toFixed(2)}`}
                    {editOrgMaxChannels > subscriptionPricing.included_channels && 
                      ` + ${editOrgMaxChannels - subscriptionPricing.included_channels} WhatsApp(s) extra × R$ ${subscriptionPricing.price_per_channel.toFixed(2)}`}
                  </p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseEditDialog}>
                Cancelar
              </Button>
              <Button onClick={handleSaveOrganization} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
