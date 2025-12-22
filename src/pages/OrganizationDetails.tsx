import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft,
  Building2, 
  Users, 
  Mail,
  Phone,
  Calendar,
  DollarSign,
  MessageSquare,
  TrendingUp,
  Edit,
  CheckCircle,
  XCircle,
  Shield,
  UserCog,
  Headphones
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

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
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
}

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  role: string | null;
}

interface DispatchCost {
  id: string;
  dispatch_date: string;
  dispatch_type: string;
  successful_count: number;
  total_cost: number;
}

const planConfig: Record<string, { label: string; className: string }> = {
  free: { label: "Free", className: "bg-muted text-muted-foreground" },
  starter: { label: "Starter", className: "bg-blue-500/10 text-blue-500" },
  professional: { label: "Professional", className: "bg-primary/10 text-primary" },
  enterprise: { label: "Enterprise", className: "bg-warning/10 text-warning" },
};

const roleConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  super_admin: { label: "Super Admin", icon: Shield, className: "bg-destructive/10 text-destructive" },
  admin: { label: "Admin", icon: Shield, className: "bg-destructive/10 text-destructive" },
  supervisor: { label: "Supervisor", icon: UserCog, className: "bg-warning/10 text-warning" },
  atendente: { label: "Atendente", icon: Headphones, className: "bg-primary/10 text-primary" },
};

