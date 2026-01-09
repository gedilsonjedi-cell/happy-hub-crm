import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Edit,
  Trash2,
  GripVertical,
  Type,
  Hash,
  Calendar,
  List,
  ToggleLeft,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

interface CustomFieldDefinition {
  id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  field_options: string[] | null;
  is_required: boolean | null;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

const FIELD_TYPES = [
  { value: "text", label: "Texto", icon: Type },
  { value: "number", label: "Número", icon: Hash },
  { value: "date", label: "Data", icon: Calendar },
  { value: "select", label: "Lista de opções", icon: List },
  { value: "boolean", label: "Sim/Não", icon: ToggleLeft },
  { value: "textarea", label: "Texto longo", icon: FileText },
];

// Normalize field name to avoid duplicates (CPF = cpf = Cpf)
const normalizeFieldName = (name: string): string => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, "_") // Replace special chars with underscore
    .replace(/_+/g, "_") // Replace multiple underscores with single
    .replace(/^_|_$/g, ""); // Remove leading/trailing underscores
};

export default function CamposPersonalizados() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  
  const [showDialog, setShowDialog] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form states
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  // Fetch user's organization
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch custom field definitions
  const { data: customFields = [], isLoading } = useQuery({
    queryKey: ["custom-field-definitions", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("lead_custom_field_definitions")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as CustomFieldDefinition[];
    },
    enabled: !!profile?.organization_id,
  });

  const openCreateDialog = () => {
    setEditingField(null);
    setFieldLabel("");
    setFieldType("text");
    setFieldOptions("");
    setIsRequired(false);
    setShowDialog(true);
  };

  const openEditDialog = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setFieldLabel(field.field_label);
    setFieldType(field.field_type);
    setFieldOptions(field.field_options?.join("\n") || "");
    setIsRequired(field.is_required || false);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!fieldLabel.trim()) {
      toast.error("Informe o nome do campo");
      return;
    }

    if (fieldType === "select" && !fieldOptions.trim()) {
      toast.error("Informe as opções para o campo de lista");
      return;
    }

    if (!profile?.organization_id) {
      toast.error("Organização não encontrada");
      return;
    }

    const normalizedName = normalizeFieldName(fieldLabel);
    
    // Check for duplicates (only for new fields or when label changed)
    if (!editingField || normalizeFieldName(editingField.field_label) !== normalizedName) {
      const existingField = customFields.find(
        (f) => normalizeFieldName(f.field_label) === normalizedName && f.id !== editingField?.id
      );
      
      if (existingField) {
        toast.error(`Já existe um campo similar: "${existingField.field_label}"`);
        return;
      }
    }

    setIsSaving(true);

    try {
      const fieldData = {
        field_name: normalizedName,
        field_label: fieldLabel.trim(),
        field_type: fieldType,
        field_options: fieldType === "select" 
          ? fieldOptions.split("\n").map((o) => o.trim()).filter(Boolean)
          : null,
        is_required: isRequired,
        organization_id: profile.organization_id,
      };

      if (editingField) {
        const { error } = await supabase
          .from("lead_custom_field_definitions")
          .update(fieldData)
          .eq("id", editingField.id);
        
        if (error) throw error;
        toast.success("Campo atualizado com sucesso");
      } else {
        const maxOrder = Math.max(0, ...customFields.map((f) => f.display_order || 0));
        const { error } = await supabase
          .from("lead_custom_field_definitions")
          .insert({
            ...fieldData,
            display_order: maxOrder + 1,
          });
        
        if (error) throw error;
        toast.success("Campo criado com sucesso");
      }

      queryClient.invalidateQueries({ queryKey: ["custom-field-definitions"] });
      setShowDialog(false);
    } catch (error: any) {
      console.error("Error saving field:", error);
      toast.error(error.message || "Erro ao salvar campo");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (field: CustomFieldDefinition) => {
    try {
      const { error } = await supabase
        .from("lead_custom_field_definitions")
        .delete()
        .eq("id", field.id);
      
      if (error) throw error;
      
      toast.success("Campo excluído com sucesso");
      queryClient.invalidateQueries({ queryKey: ["custom-field-definitions"] });
    } catch (error: any) {
      console.error("Error deleting field:", error);
      toast.error(error.message || "Erro ao excluir campo");
    }
  };

  const getFieldTypeIcon = (type: string) => {
    const fieldType = FIELD_TYPES.find((t) => t.value === type);
    return fieldType?.icon || Type;
  };

  const getFieldTypeLabel = (type: string) => {
    const fieldType = FIELD_TYPES.find((t) => t.value === type);
    return fieldType?.label || type;
  };

  if (roleLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin && !isSuperAdmin) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertCircle className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Apenas administradores podem gerenciar campos personalizados.
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campos Personalizados</h1>
            <p className="text-muted-foreground">
              Defina campos adicionais para os contatos da sua organização
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Campo
          </Button>
        </div>

        {/* Info Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p>
                  Os campos personalizados criados aqui estarão disponíveis para todos os contatos 
                  da organização. Ao importar planilhas, o sistema detectará automaticamente colunas 
                  com nomes similares aos campos cadastrados.
                </p>
                <p className="mt-2">
                  <strong>Exemplo:</strong> Se você criar um campo "Empresa", colunas como "empresa", 
                  "EMPRESA" ou "Empresa" serão automaticamente mapeadas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fields Table */}
        <Card>
          <CardHeader>
            <CardTitle>Campos Cadastrados</CardTitle>
            <CardDescription>
              {customFields.length === 0 
                ? "Nenhum campo personalizado cadastrado ainda"
                : `${customFields.length} campo(s) cadastrado(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : customFields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum campo personalizado cadastrado.</p>
                <p className="text-sm">Clique em "Novo Campo" para começar.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Nome do Campo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Obrigatório</TableHead>
                    <TableHead>Opções</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customFields.map((field) => {
                    const Icon = getFieldTypeIcon(field.field_type);
                    return (
                      <TableRow key={field.id}>
                        <TableCell>
                          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                            {field.field_label}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {field.field_name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getFieldTypeLabel(field.field_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {field.is_required ? (
                            <Badge variant="default">Sim</Badge>
                          ) : (
                            <span className="text-muted-foreground">Não</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {field.field_options && field.field_options.length > 0 ? (
                            <span className="text-sm text-muted-foreground">
                              {field.field_options.length} opções
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(field)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir campo?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir o campo "{field.field_label}"? 
                                    Os dados já salvos nos contatos não serão afetados, mas o campo 
                                    não aparecerá mais em novos formulários.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(field)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingField ? "Editar Campo" : "Novo Campo Personalizado"}
            </DialogTitle>
            <DialogDescription>
              {editingField 
                ? "Edite as informações do campo personalizado"
                : "Crie um novo campo para os contatos da sua organização"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fieldLabel">Nome do Campo *</Label>
              <Input
                id="fieldLabel"
                value={fieldLabel}
                onChange={(e) => setFieldLabel(e.target.value)}
                placeholder="Ex: Empresa, Cargo, Data de Nascimento..."
              />
              {fieldLabel && (
                <p className="text-xs text-muted-foreground">
                  Identificador: <code className="bg-muted px-1 rounded">{normalizeFieldName(fieldLabel)}</code>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fieldType">Tipo do Campo *</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {fieldType === "select" && (
              <div className="space-y-2">
                <Label htmlFor="fieldOptions">Opções (uma por linha) *</Label>
                <Textarea
                  id="fieldOptions"
                  value={fieldOptions}
                  onChange={(e) => setFieldOptions(e.target.value)}
                  placeholder={"Opção 1\nOpção 2\nOpção 3"}
                  rows={4}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isRequired">Campo obrigatório</Label>
                <p className="text-xs text-muted-foreground">
                  Exigir preenchimento ao cadastrar contatos
                </p>
              </div>
              <Switch
                id="isRequired"
                checked={isRequired}
                onCheckedChange={setIsRequired}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingField ? "Salvar" : "Criar Campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}