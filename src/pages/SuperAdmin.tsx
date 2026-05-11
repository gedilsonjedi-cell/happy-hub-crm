import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, addMonths } from "date-fns";
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
  AlertTriangle,
  CalendarIcon,
  Clock,
  ShoppingBag,
  Wallet,
  ShieldCheck,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { DispatchPricingConfig } from "@/components/admin/DispatchPricingConfig";
import { SubscriptionPricingConfig } from "@/components/admin/SubscriptionPricingConfig";
import { StoreManagementPanel } from "@/components/admin/StoreManagementPanel";
import { OrganizationBalancePanel } from "@/components/admin/OrganizationBalancePanel";
import { PaymentHistoryPanel } from "@/components/admin/PaymentHistoryPanel";
import { RlsRegressionPanel } from "@/components/admin/RlsRegressionPanel";
import { PerformanceMetricsPanel } from "@/components/admin/PerformanceMetricsPanel";
import { UnreadDivergencePanel } from "@/components/admin/UnreadDivergencePanel";

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
  subscription_ends_at: string | null;
  subscription_started_at: string | null;
  user_count?: number;
  channel_count?: number;
  monthly_cost?: number;
  days_until_expiry?: number;
  is_partner?: boolean;
  custom_subscription_price?: number | null;
}