export default function OrganizationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [dispatchCosts, setDispatchCosts] = useState<DispatchCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // Edit form
  const [editName, setEditName] = useState("");
  const [editPlan, setEditPlan] = useState("");
  const [editMaxUsers, setEditMaxUsers] = useState(5);
  const [editMaxChannels, setEditMaxChannels] = useState(2);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/");
    }
  }, [roleLoading, isSuperAdmin, navigate]);

  useEffect(() => {
    if (user && isSuperAdmin && id) {
      fetchOrganizationData();
    }
  }, [user, isSuperAdmin, id]);

  const fetchOrganizationData = async () => {
    try {
      // Fetch organization
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", id)
        .single();

      if (orgError) throw orgError;
      setOrganization(org);
      setEditName(org.name);
      setEditPlan(org.plan);
      setEditMaxUsers(org.max_users || 5);
      setEditMaxChannels(org.max_channels || 2);

      // Fetch users in this organization
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("organization_id", id);

      if (profilesError) throw profilesError;

      // Get roles for these users
      const userIds = profiles?.map(p => p.user_id) || [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("*")
        .in("user_id", userIds);

      const usersWithRoles = (profiles || []).map(profile => ({
        ...profile,
        role: roles?.find(r => r.user_id === profile.user_id)?.role || null
      }));

      setUsers(usersWithRoles);

      // Fetch dispatch costs for this organization
      const { data: costs, error: costsError } = await supabase
        .from("dispatch_costs")
        .select("*")
        .eq("organization_id", id)
        .order("dispatch_date", { ascending: false })
        .limit(30);

      if (!costsError) {
        setDispatchCosts(costs || []);
      }

    } catch (error) {
      console.error("Error fetching organization:", error);
      toast.error("Erro ao carregar dados da organização");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrganization = async () => {
    if (!organization) return;

    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: editName,
          plan: editPlan,
          max_users: editMaxUsers,
          max_channels: editMaxChannels,
        })
        .eq("id", organization.id);

      if (error) throw error;

      toast.success("Organização atualizada com sucesso");
      setIsEditDialogOpen(false);
      fetchOrganizationData();
    } catch (error) {
      console.error("Error updating organization:", error);
      toast.error("Erro ao atualizar organização");
    }
  };

  const handleToggleOrgStatus = async () => {
    if (!organization) return;

    try {
      const { error } = await supabase
        .from("organizations")
        .update({ is_active: !organization.is_active })
        .eq("id", organization.id);

      if (error) throw error;

      toast.success(organization.is_active ? "Organização desativada" : "Organização ativada");
      fetchOrganizationData();
    } catch (error) {
      console.error("Error toggling org status:", error);
      toast.error("Erro ao atualizar status");
    }
  };

  // Metrics calculations
  const totalDispatches = dispatchCosts.reduce((acc, d) => acc + d.successful_count, 0);
  const totalSpent = dispatchCosts.reduce((acc, d) => acc + Number(d.total_cost), 0);
  const thisMonthCosts = dispatchCosts.filter(d => {
    const date = new Date(d.dispatch_date);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const monthlySpent = thisMonthCosts.reduce((acc, d) => acc + Number(d.total_cost), 0);
  const monthlyDispatches = thisMonthCosts.reduce((acc, d) => acc + d.successful_count, 0);

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin || !organization) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/super-admin")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <span className="text-lg font-bold text-foreground">{organization.name}</span>
            <p className="text-xs text-muted-foreground">{organization.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={planConfig[organization.plan]?.className || ""}>
            {planConfig[organization.plan]?.label || organization.plan}
          </Badge>
          <Badge className={organization.is_active ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}>
            {organization.is_active ? "Ativa" : "Inativa"}
          </Badge>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)} className="gap-2">
            <Edit className="w-4 h-4" />
            Editar
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleToggleOrgStatus}
            className="gap-2"
          >
            {organization.is_active ? (
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
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Usuários
              </CardTitle>
              <Users className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length} / {organization.max_users}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Disparos no Mês
              </CardTitle>
              <MessageSquare className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{monthlyDispatches.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Consumo no Mês
              </CardTitle>
              <DollarSign className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {monthlySpent.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Consumo Total
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {totalSpent.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              Usuários ({users.length})
            </TabsTrigger>
            <TabsTrigger value="consumption" className="gap-2">
              <DollarSign className="w-4 h-4" />
              Consumo
            </TabsTrigger>
            <TabsTrigger value="info" className="gap-2">
              <Building2 className="w-4 h-4" />
              Informações
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((userProfile) => {
                      const role = userProfile.role as keyof typeof roleConfig;
                      const RoleIcon = roleConfig[role]?.icon || Users;
                      return (
                        <TableRow key={userProfile.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-medium text-primary">
                                  {(userProfile.display_name || userProfile.email || "?")[0].toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium">{userProfile.display_name || "—"}</p>
                                <p className="text-sm text-muted-foreground">{userProfile.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {role ? (
                              <Badge className={roleConfig[role]?.className || ""}>
                                <RoleIcon className="w-3 h-3 mr-1" />
                                {roleConfig[role]?.label || role}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={userProfile.is_active ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}>
                              {userProfile.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(userProfile.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Consumption Tab */}
          <TabsContent value="consumption">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Consumo</CardTitle>
                <CardDescription>Últimos 30 registros de disparos</CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Disparos</TableHead>
                    <TableHead>Custo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatchCosts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhum registro de consumo encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    dispatchCosts.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell>
                          {new Date(cost.dispatch_date).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{cost.dispatch_type}</Badge>
                        </TableCell>
                        <TableCell>{cost.successful_count.toLocaleString()}</TableCell>
                        <TableCell>R$ {Number(cost.total_cost).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info">
            <Card>
              <CardHeader>
                <CardTitle>Informações da Organização</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground">Nome</Label>
                    <p className="font-medium">{organization.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Slug</Label>
                    <p className="font-medium">{organization.slug}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Plano</Label>
                    <p className="font-medium">{planConfig[organization.plan]?.label || organization.plan}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p className="font-medium">{organization.is_active ? "Ativa" : "Inativa"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Limite de Usuários</Label>
                    <p className="font-medium">{organization.max_users}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Limite de Canais</Label>
                    <p className="font-medium">{organization.max_channels}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Criada em</Label>
                    <p className="font-medium">{new Date(organization.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">ID</Label>
                    <p className="font-mono text-sm text-muted-foreground">{organization.id}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Organização</DialogTitle>
            <DialogDescription>
              Atualize as informações da organização
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={editPlan} onValueChange={setEditPlan}>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Limite de Usuários</Label>
                <Input
                  type="number"
                  value={editMaxUsers}
                  onChange={(e) => setEditMaxUsers(parseInt(e.target.value) || 5)}
                />
              </div>
              <div className="space-y-2">
                <Label>Limite de Canais</Label>
                <Input
                  type="number"
                  value={editMaxChannels}
                  onChange={(e) => setEditMaxChannels(parseInt(e.target.value) || 2)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateOrganization}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}