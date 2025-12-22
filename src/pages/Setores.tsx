import { useState, useEffect } from "react";
import {
  Building2,
  Plus,
  Search,
  Trash2,
  Edit,
  Users,
  Save,
  X,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

interface Sector {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  users: SectorUser[];
}

interface SectorUser {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
}

interface AvailableUser {
  user_id: string;
  email: string;
  display_name: string | null;
}

const Setores = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [searchTerm, setSearchTerm] = useState("");
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isManageUsersDialogOpen, setIsManageUsersDialogOpen] = useState(false);
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);

  // Form states
  const [sectorName, setSectorName] = useState("");
  const [sectorDescription, setSectorDescription] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const fetchSectors = async () => {
    try {
      const { data: sectorsData, error: sectorsError } = await supabase
        .from("sectors")
        .select("*")
        .order("name");

      if (sectorsError) throw sectorsError;

      // Get user sectors with profiles
      const { data: userSectorsData, error: userSectorsError } = await supabase
        .from("user_sectors")
        .select("id, user_id, sector_id");

      if (userSectorsError) throw userSectorsError;

      // Get profiles for the users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, email, display_name");

      if (profilesError) throw profilesError;

      // Combine data
      const sectorsWithUsers: Sector[] = (sectorsData || []).map((sector) => {
        const sectorUserIds = userSectorsData
          ?.filter((us) => us.sector_id === sector.id)
          .map((us) => us.user_id) || [];

        const users: SectorUser[] = sectorUserIds
          .map((userId) => {
            const profile = profiles?.find((p) => p.user_id === userId);
            if (!profile) return null;
            return {
              id: userSectorsData?.find(
                (us) => us.sector_id === sector.id && us.user_id === userId
              )?.id || "",
              user_id: userId,
              email: profile.email || "",
              display_name: profile.display_name,
            };
          })
          .filter(Boolean) as SectorUser[];

        return {
          ...sector,
          users,
        };
      });

      setSectors(sectorsWithUsers);
    } catch (error) {
      console.error("Error fetching sectors:", error);
      toast.error("Erro ao carregar setores");
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, display_name")
        .order("email");

      if (error) throw error;

      setAvailableUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSectors(), fetchAvailableUsers()]);
      setLoading(false);
    };

    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const handleCreateSector = async () => {
    if (!sectorName.trim()) {
      toast.error("Nome do setor é obrigatório");
      return;
    }

    try {
      const { error } = await supabase.from("sectors").insert({
        name: sectorName.trim(),
        description: sectorDescription.trim() || null,
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success("Setor criado com sucesso");
      setSectorName("");
      setSectorDescription("");
      setIsCreateDialogOpen(false);
      fetchSectors();
    } catch (error) {
      console.error("Error creating sector:", error);
      toast.error("Erro ao criar setor");
    }
  };

  const handleUpdateSector = async () => {
    if (!selectedSector || !sectorName.trim()) {
      toast.error("Nome do setor é obrigatório");
      return;
    }

    try {
      const { error } = await supabase
        .from("sectors")
        .update({
          name: sectorName.trim(),
          description: sectorDescription.trim() || null,
        })
        .eq("id", selectedSector.id);

      if (error) throw error;

      toast.success("Setor atualizado com sucesso");
      setIsEditDialogOpen(false);
      setSelectedSector(null);
      setSectorName("");
      setSectorDescription("");
      fetchSectors();
    } catch (error) {
      console.error("Error updating sector:", error);
      toast.error("Erro ao atualizar setor");
    }
  };

  const handleDeleteSector = async (sectorId: string) => {
    try {
      // First delete all user_sectors for this sector
      await supabase.from("user_sectors").delete().eq("sector_id", sectorId);

      // Then delete the sector
      const { error } = await supabase
        .from("sectors")
        .delete()
        .eq("id", sectorId);

      if (error) throw error;

      toast.success("Setor removido com sucesso");
      fetchSectors();
    } catch (error) {
      console.error("Error deleting sector:", error);
      toast.error("Erro ao remover setor");
    }
  };

  const handleManageUsers = (sector: Sector) => {
    setSelectedSector(sector);
    setSelectedUserIds(sector.users.map((u) => u.user_id));
    setIsManageUsersDialogOpen(true);
  };

  const handleSaveUserAssignments = async () => {
    if (!selectedSector) return;

    try {
      // Get current user IDs for this sector
      const currentUserIds = selectedSector.users.map((u) => u.user_id);

      // Find users to add and remove
      const usersToAdd = selectedUserIds.filter(
        (id) => !currentUserIds.includes(id)
      );
      const usersToRemove = currentUserIds.filter(
        (id) => !selectedUserIds.includes(id)
      );

      // Add new users
      if (usersToAdd.length > 0) {
        const { error: insertError } = await supabase
          .from("user_sectors")
          .insert(
            usersToAdd.map((userId) => ({
              user_id: userId,
              sector_id: selectedSector.id,
            }))
          );

        if (insertError) throw insertError;
      }

      // Remove users
      if (usersToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from("user_sectors")
          .delete()
          .eq("sector_id", selectedSector.id)
          .in("user_id", usersToRemove);

        if (deleteError) throw deleteError;
      }

      toast.success("Usuários atualizados com sucesso");
      setIsManageUsersDialogOpen(false);
      setSelectedSector(null);
      setSelectedUserIds([]);
      fetchSectors();
    } catch (error) {
      console.error("Error updating user assignments:", error);
      toast.error("Erro ao atualizar usuários");
    }
  };

  const openEditDialog = (sector: Sector) => {
    setSelectedSector(sector);
    setSectorName(sector.name);
    setSectorDescription(sector.description || "");
    setIsEditDialogOpen(true);
  };

  const filteredSectors = sectors.filter(
    (sector) =>
      sector.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sector.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Temporarily disabled admin check for debugging
  // TODO: Re-enable after fixing access issue

  if (roleLoading || loading) {
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
            <h1 className="text-2xl font-bold text-foreground">Setores</h1>
            <p className="text-muted-foreground">
              Gerencie os setores e seus usuários
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Setor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Setor</DialogTitle>
                <DialogDescription>
                  Crie um setor para organizar seus usuários
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="createSectorName">Nome do Setor</Label>
                  <Input
                    id="createSectorName"
                    placeholder="Ex: Vendas, Suporte, Financeiro"
                    value={sectorName}
                    onChange={(e) => setSectorName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="createSectorDescription">
                    Descrição (opcional)
                  </Label>
                  <Textarea
                    id="createSectorDescription"
                    placeholder="Descreva as responsabilidades deste setor"
                    value={sectorDescription}
                    onChange={(e) => setSectorDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setSectorName("");
                    setSectorDescription("");
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={handleCreateSector}>Criar Setor</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Setores
              </CardTitle>
              <Building2 className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {sectors.length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Usuários Atribuídos
              </CardTitle>
              <Users className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {sectors.reduce((acc, s) => acc + s.users.length, 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Média por Setor
              </CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {sectors.length > 0
                  ? (
                      sectors.reduce((acc, s) => acc + s.users.length, 0) /
                      sectors.length
                    ).toFixed(1)
                  : 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar setores..."
            className="pl-10 bg-muted/30 border-border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Sectors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSectors.length === 0 ? (
            <Card className="col-span-full bg-card border-border">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Nenhum setor encontrado
                </h3>
                <p className="text-muted-foreground mb-4">
                  Crie setores para organizar seus usuários
                </p>
                <Button
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Criar primeiro setor
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredSectors.map((sector) => (
              <Card key={sector.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-foreground text-lg">
                        {sector.name}
                      </CardTitle>
                      {sector.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {sector.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(sector)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover setor?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Todos os usuários
                              serão desvinculados deste setor.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteSector(sector.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* User count and manage button */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{sector.users.length} usuário(s)</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleManageUsers(sector)}
                    >
                      Gerenciar
                    </Button>
                  </div>

                  {/* User avatars */}
                  {sector.users.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {sector.users.slice(0, 5).map((u) => (
                        <div
                          key={u.user_id}
                          className="flex items-center gap-2 bg-muted/30 rounded-full px-2 py-1"
                        >
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                              {(u.display_name || u.email)
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-foreground truncate max-w-[100px]">
                            {u.display_name || u.email}
                          </span>
                        </div>
                      ))}
                      {sector.users.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{sector.users.length - 5}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Edit Sector Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Setor</DialogTitle>
              <DialogDescription>
                Atualize as informações do setor
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editSectorName">Nome do Setor</Label>
                <Input
                  id="editSectorName"
                  placeholder="Ex: Vendas, Suporte, Financeiro"
                  value={sectorName}
                  onChange={(e) => setSectorName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editSectorDescription">
                  Descrição (opcional)
                </Label>
                <Textarea
                  id="editSectorDescription"
                  placeholder="Descreva as responsabilidades deste setor"
                  value={sectorDescription}
                  onChange={(e) => setSectorDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedSector(null);
                  setSectorName("");
                  setSectorDescription("");
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleUpdateSector}>
                <Save className="w-4 h-4 mr-2" />
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage Users Dialog */}
        <Dialog
          open={isManageUsersDialogOpen}
          onOpenChange={setIsManageUsersDialogOpen}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Gerenciar Usuários</DialogTitle>
              <DialogDescription>
                Selecione os usuários para o setor "{selectedSector?.name}"
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {availableUsers.map((u) => (
                  <div
                    key={u.user_id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30"
                  >
                    <Checkbox
                      id={`user-${u.user_id}`}
                      checked={selectedUserIds.includes(u.user_id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedUserIds([...selectedUserIds, u.user_id]);
                        } else {
                          setSelectedUserIds(
                            selectedUserIds.filter((id) => id !== u.user_id)
                          );
                        }
                      }}
                    />
                    <label
                      htmlFor={`user-${u.user_id}`}
                      className="flex items-center gap-2 flex-1 cursor-pointer"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {(u.display_name || u.email).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {u.display_name || "Sem nome"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {u.email}
                        </div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsManageUsersDialogOpen(false);
                  setSelectedSector(null);
                  setSelectedUserIds([]);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSaveUserAssignments}>
                <Save className="w-4 h-4 mr-2" />
                Salvar ({selectedUserIds.length} selecionado
                {selectedUserIds.length !== 1 ? "s" : ""})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default Setores;