type PlanType = "mensal" | "parceiro" | "personalizado";

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-green-500/10 text-green-500" },
  trial: { label: "Trial", className: "bg-blue-500/10 text-blue-500" },
  past_due: { label: "Atrasada", className: "bg-warning/10 text-warning" },
  canceled: { label: "Cancelada", className: "bg-destructive/10 text-destructive" },
  partner: { label: "Parceiro", className: "bg-primary/10 text-primary" },
  pending: { label: "Pendente", className: "bg-orange-500/10 text-orange-500" },
  inactive: { label: "Inativa", className: "bg-muted text-muted-foreground" },
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
  const [newOrgMaxChannels, setNewOrgMaxChannels] = useState(100);
  const [newOrgExpiryDate, setNewOrgExpiryDate] = useState<Date | undefined>(addMonths(new Date(), 1));
  const [isCreating, setIsCreating] = useState(false);
  
  // New client admin fields
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [newOrgPlanType, setNewOrgPlanType] = useState<PlanType>("mensal");
  const [newOrgCustomPrice, setNewOrgCustomPrice] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  
  // Edit dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgPlan, setEditOrgPlan] = useState<PlanType>("mensal");
  const [editOrgCustomPrice, setEditOrgCustomPrice] = useState("");
  const [editOrgMaxUsers, setEditOrgMaxUsers] = useState(1);
  const [editOrgMaxChannels, setEditOrgMaxChannels] = useState(1);
  const [editOrgExpiryDate, setEditOrgExpiryDate] = useState<Date | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit admin fields
  const [editAdminUserId, setEditAdminUserId] = useState<string | null>(null);
  const [editAdminName, setEditAdminName] = useState("");
  const [editAdminOriginalName, setEditAdminOriginalName] = useState("");
  const [editAdminEmail, setEditAdminEmail] = useState("");
  const [editAdminOriginalEmail, setEditAdminOriginalEmail] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [loadingAdminData, setLoadingAdminData] = useState(false);
  
  // Balance/Recharge dialog
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false);
  const [selectedOrgForBalance, setSelectedOrgForBalance] = useState<Organization | null>(null);
  
  // Subscription pricing
  const [subscriptionPricing, setSubscriptionPricing] = useState<SubscriptionPricing | null>(null);
  
  // Fix orphan user state
  const [orphanUserId, setOrphanUserId] = useState("");
  const [isDeletingOrphan, setIsDeletingOrphan] = useState(false);

  // Delete orphan user (user in auth.users without profile)
  const handleDeleteOrphanUser = async () => {
    if (!orphanUserId.trim()) {
      toast.error("Digite o ID do usuário");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o usuário com ID "${orphanUserId}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setIsDeletingOrphan(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user-role", {
        body: {
          action: "delete_user",
          user_id: orphanUserId.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Usuário órfão excluído com sucesso!");
      setOrphanUserId("");
    } catch (error: any) {
      console.error("Error deleting orphan user:", error);
      toast.error(error.message || "Erro ao excluir usuário órfão");
    } finally {
      setIsDeletingOrphan(false);
    }
  };

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

      const now = new Date();
      setOrganizations((data || []).map((org) => {
        let daysUntilExpiry: number | undefined;
        // Use subscription_paid_until if available, otherwise fallback to subscription_ends_at
        const expiryDateStr = org.subscription_paid_until || org.subscription_ends_at;
        if (expiryDateStr) {
          const expiryDate = new Date(expiryDateStr);
          daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }
        return {
          ...org,
          user_count: countMap[org.id] || 0,
          days_until_expiry: daysUntilExpiry,
        };
      }));
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

    // Validate password
    if (!adminPassword.trim() || adminPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsCreating(true);
    try {
      // Save the current super admin session before creating new user
      const { data: currentSession } = await supabase.auth.getSession();
      const superAdminToken = currentSession?.session?.access_token;

      if (!superAdminToken) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      // Determine plan configuration based on plan type
      const isPartner = newOrgPlanType === "parceiro";
      const isCustom = newOrgPlanType === "personalizado";
      const customPrice = isCustom && newOrgCustomPrice ? parseFloat(newOrgCustomPrice) : null;

      // 1. Create organization first
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: newOrgName.trim(),
          slug: newOrgSlug.trim().toLowerCase().replace(/\s+/g, "-"),
          plan: newOrgPlan,
          max_users: newOrgMaxUsers,
          max_channels: newOrgMaxChannels,
          subscription_ends_at: isPartner ? null : (newOrgExpiryDate ? newOrgExpiryDate.toISOString() : null),
          subscription_started_at: new Date().toISOString(),
          is_partner: isPartner,
          subscription_status: isPartner ? "active" : "trial",
          custom_subscription_price: customPrice,
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

      // 2. Use provided password
      const userPassword = adminPassword.trim();

      // 3. Create admin user using admin API via edge function to avoid session switch
      const createUserResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user-role`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${superAdminToken}`,
          },
          body: JSON.stringify({
            action: "create_user_with_role",
            email: adminEmail.trim(),
            password: userPassword,
            display_name: adminName.trim(),
            organization_id: orgData.id,
            role: "admin",
          }),
        }
      );

      if (!createUserResponse.ok) {
        const errorData = await createUserResponse.json();
        // Rollback: delete the organization
        await supabase.from("organizations").delete().eq("id", orgData.id);
        toast.error(`Erro ao criar usuário: ${errorData.error}`);
        return;
      }

      // Show success with credentials
      setGeneratedPassword(userPassword);
      setShowCredentials(true);
      toast.success("Cliente e usuário admin criados com sucesso!");
      await fetchOrganizations();
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
    setNewOrgMaxChannels(100);
    setNewOrgExpiryDate(addMonths(new Date(), 1));
    setAdminName("");
    setAdminEmail("");
    setAdminPhone("");
    setAdminPassword("");
    setNewOrgPlanType("mensal");
    setNewOrgCustomPrice("");
    setShowCredentials(false);
    setGeneratedPassword("");
  };

  const handleOpenEditDialog = async (org: Organization) => {
    setEditingOrg(org);
    setEditOrgName(org.name);
    // Determine plan type
    if (org.is_partner) {
      setEditOrgPlan("parceiro");
    } else if (org.custom_subscription_price != null) {
      setEditOrgPlan("personalizado");
      setEditOrgCustomPrice(org.custom_subscription_price.toString());
    } else {
      setEditOrgPlan("mensal");
    }
    setEditOrgMaxUsers(org.max_users);
    setEditOrgMaxChannels(org.max_channels);
    setEditOrgExpiryDate(org.subscription_ends_at ? new Date(org.subscription_ends_at) : undefined);
    setIsEditDialogOpen(true);
    
    // Fetch admin user data
    setLoadingAdminData(true);
    try {
      const { data: adminProfile, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .eq("organization_id", org.id)
        .limit(1)
        .single();
      
      if (!error && adminProfile) {
        setEditAdminUserId(adminProfile.user_id);
        setEditAdminName(adminProfile.display_name || "");
        setEditAdminOriginalName(adminProfile.display_name || "");
        setEditAdminEmail(adminProfile.email || "");
        setEditAdminOriginalEmail(adminProfile.email || "");
      }
    } catch (err) {
      console.error("Error fetching admin data:", err);
    } finally {
      setLoadingAdminData(false);
    }
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingOrg(null);
    setEditOrgName("");
    setEditOrgPlan("mensal");
    setEditOrgCustomPrice("");
    setEditOrgMaxUsers(1);
    setEditOrgMaxChannels(1);
    setEditOrgExpiryDate(undefined);
    setEditAdminUserId(null);
    setEditAdminName("");
    setEditAdminOriginalName("");
    setEditAdminEmail("");
    setEditAdminOriginalEmail("");
    setEditAdminPassword("");
  };

  const handleSaveOrganization = async () => {
    if (!editingOrg) return;
    
    const isPartner = editOrgPlan === "parceiro";
    const isCustom = editOrgPlan === "personalizado";
    const customPrice = isCustom && editOrgCustomPrice ? parseFloat(editOrgCustomPrice) : null;
    
    setIsSaving(true);
    try {
      // Update organization
      const { error } = await supabase
        .from("organizations")
        .update({
          name: editOrgName.trim(),
          max_users: editOrgMaxUsers,
          max_channels: editOrgMaxChannels,
          subscription_ends_at: isPartner ? null : (editOrgExpiryDate ? editOrgExpiryDate.toISOString() : null),
          is_partner: isPartner,
          plan: isPartner ? "partner" : "pro",
          custom_subscription_price: customPrice,
        })
        .eq("id", editingOrg.id);

      if (error) {
        toast.error("Erro ao salvar alterações da organização");
        console.error("Error updating organization:", error);
        return;
      }

      // Update admin user if we have their data
      if (editAdminUserId) {
        const { data: currentSession } = await supabase.auth.getSession();
        const superAdminToken = currentSession?.session?.access_token;

        if (superAdminToken) {
          const updateResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user-role`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${superAdminToken}`,
              },
              body: JSON.stringify({
                action: "update_user",
                user_id: editAdminUserId,
                display_name: editAdminName.trim() !== editAdminOriginalName ? editAdminName.trim() : undefined,
                email: editAdminEmail.trim() !== editAdminOriginalEmail ? editAdminEmail.trim() : undefined,
                password: editAdminPassword.trim() || undefined,
              }),
            }
          );

          if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            toast.error(`Erro ao atualizar admin: ${errorData.error}`);
            return;
          }
        }
      }

      toast.success("Cliente atualizado com sucesso!");
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
    if (!confirm("Tem certeza que deseja excluir esta organização? Esta ação não pode ser desfeita. Todos os dados relacionados (usuários, leads, canais, etc.) serão permanentemente removidos.")) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc("delete_organization_cascade", {
        _organization_id: id
      });

      if (error) {
        console.error("Error deleting organization:", error);
        toast.error("Erro ao excluir organização: " + error.message);
        return;
      }

      toast.success("Organização excluída com sucesso");
      fetchOrganizations();
    } catch (err) {
      console.error("Error deleting organization:", err);
      toast.error("Erro ao excluir organização");
    }
  };

  const filteredOrganizations = organizations.filter((org) =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeOrgs = organizations.filter((o) => o.is_active).length;
  const partnerOrgs = organizations.filter((o) => o.is_partner).length;
  const totalUsers = organizations.reduce((acc, o) => acc + (o.user_count || 0), 0);
  const totalMonthlyRevenue = organizations
    .filter((o) => o.is_active && !o.is_partner)
    .reduce((acc, o) => acc + calculateMonthlyCost(o.max_users, o.max_channels), 0);
  
  // Organizations close to expiry (within 15 days) - excluding partners
  const expiringOrgs = organizations.filter((o) => 
    o.is_active && 
    !o.is_partner &&
    o.days_until_expiry !== undefined && 
    o.days_until_expiry <= 15 && 
    o.days_until_expiry >= 0
  ).sort((a, b) => (a.days_until_expiry || 0) - (b.days_until_expiry || 0));
  
  // Expired organizations - excluding partners
  const expiredOrgs = organizations.filter((o) => 
    !o.is_partner &&
    o.days_until_expiry !== undefined && 
    o.days_until_expiry < 0
  );

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
        <div className="grid gap-4 md:grid-cols-5">
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
          <Card className={partnerOrgs > 0 ? "border-primary/30 bg-primary/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Parceiros
              </CardTitle>
              <Activity className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{partnerOrgs}</div>
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

        {/* Expiring Soon Alert */}
        {(expiringOrgs.length > 0 || expiredOrgs.length > 0) && (
          <Card className="border-warning/50 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-5 h-5" />
                Planos Próximos do Vencimento
              </CardTitle>
              <CardDescription>
                Clientes que precisam de atenção para renovação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiredOrgs.map((org) => (
                  <div 
                    key={org.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center">
                        <XCircle className="w-4 h-4 text-destructive" />
                      </div>
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Venceu há {Math.abs(org.days_until_expiry || 0)} dia(s)
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                    >
                      Ver detalhes
                    </Button>
                  </div>
                ))}
                {expiringOrgs.map((org) => (
                  <div 
                    key={org.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-warning/10 border border-warning/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-warning" />
                      </div>
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {org.days_until_expiry === 0 
                            ? "Vence hoje!" 
                            : `Vence em ${org.days_until_expiry} dia(s)`}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                    >
                      Ver detalhes
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="clients" className="space-y-4">
          <TabsList>
            <TabsTrigger value="clients" className="gap-2">
              <Building2 className="w-4 h-4" />
              Clientes
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2">
              <CreditCard className="w-4 h-4" />
              Pagamentos
            </TabsTrigger>
            <TabsTrigger value="store" className="gap-2">
              <ShoppingBag className="w-4 h-4" />
              Loja
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-2">
              <DollarSign className="w-4 h-4" />
              Precificação
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <ShieldCheck className="w-4 h-4" />
              Segurança
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-2">
              <Activity className="w-4 h-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              Diagnóstico
            </TabsTrigger>
          </TabsList>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <PaymentHistoryPanel />
          </TabsContent>

          {/* Store Tab */}
          <TabsContent value="store">
            <StoreManagementPanel />
          </TabsContent>

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
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrganizations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Nenhum cliente encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrganizations.map((org) => {
                      const monthlyCost = org.is_partner ? 0 : calculateMonthlyCost(org.max_users, org.max_channels);
                      // Determine display status based on conditions
                      let displayStatus = org.subscription_status;
                      if (!org.is_active) {
                        displayStatus = "inactive";
                      } else if (org.is_partner) {
                        displayStatus = "partner";
                      } else if (!org.max_users && !org.max_channels && !org.subscription_started_at) {
                        displayStatus = "pending";
                      }
                      return (
                        <TableRow key={org.id} className={!org.is_active ? "opacity-50" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-medium">{org.name}</p>
                                <p className="text-sm text-muted-foreground">{org.slug}</p>
                              </div>
                              {org.is_partner && (
                                <Badge variant="outline" className="border-primary/50 text-primary text-xs">
                                  Parceiro
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {org.is_partner ? (
                              <span className="text-muted-foreground text-sm">Parceiro</span>
                            ) : (
                              <span className="font-medium text-primary">
                                R$ {monthlyCost.toFixed(2)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusConfig[displayStatus]?.className || ""}>
                              {statusConfig[displayStatus]?.label || displayStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {org.user_count || 0} / {org.max_users}
                          </TableCell>
                          <TableCell>
                            {org.max_channels}
                          </TableCell>
                          <TableCell>
                            {org.subscription_ends_at ? (
                              <div className="flex items-center gap-1">
                                {org.days_until_expiry !== undefined && org.days_until_expiry < 0 ? (
                                  <Badge className="bg-destructive/10 text-destructive">
                                    Vencido
                                  </Badge>
                                ) : org.days_until_expiry !== undefined && org.days_until_expiry <= 7 ? (
                                  <Badge className="bg-warning/10 text-warning">
                                    {org.days_until_expiry}d
                                  </Badge>
                                ) : (
                                  <span className="text-sm">
                                    {new Date(org.subscription_ends_at).toLocaleDateString("pt-BR")}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
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
                              <DropdownMenuItem 
                                className="gap-2"
                                onClick={() => {
                                  setSelectedOrgForBalance(org);
                                  setIsBalanceDialogOpen(true);
                                }}
                              >
                                <Wallet className="w-4 h-4" />
                                Recarregar Saldo
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
                <CardTitle>Atualização Forçada</CardTitle>
                <CardDescription>
                  Dispara um broadcast em tempo real que limpa cache e recarrega
                  TODOS os atendentes online (de todas as organizações).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (!confirm("Recarregar TODOS os atendentes online agora?")) return;
                    const { data, error } = await supabase.functions.invoke(
                      "broadcast-force-reload",
                      { body: { reason: "manual-superadmin", hard: true } },
                    );
                    if (error) {
                      toast({
                        title: "Falha ao disparar",
                        description: error.message,
                        variant: "destructive",
                      });
                      return;
                    }
                    toast({
                      title: "Disparo enviado",
                      description: `Versão ${(data as { version?: string })?.version ?? "?"} broadcastada`,
                    });
                  }}
                >
                  Forçar reload em todos os atendentes online
                </Button>
                <p className="text-xs text-muted-foreground">
                  Atendentes que estiverem com o bundle antigo (anterior a esta
                  atualização) precisam dar Ctrl+Shift+R uma única vez. Daí em
                  diante todos recebem reload automático a cada disparo.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <RlsRegressionPanel />
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance">
            <PerformanceMetricsPanel />
          </TabsContent>

          <TabsContent value="diagnostics">
            <UnreadDivergencePanel />
          </TabsContent>
        </Tabs>

        {/* New Organization Dialog */}
        <Dialog open={isNewOrgDialogOpen} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>
                Cadastre uma nova organização e crie o usuário administrador
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto pr-2">
            
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

                {/* Plan Type Selection */}
                <div className="space-y-2">
                  <Label>Tipo de Plano</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewOrgPlanType("mensal")}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        newOrgPlanType === "mensal"
                          ? "border-primary bg-primary/10" 
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className={`w-4 h-4 ${newOrgPlanType === "mensal" ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`font-medium text-sm ${newOrgPlanType === "mensal" ? "text-primary" : "text-foreground"}`}>
                          Mensal
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 text-left">
                        Cobrança automática
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewOrgPlanType("parceiro")}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        newOrgPlanType === "parceiro"
                          ? "border-primary bg-primary/10" 
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${newOrgPlanType === "parceiro" ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`font-medium text-sm ${newOrgPlanType === "parceiro" ? "text-primary" : "text-foreground"}`}>
                          Parceiro
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 text-left">
                        Sem assinatura
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewOrgPlanType("personalizado")}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        newOrgPlanType === "personalizado"
                          ? "border-primary bg-primary/10" 
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <DollarSign className={`w-4 h-4 ${newOrgPlanType === "personalizado" ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`font-medium text-sm ${newOrgPlanType === "personalizado" ? "text-primary" : "text-foreground"}`}>
                          Personalizado
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 text-left">
                        Valor fixo
                      </p>
                    </button>
                  </div>
                </div>

                {/* Custom Price Input */}
                {newOrgPlanType === "personalizado" && (
                  <div className="space-y-2">
                    <Label>Valor Mensal Fixo (R$) *</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newOrgCustomPrice}
                      onChange={(e) => setNewOrgCustomPrice(e.target.value)}
                      placeholder="Ex: 199.90"
                    />
                    <p className="text-xs text-muted-foreground">
                      Este valor será cobrado mensalmente, independente de usuários ou canais.
                    </p>
                  </div>
                )}

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

                {newOrgPlanType !== "parceiro" && (
                  <div className="space-y-2">
                    <Label>Data de Vencimento</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newOrgExpiryDate ? format(newOrgExpiryDate, "dd/MM/yyyy") : "Selecione uma data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={newOrgExpiryDate}
                          onSelect={setNewOrgExpiryDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Plan Summary */}
                {newOrgPlanType === "mensal" && subscriptionPricing && (
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

                {newOrgPlanType === "parceiro" && (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                    <p className="text-sm font-medium text-primary">Plano Parceiro</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sem cobrança automática de assinatura. O cliente só pagará por recursos adicionais na loja.
                    </p>
                  </div>
                )}

                {newOrgPlanType === "personalizado" && newOrgCustomPrice && (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                    <p className="text-sm font-medium text-primary">
                      Valor mensal fixo: R$ {parseFloat(newOrgCustomPrice).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Este valor será cobrado mensalmente, independente da quantidade de usuários ou canais.
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

                <div className="space-y-2">
                  <Label>Senha *</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => setAdminPassword(generateSecurePassword())}
                    >
                      Gerar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O cliente poderá alterar a senha após o primeiro acesso.
                  </p>
                </div>
              </div>
            )}
            </div>
            
            <DialogFooter className="flex-shrink-0 pt-4 border-t">
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
          <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Editar Cliente</DialogTitle>
              <DialogDescription>
                Altere os dados da organização e do administrador
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div className="space-y-2">
                <Label>Nome da Empresa</Label>
                <Input
                  value={editOrgName}
                  onChange={(e) => setEditOrgName(e.target.value)}
                  placeholder="Nome da empresa"
                />
              </div>

              <div className="space-y-2">
                <Label>Plano</Label>
                <Select
                  value={editOrgPlan}
                  onValueChange={(value: PlanType) => setEditOrgPlan(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Plano Mensal</SelectItem>
                    <SelectItem value="parceiro">Plano Parceiro</SelectItem>
                    <SelectItem value="personalizado">Plano Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Price Input for Edit */}
              {editOrgPlan === "personalizado" && (
                <div className="space-y-2">
                  <Label>Valor Mensal Fixo (R$) *</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editOrgCustomPrice}
                    onChange={(e) => setEditOrgCustomPrice(e.target.value)}
                    placeholder="Ex: 199.90"
                  />
                  <p className="text-xs text-muted-foreground">
                    Este valor será cobrado mensalmente, independente de usuários ou canais.
                  </p>
                </div>
              )}
              
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

              {editOrgPlan !== "parceiro" && (
                <div className="space-y-2">
                  <Label>Data de Vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editOrgExpiryDate ? format(editOrgExpiryDate, "dd/MM/yyyy") : "Sem vencimento definido"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editOrgExpiryDate}
                        onSelect={setEditOrgExpiryDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Plan Summary */}
              {editOrgPlan === "mensal" && subscriptionPricing && (
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

              {editOrgPlan === "parceiro" && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-primary">Plano Parceiro</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sem cobrança de assinatura. O cliente só paga por recursos adicionais.
                  </p>
                </div>
              )}

              {editOrgPlan === "personalizado" && editOrgCustomPrice && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <p className="text-sm font-medium text-primary">
                      Valor mensal fixo: R$ {parseFloat(editOrgCustomPrice).toFixed(2)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Este valor será cobrado mensalmente, independente da quantidade de usuários ou canais.
                  </p>
                </div>
              )}

              {/* Admin User Section */}
              <div className="pt-2 border-t">
                <p className="text-sm font-medium text-muted-foreground mb-3">Dados do Administrador</p>
                
                {loadingAdminData ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Nome do Admin</Label>
                      <Input
                        value={editAdminName}
                        onChange={(e) => setEditAdminName(e.target.value)}
                        placeholder="Nome do administrador"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Email do Admin</Label>
                      <Input
                        type="email"
                        value={editAdminEmail}
                        onChange={(e) => setEditAdminEmail(e.target.value)}
                        placeholder="email@empresa.com"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Nova Senha (deixe vazio para manter)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          value={editAdminPassword}
                          onChange={(e) => setEditAdminPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                        />
                        <Button 
                          type="button" 
                          variant="outline"
                          onClick={() => setEditAdminPassword(generateSecurePassword())}
                        >
                          Gerar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Deixe em branco para manter a senha atual.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter className="flex-shrink-0 pt-4 border-t">
              <Button variant="outline" onClick={handleCloseEditDialog}>
                Cancelar
              </Button>
              <Button onClick={handleSaveOrganization} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Balance/Recharge Dialog */}
        <Dialog open={isBalanceDialogOpen} onOpenChange={(open) => {
          setIsBalanceDialogOpen(open);
          if (!open) setSelectedOrgForBalance(null);
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Recarregar Saldo
              </DialogTitle>
              <DialogDescription>
                {selectedOrgForBalance?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto">
              {selectedOrgForBalance && (
                <OrganizationBalancePanel
                  organizationId={selectedOrgForBalance.id}
                  organizationName={selectedOrgForBalance.name}
                  showAddCredits={true}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Emergency Fix - Delete Orphan User */}
        <Card className="mt-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Correção de Emergência
            </CardTitle>
            <CardDescription>
              Deletar usuário órfão (existe em auth.users mas não tem profile)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="ID do usuário (UUID)"
                value={orphanUserId}
                onChange={(e) => setOrphanUserId(e.target.value)}
                className="max-w-md"
              />
              <Button 
                variant="destructive" 
                onClick={handleDeleteOrphanUser}
                disabled={isDeletingOrphan || !orphanUserId.trim()}
              >
                {isDeletingOrphan ? "Excluindo..." : "Excluir Usuário"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Use para deletar: <code className="bg-muted px-1 rounded">55b7662e-6904-452f-9e3f-31e034633519</code> (supervisor órfão com email financeiro@lepfinanceira.com.br)
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
