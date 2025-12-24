import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Tag, Plus, Trash2, Edit2, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const PRESET_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#ef4444", // red
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

export default function Tags() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTag, setNewTag] = useState({
    name: "",
    color: "#3b82f6",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    color: "#3b82f6",
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: tags, isLoading } = useQuery({
    queryKey: ["lead-tags", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_tags")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("name");
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });

  const addMutation = useMutation({
    mutationFn: async (tag: typeof newTag) => {
      const { error } = await supabase.from("lead_tags").insert({
        organization_id: profile!.organization_id,
        name: tag.name,
        color: tag.color,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-tags"] });
      setDialogOpen(false);
      setNewTag({ name: "", color: "#3b82f6" });
      toast.success("Tag criada com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao criar tag");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editForm }) => {
      const { error } = await supabase
        .from("lead_tags")
        .update({
          name: data.name,
          color: data.color,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-tags"] });
      setEditingId(null);
      toast.success("Tag atualizada com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar tag");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-tags"] });
      toast.success("Tag removida com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao remover tag");
    },
  });

  const handleAdd = () => {
    if (!newTag.name) {
      toast.error("Preencha o nome da tag");
      return;
    }
    addMutation.mutate(newTag);
  };

  const startEdit = (tag: any) => {
    setEditingId(tag.id);
    setEditForm({
      name: tag.name,
      color: tag.color,
    });
  };

  const saveEdit = (id: string) => {
    if (!editForm.name) {
      toast.error("Preencha o nome da tag");
      return;
    }
    updateMutation.mutate({ id, data: editForm });
  };

  if (isLoading) {
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
            <h1 className="text-2xl font-bold text-foreground">Tags</h1>
            <p className="text-muted-foreground">Gerencie as tags para classificar leads</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Tag
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Tag</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={newTag.name}
                    onChange={(e) =>
                      setNewTag((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Ex: Cliente VIP"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewTag((prev) => ({ ...prev, color }))}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          newTag.color === color ? "border-foreground scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="pt-2">
                  <Label>Preview</Label>
                  <div className="mt-2">
                    <Badge
                      style={{ backgroundColor: newTag.color }}
                      className="text-white"
                    >
                      {newTag.name || "Nome da tag"}
                    </Badge>
                  </div>
                </div>
                <Button onClick={handleAdd} disabled={addMutation.isPending} className="w-full">
                  Criar Tag
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Lista de Tags
            </CardTitle>
            <CardDescription>
              Tags disponíveis para classificar seus leads
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tags && tags.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    {editingId === tag.id ? (
                      <div className="flex-1 space-y-2">
                        <Input
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, name: e.target.value }))
                          }
                          className="h-8"
                        />
                        <div className="flex gap-1">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() =>
                                setEditForm((prev) => ({ ...prev, color }))
                              }
                              className={`w-6 h-6 rounded-full border-2 ${
                                editForm.color === color
                                  ? "border-foreground"
                                  : "border-transparent"
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <Badge
                        style={{ backgroundColor: tag.color }}
                        className="text-white"
                      >
                        {tag.name}
                      </Badge>
                    )}
                    <div className="flex gap-1 ml-2">
                      {editingId === tag.id ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => saveEdit(tag.id)}
                            disabled={updateMutation.isPending}
                          >
                            <Save className="w-4 h-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
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
                            className="h-8 w-8"
                            onClick={() => startEdit(tag)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => deleteMutation.mutate(tag.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma tag cadastrada
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
