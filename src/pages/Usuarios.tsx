import { useState, useEffect, KeyboardEvent } from "react";
import { 
  Users, 
  Plus, 
  Search, 
  Shield, 
  UserCog, 
  Headphones,
  Trash2,
  Edit,
  Building2,
  ChevronDown,
  MoreHorizontal,
  KeyRound,
  UserX,
  UserCheck,
  Mail,
  X,
  Loader2
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

type AppRole = "super_admin" | "admin" | "supervisor" | "atendente";

interface UserWithRole {
  id: string;
  email: string;
  display_name: string | null;
  role: AppRole | null;
  sectors: string[];
  created_at: string;
  is_active: boolean;
  organization_id: string | null;
}

interface Sector {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  user_count?: number;
}

interface Organization {
  id: string;
  name: string;
}

const roleConfig: Record<AppRole, { label: string; icon: React.ElementType; className: string }> = {
  super_admin: { 
    label: "Super Admin", 
    icon: Shield, 
    className: "bg-purple-500/10 text-purple-500 border-purple-500/30" 
  },
  admin: { 
    label: "Admin", 
    icon: Shield, 
    className: "bg-destructive/10 text-destructive border-destructive/30" 
  },
  supervisor: { 
    label: "Supervisor", 
    icon: UserCog, 
    className: "bg-warning/10 text-warning border-warning/30" 
  },
  atendente: { 
    label: "Atendente", 
    icon: Headphones, 
    className: "bg-primary/10 text-primary border-primary/30" 
  },
};

const Usuarios = () => {
  const { user } = useAuth();
  const { effectiveOrganizationId: organizationId } = useEffectiveOrganizationId();
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isSectorDialogOpen, setIsSectorDialogOpen] = useState(false);
  const [isUserSectorDialogOpen, setIsUserSectorDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  
  // Form states
  const [selectedRole, setSelectedRole] = useState<AppRole>("atendente");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedUserSectorIds, setSelectedUserSectorIds] = useState<string[]>([]);
  const [sectorName, setSectorName] = useState("");
  const [sectorDescription, setSectorDescription] = useState("");
  
  // New user form states
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = useState(false);
  const [newUserEmails, setNewUserEmails] = useState<string[]>([]);
  const [newUserEmailInput, setNewUserEmailInput] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole>("atendente");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createProgress, setCreateProgress] = useState({ current: 0, total: 0 });
  
  // Edit email dialog states
  const [isEditEmailDialogOpen, setIsEditEmailDialogOpen] = useState(false);
  const [editingEmailUser, setEditingEmailUser] = useState<UserWithRole | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  // Fetch organizations for super admin filter
  const fetchOrganizations = async () => {
    if (!isSuperAdmin) return;
    
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      
      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error("Error fetching organizations:", error);
    }
  };

  // Fetch users with their roles
  const fetchUsers = async () => {
    try {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*");

      if (profilesError) throw profilesError;

      // Get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      // Get all user sectors
      const { data: userSectors, error: userSectorsError } = await supabase
        .from("user_sectors")
        .select("user_id, sector_id, sectors(name)");

      if (userSectorsError) throw userSectorsError;

      // Combine data
      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        const userSectorsList = userSectors
          ?.filter((us) => us.user_id === profile.user_id)
          .map((us) => (us.sectors as any)?.name || "")
          .filter(Boolean);

        return {
          id: profile.user_id,
          email: profile.email || "",
          display_name: profile.display_name,
          role: userRole?.role as AppRole | null,
          sectors: userSectorsList || [],
          created_at: profile.created_at,
          is_active: profile.is_active ?? true,
          organization_id: profile.organization_id,
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Erro ao carregar usuários");
    }
  };

  // Fetch sectors
  const fetchSectors = async () => {
    try {
      const { data, error } = await supabase
        .from("sectors")
        .select("*")
        .order("name");

      if (error) throw error;

      // Count users per sector
      const { data: userSectors } = await supabase
        .from("user_sectors")
        .select("sector_id");

      const sectorsWithCount = (data || []).map((sector) => ({
        ...sector,
        user_count: userSectors?.filter((us) => us.sector_id === sector.id).length || 0,
      }));

      setSectors(sectorsWithCount);
    } catch (error) {
      console.error("Error fetching sectors:", error);
      toast.error("Erro ao carregar setores");
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchSectors(), fetchOrganizations()]);
      setLoading(false);
    };
    
    if (isAdmin || isSuperAdmin) {
      loadData();
    }
  }, [isAdmin, isSuperAdmin]);

  // Handle role update
  const handleUpdateRole = async (userId: string, newRole: AppRole) => {
    try {
      // Check if user already has a role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole })
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: newRole });

        if (error) throw error;
      }

      toast.success("Função atualizada com sucesso");
      fetchUsers();
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error("Erro ao atualizar função");
    }
  };

  // Handle sector creation
  const handleCreateSector = async () => {
    if (!sectorName.trim()) {
      toast.error("Nome do departamento é obrigatório");
      return;
    }

    try {
      const { error } = await supabase.from("sectors").insert({
        name: sectorName.trim(),
        description: sectorDescription.trim() || null,
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success("Departamento criado com sucesso");
      setSectorName("");
      setSectorDescription("");
      setIsSectorDialogOpen(false);
      fetchSectors();
    } catch (error) {
      console.error("Error creating sector:", error);
      toast.error("Erro ao criar departamento");
    }
  };

  // Handle sector delete
  const handleDeleteSector = async (sectorId: string) => {
    try {
      const { error } = await supabase
        .from("sectors")
        .delete()
        .eq("id", sectorId);

      if (error) throw error;

      toast.success("Departamento removido com sucesso");
      fetchSectors();
    } catch (error) {
      console.error("Error deleting sector:", error);
      toast.error("Erro ao remover departamento");
    }
  };

  // Handle email input keydown for chip system
  const handleEmailKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail();
    }
  };

  const addEmail = () => {
    const email = newUserEmailInput.trim().toLowerCase();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Email inválido");
      return;
    }

    if (newUserEmails.includes(email)) {
      toast.error("Email já adicionado");
      return;
    }

    setNewUserEmails(prev => [...prev, email]);
    setNewUserEmailInput("");
  };

  const removeEmail = (emailToRemove: string) => {
    setNewUserEmails(prev => prev.filter(email => email !== emailToRemove));
  };

  // Handle create new user(s)
  const handleCreateUser = async () => {
    if (newUserEmails.length === 0) {
      toast.error("Adicione pelo menos um email");
      return;
    }
    if (!newUserPassword.trim()) {
      toast.error("Senha é obrigatória");
      return;
    }
    if (newUserPassword.trim().length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }

    setIsCreatingUser(true);
    setCreateProgress({ current: 0, total: newUserEmails.length });
    
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < newUserEmails.length; i++) {
      const email = newUserEmails[i];
      setCreateProgress({ current: i + 1, total: newUserEmails.length });

      try {
        // Create user via Supabase Auth with the provided password
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email,
          password: newUserPassword.trim(),
          options: {
            data: {
              display_name: email.split("@")[0],
            }
          }
        });

        if (authError) {
          if (authError.message.includes("already registered")) {
            toast.error(`${email}: já cadastrado`);
          } else {
            toast.error(`${email}: ${authError.message}`);
          }
          errorCount++;
          continue;
        }

        if (!authData.user) {
          toast.error(`${email}: erro ao criar`);
          errorCount++;
          continue;
        }

        // Create profile for the new user
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({
            user_id: authData.user.id,
            email: email,
            display_name: email.split("@")[0],
            organization_id: organizationId,
          }, { onConflict: "user_id" });

        if (profileError) {
          console.error("Error creating profile:", profileError);
        }

        // Assign role to the new user
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: authData.user.id,
            role: newUserRole,
          });

        if (roleError) {
          console.error("Error assigning role:", roleError);
        }

        successCount++;
      } catch (error: any) {
        console.error(`Error creating user ${email}:`, error);
        toast.error(`${email}: ${error.message || "erro desconhecido"}`);
        errorCount++;
      }

      // Small delay to avoid rate limiting
      if (i < newUserEmails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} usuário(s) criado(s) com sucesso!`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} usuário(s) com erro`);
    }
    
    // Reset form
    setNewUserEmails([]);
    setNewUserEmailInput("");
    setNewUserPassword("");
    setNewUserRole("atendente");
    setIsNewUserDialogOpen(false);
    setCreateProgress({ current: 0, total: 0 });
    
    // Refresh user list
    fetchUsers();
    setIsCreatingUser(false);
  };

  // Toggle user active status
  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !currentStatus })
        .eq("user_id", userId);

      if (error) throw error;

      toast.success(currentStatus ? "Usuário desativado" : "Usuário ativado");
      fetchUsers();
    } catch (error) {
      console.error("Error toggling user status:", error);
      toast.error("Erro ao alterar status do usuário");
    }
  };

  // Send password reset email
  const handleSendPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast.success(`Email de redefinição de senha enviado para ${email}`);
    } catch (error: any) {
      console.error("Error sending password reset:", error);
      toast.error(error.message || "Erro ao enviar email de redefinição");
    }
  };

  // Open edit email dialog
  const openEditEmailDialog = (userToEdit: UserWithRole) => {
    setEditingEmailUser(userToEdit);
    setNewEmail(userToEdit.email);
    setIsEditEmailDialogOpen(true);
  };

  // Update user email via edge function
  const handleUpdateEmail = async () => {
    if (!editingEmailUser || !newEmail.trim()) return;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      toast.error("Email inválido");
      return;
    }

    setIsUpdatingEmail(true);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-user-role", {
        body: {
          action: "update_user",
          user_id: editingEmailUser.id,
          email: newEmail.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Email atualizado com sucesso!");
      setIsEditEmailDialogOpen(false);
      setEditingEmailUser(null);
      setNewEmail("");
      fetchUsers();
    } catch (error: any) {
      console.error("Error updating email:", error);
      toast.error(error.message || "Erro ao atualizar email");
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  // Delete user completely (from auth.users)
  const handleDeleteUser = async (userId: string, displayName: string) => {
    if (!confirm(`Tem certeza que deseja excluir permanentemente o usuário "${displayName}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("create-user-role", {
        body: {
          action: "delete_user",
          user_id: userId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Usuário excluído permanentemente!");
      fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.message || "Erro ao excluir usuário");
    }
  };

  const openUserSectorDialog = (userToEdit: UserWithRole) => {
    setEditingUser(userToEdit);
    // Get sector IDs for this user
    const userSectorIds = sectors
      .filter((s) => userToEdit.sectors.includes(s.name))
      .map((s) => s.id);
    setSelectedUserSectorIds(userSectorIds);
    setIsUserSectorDialogOpen(true);
  };

  // Save user sector assignments
  const handleSaveUserSectors = async () => {
    if (!editingUser) return;

    try {
      // First, delete all existing sector assignments for this user
      const { error: deleteError } = await supabase
        .from("user_sectors")
        .delete()
        .eq("user_id", editingUser.id);

      if (deleteError) throw deleteError;

      // Then insert new assignments
      if (selectedUserSectorIds.length > 0) {
        const { error: insertError } = await supabase
          .from("user_sectors")
          .insert(
            selectedUserSectorIds.map((sectorId) => ({
              user_id: editingUser.id,
              sector_id: sectorId,
            }))
          );

        if (insertError) throw insertError;
      }

      toast.success("Departamentos do usuário atualizados com sucesso");
      setIsUserSectorDialogOpen(false);
      setEditingUser(null);
      setSelectedUserSectorIds([]);
      fetchUsers();
    } catch (error) {
      console.error("Error updating user sectors:", error);
      toast.error("Erro ao atualizar departamentos do usuário");
    }
  };

  // Filter users by search term and organization
  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesOrg = selectedOrgFilter === "all" || u.organization_id === selectedOrgFilter;
    
    return matchesSearch && matchesOrg;
  });

  // Show loading while checking role
  if (roleLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  // Show access denied for non-admins (super_admin has full access)
  if (!isAdmin && !isSuperAdmin) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <UserX className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Acesso Negado</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Você não tem permissão para acessar esta página. Entre em contato com um administrador se acredita que isso é um erro.
          </p>
        </div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
            <p className="text-muted-foreground">
              Gerencie usuários, funções e departamentos
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Usuários
              </CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{users.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Admins
              </CardTitle>
              <Shield className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {users.filter((u) => u.role === "admin").length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Supervisores
              </CardTitle>
              <UserCog className="w-4 h-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {users.filter((u) => u.role === "supervisor").length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Departamentos
              </CardTitle>
              <Building2 className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{sectors.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="sectors" className="gap-2">
              <Building2 className="w-4 h-4" />
              Departamentos
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar usuários..."
                    className="pl-10 bg-muted/30 border-border"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                {isSuperAdmin && organizations.length > 0 && (
                  <Select value={selectedOrgFilter} onValueChange={setSelectedOrgFilter}>
                    <SelectTrigger className="w-[200px]">
                      <Building2 className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Filtrar por organização" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas organizações</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button onClick={() => setIsNewUserDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Usuário
              </Button>
            </div>

            <Card className="bg-card border-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Usuário</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Departamentos</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((u) => {
                      const RoleIcon = u.role ? roleConfig[u.role].icon : Users;
                      return (
                        <TableRow key={u.id} className={`border-border ${!u.is_active ? 'opacity-50' : ''}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className={`text-xs ${u.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                  {(u.display_name || u.email).slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-foreground flex items-center gap-2">
                                  {u.display_name || "Sem nome"}
                                </div>
                                <div className="text-xs text-muted-foreground">{u.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={u.is_active ? "default" : "secondary"}
                              className={u.is_active ? "bg-green-500/10 text-green-500 border-green-500/30" : "bg-muted text-muted-foreground"}
                            >
                              {u.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2">
                                  <RoleIcon className="w-3 h-3" />
                                  {u.role ? roleConfig[u.role].label : "Sem função"}
                                  <ChevronDown className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => handleUpdateRole(u.id, "admin")}>
                                  <Shield className="w-4 h-4 mr-2 text-destructive" />
                                  Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleUpdateRole(u.id, "supervisor")}>
                                  <UserCog className="w-4 h-4 mr-2 text-warning" />
                                  Supervisor
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleUpdateRole(u.id, "atendente")}>
                                  <Headphones className="w-4 h-4 mr-2 text-primary" />
                                  Atendente
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          <TableCell>
                            {u.sectors.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {u.sectors.map((sector) => (
                                  <Badge key={sector} variant="outline" className="text-xs">
                                    {sector}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(u.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {isSuperAdmin && (
                                  <DropdownMenuItem onClick={() => openEditEmailDialog(u)}>
                                    <Mail className="w-4 h-4 mr-2" />
                                    Editar Email
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => openUserSectorDialog(u)}>
                                  <Building2 className="w-4 h-4 mr-2" />
                                  Gerenciar Departamentos
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSendPasswordReset(u.email)}>
                                  <KeyRound className="w-4 h-4 mr-2" />
                                  Redefinir Senha
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleToggleUserStatus(u.id, u.is_active)}
                                  className={u.is_active ? "text-destructive focus:text-destructive" : "text-green-500 focus:text-green-500"}
                                >
                                  {u.is_active ? (
                                    <>
                                      <UserX className="w-4 h-4 mr-2" />
                                      Desativar Usuário
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="w-4 h-4 mr-2" />
                                      Ativar Usuário
                                    </>
                                  )}
                                </DropdownMenuItem>
                                {isSuperAdmin && (
                                  <DropdownMenuItem 
                                    onClick={() => handleDeleteUser(u.id, u.display_name || u.email)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir Permanentemente
                                  </DropdownMenuItem>
                                )}
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

          {/* Sectors Tab */}
          <TabsContent value="sectors" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar departamentos..."
                  className="pl-10 bg-muted/30 border-border"
                />
              </div>
              <Dialog open={isSectorDialogOpen} onOpenChange={setIsSectorDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Novo Departamento
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Novo Departamento</DialogTitle>
                    <DialogDescription>
                      Crie um departamento para organizar seus usuários
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="sectorName">Nome do Departamento</Label>
                      <Input
                        id="sectorName"
                        placeholder="Ex: Vendas, Suporte, Financeiro"
                        value={sectorName}
                        onChange={(e) => setSectorName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sectorDescription">Descrição (opcional)</Label>
                      <Textarea
                        id="sectorDescription"
                        placeholder="Descreva as responsabilidades deste departamento"
                        value={sectorDescription}
                        onChange={(e) => setSectorDescription(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsSectorDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreateSector}>Criar Departamento</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sectors.length === 0 ? (
                <Card className="col-span-full bg-card border-border">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      Nenhum departamento criado
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Crie departamentos para organizar seus usuários
                    </p>
                    <Button onClick={() => setIsSectorDialogOpen(true)} className="gap-2">
                      <Plus className="w-4 h-4" />
                      Criar primeiro departamento
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                sectors.map((sector) => (
                  <Card key={sector.id} className="bg-card border-border">
                    <CardHeader className="flex flex-row items-start justify-between">
                      <div>
                        <CardTitle className="text-foreground">{sector.name}</CardTitle>
                        {sector.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {sector.description}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteSector(sector.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{sector.user_count} usuário(s)</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* New User Dialog */}
        <Dialog open={isNewUserDialogOpen} onOpenChange={setIsNewUserDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Usuário</DialogTitle>
              <DialogDescription>
                Cadastre um novo usuário no sistema. Um email de confirmação será enviado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Emails dos usuários</Label>
                <div className="flex flex-wrap gap-2 p-2 min-h-[42px] bg-muted/30 border border-border rounded-md">
                  {newUserEmails.map((email) => (
                    <Badge
                      key={email}
                      variant="secondary"
                      className="flex items-center gap-1 px-2 py-1"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        className="ml-1 hover:text-destructive"
                        disabled={isCreatingUser}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  <Input
                    placeholder="Digite o email e pressione Enter"
                    value={newUserEmailInput}
                    onChange={(e) => setNewUserEmailInput(e.target.value)}
                    onKeyDown={handleEmailKeyDown}
                    onBlur={addEmail}
                    className="flex-1 min-w-[200px] border-0 bg-transparent p-0 h-7 focus-visible:ring-0"
                    disabled={isCreatingUser}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Digite o email e pressione Enter para adicionar. Você pode adicionar vários.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-password">Senha {newUserEmails.length > 1 && "(para todos)"}</Label>
                <Input
                  id="new-user-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="bg-muted/30 border-border"
                  disabled={isCreatingUser}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-role">Tipo de Usuário {newUserEmails.length > 1 && "(para todos)"}</Label>
                <Select value={newUserRole} onValueChange={(value: AppRole) => setNewUserRole(value)} disabled={isCreatingUser}>
                  <SelectTrigger className="bg-muted/30 border-border">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-destructive" />
                        Admin
                      </div>
                    </SelectItem>
                    <SelectItem value="supervisor">
                      <div className="flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-warning" />
                        Supervisor
                      </div>
                    </SelectItem>
                    <SelectItem value="atendente">
                      <div className="flex items-center gap-2">
                        <Headphones className="w-4 h-4 text-primary" />
                        Atendente
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsNewUserDialogOpen(false);
                  setNewUserEmails([]);
                  setNewUserEmailInput("");
                  setNewUserPassword("");
                  setNewUserRole("atendente");
                }}
                disabled={isCreatingUser}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreateUser} disabled={isCreatingUser || newUserEmails.length === 0}>
                {isCreatingUser ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {createProgress.total > 1 
                      ? `Criando ${createProgress.current}/${createProgress.total}...`
                      : "Criando..."
                    }
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    {newUserEmails.length > 1 
                      ? `Criar ${newUserEmails.length} Usuários`
                      : "Criar Usuário"
                    }
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* User Sector Assignment Dialog */}
        <Dialog open={isUserSectorDialogOpen} onOpenChange={setIsUserSectorDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Atribuir Departamentos</DialogTitle>
              <DialogDescription>
                Selecione os departamentos para {editingUser?.display_name || editingUser?.email}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {sectors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum departamento criado. Crie departamentos na aba "Departamentos" primeiro.
                  </div>
                ) : (
                  sectors.map((sector) => (
                    <div
                      key={sector.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 border border-border"
                    >
                      <Checkbox
                        id={`sector-${sector.id}`}
                        checked={selectedUserSectorIds.includes(sector.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedUserSectorIds([...selectedUserSectorIds, sector.id]);
                          } else {
                            setSelectedUserSectorIds(
                              selectedUserSectorIds.filter((id) => id !== sector.id)
                            );
                          }
                        }}
                      />
                      <label
                        htmlFor={`sector-${sector.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="font-medium text-foreground">{sector.name}</div>
                        {sector.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {sector.description}
                          </div>
                        )}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsUserSectorDialogOpen(false);
                  setEditingUser(null);
                  setSelectedUserSectorIds([]);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSaveUserSectors} disabled={sectors.length === 0}>
                Salvar ({selectedUserSectorIds.length} departamento{selectedUserSectorIds.length !== 1 ? "s" : ""})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Email Dialog */}
        <Dialog open={isEditEmailDialogOpen} onOpenChange={setIsEditEmailDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Email</DialogTitle>
              <DialogDescription>
                Altere o email de login para {editingEmailUser?.display_name || editingEmailUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="currentEmail">Email Atual</Label>
                <Input
                  id="currentEmail"
                  value={editingEmailUser?.email || ""}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newEmail">Novo Email</Label>
                <Input
                  id="newEmail"
                  type="email"
                  placeholder="Digite o novo email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditEmailDialogOpen(false);
                  setEditingEmailUser(null);
                  setNewEmail("");
                }}
                disabled={isUpdatingEmail}
              >
                Cancelar
              </Button>
              <Button onClick={handleUpdateEmail} disabled={isUpdatingEmail || !newEmail.trim()}>
                {isUpdatingEmail ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                    Atualizando...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Atualizar Email
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default Usuarios;
