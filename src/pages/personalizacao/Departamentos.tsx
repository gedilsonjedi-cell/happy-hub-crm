import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { Building2, Plus, Trash2, Edit2, Save, X, Star } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


export default function Departamentos() {
  const { user } = useAuth();
  const { effectiveOrganizationId, isLoading: orgLoading } = useEffectiveOrganizationId();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDepartment, setNewDepartment] = useState({
    name: "",
    description: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
  });

  const { data: departments, isLoading } = useQuery({
    queryKey: ["sectors", effectiveOrganizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sectors")
        .select("*")
        .eq("organization_id", effectiveOrganizationId!)
        .order("name");
      return data || [];
    },
    enabled: !!effectiveOrganizationId,
  });

  const { data: orgConfig } = useQuery({
    queryKey: ["org-default-sector", effectiveOrganizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("auto_distribute_enabled, default_sector_id")
        .eq("id", effectiveOrganizationId!)
        .maybeSingle();
      return data;
    },
    enabled: !!effectiveOrganizationId,
  });

  const defaultSectorId = orgConfig?.default_sector_id ?? null;
  const autoDistributeEnabled = !!orgConfig?.auto_distribute_enabled;

  const defaultSectorMutation = useMutation({
    mutationFn: async ({ sectorId, enabled }: { sectorId: string | null; enabled: boolean }) => {
      const { error } = await supabase.rpc("set_org_default_sector", {
        _organization_id: effectiveOrganizationId!,
        _sector_id: sectorId,
        _enabled: enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-default-sector"] });
      toast.success("Configuração de departamento padrão atualizada!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar departamento padrão");
    },
  });



  const addMutation = useMutation({
    mutationFn: async (dept: typeof newDepartment) => {
      // Ensure we have a valid organization ID before inserting
      if (!effectiveOrganizationId) {
        throw new Error("Organization ID não disponível. Aguarde o carregamento.");
      }
      
      console.log("[Departamentos] Creating sector with org_id:", effectiveOrganizationId);
      
      const { error } = await supabase.from("sectors").insert({
        organization_id: effectiveOrganizationId,
        created_by: user!.id,
        name: dept.name,
        description: dept.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sectors"] });
      setDialogOpen(false);
      setNewDepartment({ name: "", description: "" });
      toast.success("Departamento criado com sucesso!");
    },
    onError: (error: any) => {
      console.error("[Departamentos] Error creating sector:", error);
      toast.error(error.message || "Erro ao criar departamento");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editForm }) => {
      const { error } = await supabase
        .from("sectors")
        .update({
          name: data.name,
          description: data.description || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sectors"] });
      setEditingId(null);
      toast.success("Departamento atualizado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar departamento");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sectors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sectors"] });
      toast.success("Departamento removido com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao remover departamento");
    },
  });

  const handleAdd = () => {
    if (!newDepartment.name) {
      toast.error("Preencha o nome do departamento");
      return;
    }
    if (!effectiveOrganizationId) {
      toast.error("Aguarde o carregamento da organização");
      return;
    }
    addMutation.mutate(newDepartment);
  };

  const startEdit = (dept: any) => {
    setEditingId(dept.id);
    setEditForm({
      name: dept.name,
      description: dept.description || "",
    });
  };

  const saveEdit = (id: string) => {
    if (!editForm.name) {
      toast.error("Preencha o nome do departamento");
      return;
    }
    updateMutation.mutate({ id, data: editForm });
  };

  // Só mostra o spinner de tela cheia no primeiro carregamento (sem dados em
  // cache). Refetches em background mantêm a tela montada — sem flicker.
  if (!departments && (isLoading || orgLoading)) {

    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Departamentos</h1>
            <p className="text-muted-foreground">Gerencie os departamentos da organização</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Departamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Departamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={newDepartment.name}
                    onChange={(e) =>
                      setNewDepartment((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Ex: Vendas"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição (opcional)</Label>
                  <Textarea
                    value={newDepartment.description}
                    onChange={(e) =>
                      setNewDepartment((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Descrição do departamento..."
                    rows={3}
                  />
                </div>
                <Button onClick={handleAdd} disabled={addMutation.isPending} className="w-full">
                  Criar Departamento
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5" />
              Distribuição automática para departamento padrão
            </CardTitle>
            <CardDescription>
              Quando ativada, toda conversa nova que chegar sem departamento definido cai
              automaticamente no departamento padrão e é distribuída entre os atendentes desse
              departamento, em vez de ficar na fila geral de "Novos".
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <Label>Ativar distribuição automática</Label>
              <p className="text-sm text-muted-foreground">
                Departamento padrão:{" "}
                <span className="font-medium text-foreground">
                  {departments?.find((d) => d.id === defaultSectorId)?.name || "nenhum selecionado"}
                </span>
              </p>
            </div>
            <Switch
              checked={autoDistributeEnabled}
              disabled={defaultSectorMutation.isPending || (!defaultSectorId && !autoDistributeEnabled)}
              onCheckedChange={(checked) =>
                defaultSectorMutation.mutate({ sectorId: defaultSectorId, enabled: checked })
              }
            />
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Lista de Departamentos
            </CardTitle>
            <CardDescription>
              Departamentos disponíveis para atribuição de usuários
            </CardDescription>
          </CardHeader>
          <CardContent>
            {departments && departments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-40">Padrão</TableHead>
                    <TableHead className="w-28">Ações</TableHead>

                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((dept) => (
                    <TableRow key={dept.id}>
                      <TableCell>
                        {editingId === dept.id ? (
                          <Input
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm((prev) => ({ ...prev, name: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="font-medium">{dept.name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === dept.id ? (
                          <Input
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((prev) => ({ ...prev, description: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">
                            {dept.description || "-"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={defaultSectorMutation.isPending}
                                  onClick={() =>
                                    defaultSectorMutation.mutate(
                                      defaultSectorId === dept.id
                                        ? { sectorId: null, enabled: false }
                                        : { sectorId: dept.id, enabled: true }
                                    )
                                  }
                                >
                                  <Star
                                    className={
                                      defaultSectorId === dept.id
                                        ? "w-4 h-4 fill-primary text-primary"
                                        : "w-4 h-4 text-muted-foreground"
                                    }
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {defaultSectorId === dept.id
                                  ? "Remover como departamento padrão"
                                  : "Definir como departamento padrão"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {defaultSectorId === dept.id && (
                            <Badge variant={autoDistributeEnabled ? "default" : "secondary"}>
                              {autoDistributeEnabled ? "Padrão (ativo)" : "Padrão (inativo)"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">

                          {editingId === dept.id ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => saveEdit(dept.id)}
                                disabled={updateMutation.isPending}
                              >
                                <Save className="w-4 h-4 text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingId(null)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => startEdit(dept)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteMutation.mutate(dept.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum departamento cadastrado
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
