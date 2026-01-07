import { useState, useRef, useMemo } from "react";
import { Upload, FileSpreadsheet, AlertCircle, Check, Plus, X, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ParsedFileData {
  headers: string[];
  rows: string[][];
  fileName: string;
}

interface CustomFieldDefinition {
  id: string;
  field_name: string;
  field_label: string;
  field_type: string;
}

interface LeadTag {
  id: string;
  name: string;
  color: string;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
];

export function ImportLeadsDialog({ open, onOpenChange, onSuccess }: ImportLeadsDialogProps) {
  const { user } = useAuth();
  const { effectiveOrganizationId: organizationId } = useEffectiveOrganizationId();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<"upload" | "mapping" | "tags">("upload");
  const [parsedFileData, setParsedFileData] = useState<ParsedFileData | null>(null);
  
  // Column mapping states
  const [selectedPhoneColumn, setSelectedPhoneColumn] = useState<number | null>(null);
  const [selectedNameColumn, setSelectedNameColumn] = useState<number | null>(null);
  const [selectedEmailColumn, setSelectedEmailColumn] = useState<number | null>(null);
  const [selectedDocumentColumn, setSelectedDocumentColumn] = useState<number | null>(null);
  const [selectedCityColumn, setSelectedCityColumn] = useState<number | null>(null);
  const [selectedStateColumn, setSelectedStateColumn] = useState<number | null>(null);
  const [selectedCustomFieldColumns, setSelectedCustomFieldColumns] = useState<Record<string, number>>({});
  
  // Tags states
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  
  const [importing, setImporting] = useState(false);

  // Fetch custom field definitions
  const { data: customFieldDefinitions = [] } = useQuery({
    queryKey: ["custom-field-definitions", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("lead_custom_field_definitions")
        .select("id, field_name, field_label, field_type")
        .eq("organization_id", organizationId)
        .order("display_order");
      if (error) throw error;
      return data as CustomFieldDefinition[];
    },
    enabled: !!organizationId,
  });

  // Fetch tags
  const { data: tags = [], refetch: refetchTags } = useQuery({
    queryKey: ["lead-tags", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("lead_tags")
        .select("id, name, color")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return data as LeadTag[];
    },
    enabled: !!organizationId,
  });

  const normalizeFieldName = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      toast.error("Por favor, selecione um arquivo CSV ou TXT");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const lines = content.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length === 0) {
        toast.error("Arquivo vazio");
        return;
      }

      // Detect separator
      const firstLine = lines[0];
      let separator = ",";
      if (firstLine.includes(";")) separator = ";";
      else if (firstLine.includes("\t")) separator = "\t";

      const allRows = lines.map(line => {
        const values = line.split(separator).map(v => v.trim().replace(/^"|"$/g, ""));
        return values;
      });

      // Detect if first row is header
      const firstRow = allRows[0];
      const hasHeader = firstRow.some(cell => 
        /nome|name|telefone|phone|email|cpf|cidade|city|estado|state|celular|whatsapp/i.test(cell)
      );

      const headers = hasHeader 
        ? firstRow.map((h, i) => h || `Coluna ${i + 1}`)
        : firstRow.map((_, i) => `Coluna ${i + 1}`);
      
      const dataRows = hasHeader ? allRows.slice(1) : allRows;

      setParsedFileData({
        headers,
        rows: dataRows,
        fileName: file.name,
      });

      // Auto-detect columns
      const phoneIdx = headers.findIndex(h => /phone|telefone|celular|whatsapp|numero|número/i.test(h));
      setSelectedPhoneColumn(phoneIdx >= 0 ? phoneIdx : null);
      
      const nameIdx = headers.findIndex(h => /^nome$|^name$/i.test(h));
      setSelectedNameColumn(nameIdx >= 0 ? nameIdx : null);
      
      const emailIdx = headers.findIndex(h => /email|e-mail/i.test(h));
      setSelectedEmailColumn(emailIdx >= 0 ? emailIdx : null);
      
      const docIdx = headers.findIndex(h => /cpf|cnpj|documento|document/i.test(h));
      setSelectedDocumentColumn(docIdx >= 0 ? docIdx : null);
      
      const cityIdx = headers.findIndex(h => /cidade|city|municipio|município/i.test(h));
      setSelectedCityColumn(cityIdx >= 0 ? cityIdx : null);
      
      const stateIdx = headers.findIndex(h => /estado|state|uf/i.test(h));
      setSelectedStateColumn(stateIdx >= 0 ? stateIdx : null);

      // Auto-detect custom fields
      const detectedCustomColumns: Record<string, number> = {};
      customFieldDefinitions.forEach((field) => {
        const fieldNameNormalized = normalizeFieldName(field.field_label);
        const columnIndex = headers.findIndex((h) => {
          const headerNormalized = normalizeFieldName(h);
          return headerNormalized === fieldNameNormalized || headerNormalized === field.field_name;
        });
        if (columnIndex >= 0) {
          detectedCustomColumns[field.field_name] = columnIndex;
        }
      });
      setSelectedCustomFieldColumns(detectedCustomColumns);

      setStep("mapping");
      toast.success(`Arquivo carregado: ${dataRows.length} linhas detectadas`);
    };
    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleMappingConfirm = () => {
    if (selectedPhoneColumn === null) {
      toast.error("Selecione a coluna de telefone");
      return;
    }
    setStep("tags");
  };

  const createNewTag = async () => {
    if (!organizationId || !newTagName.trim()) {
      toast.error("Digite um nome para a tag");
      return;
    }
    
    setIsCreatingTag(true);
    
    const { data, error } = await supabase
      .from("lead_tags")
      .insert({
        name: newTagName.trim(),
        color: newTagColor,
        organization_id: organizationId,
      })
      .select()
      .single();
    
    if (error) {
      toast.error("Erro ao criar tag: " + error.message);
      setIsCreatingTag(false);
      return;
    }
    
    await refetchTags();
    setSelectedTags((prev) => [...prev, newTagName.trim()]);
    setShowCreateTag(false);
    setNewTagName("");
    setNewTagColor("#3b82f6");
    setIsCreatingTag(false);
    toast.success(`Tag "${data.name}" criada!`);
  };

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      setSelectedTags(selectedTags.filter(t => t !== tagName));
    } else {
      setSelectedTags([...selectedTags, tagName]);
    }
  };

  const handleImport = async () => {
    if (!user || !organizationId || !parsedFileData || selectedPhoneColumn === null) return;

    setImporting(true);

    try {
      // Parse all valid leads from file
      const leadsFromFile = parsedFileData.rows
        .filter(row => {
          const phone = row[selectedPhoneColumn]?.replace(/\D/g, "");
          return phone && phone.length >= 10;
        })
        .map(row => {
          const phone = row[selectedPhoneColumn].replace(/\D/g, "");
          const name = selectedNameColumn !== null ? row[selectedNameColumn] : null;
          const email = selectedEmailColumn !== null ? row[selectedEmailColumn] : null;
          const document = selectedDocumentColumn !== null ? row[selectedDocumentColumn] : null;
          const city = selectedCityColumn !== null ? row[selectedCityColumn] : null;
          const state = selectedStateColumn !== null ? row[selectedStateColumn] : null;

          // Build custom fields
          const customFields: Record<string, string> = {};
          Object.entries(selectedCustomFieldColumns).forEach(([fieldName, colIndex]) => {
            const value = row[colIndex];
            if (value) {
              customFields[fieldName] = value;
            }
          });

          return {
            phone,
            name: name?.trim() || `Lead ${phone}`,
            email: email?.trim() || null,
            document: document?.trim() || null,
            city: city?.trim() || null,
            state: state?.trim() || null,
            customFields,
          };
        });

      if (leadsFromFile.length === 0) {
        toast.error("Nenhum lead válido para importar");
        setImporting(false);
        return;
      }

      // Get all phones from the file
      const phonesFromFile = leadsFromFile.map(l => l.phone);

      // Check which phones already exist in database
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("id, phone, custom_fields, tags")
        .eq("organization_id", organizationId)
        .in("phone", phonesFromFile);

      const existingPhoneMap = new Map(
        (existingLeads || []).map(l => [l.phone, l])
      );

      // Separate into updates and inserts
      const leadsToInsert: any[] = [];
      const leadsToUpdate: { id: string; data: any }[] = [];

      for (const lead of leadsFromFile) {
        const existing = existingPhoneMap.get(lead.phone);
        
        if (existing) {
          // Merge custom fields and tags
          const mergedCustomFields = {
            ...(existing.custom_fields as Record<string, string> || {}),
            ...lead.customFields,
          };
          
          // Merge tags (existing + new selected)
          const existingTags = (existing.tags as string[]) || [];
          const mergedTags = [...new Set([...existingTags, ...selectedTags])];

          leadsToUpdate.push({
            id: existing.id,
            data: {
              name: lead.name,
              email: lead.email,
              document: lead.document,
              city: lead.city,
              state: lead.state,
              custom_fields: Object.keys(mergedCustomFields).length > 0 ? mergedCustomFields : null,
              tags: mergedTags.length > 0 ? mergedTags : null,
              updated_at: new Date().toISOString(),
            },
          });
        } else {
          leadsToInsert.push({
            organization_id: organizationId,
            user_id: user.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            document: lead.document,
            city: lead.city,
            state: lead.state,
            custom_fields: Object.keys(lead.customFields).length > 0 ? lead.customFields : null,
            tags: selectedTags.length > 0 ? selectedTags : null,
            status: "new" as const,
          });
        }
      }

      // Execute inserts
      if (leadsToInsert.length > 0) {
        const { error } = await supabase
          .from("leads")
          .insert(leadsToInsert);

        if (error) throw error;
      }

      // Execute updates in batches
      if (leadsToUpdate.length > 0) {
        for (const { id, data } of leadsToUpdate) {
          const { error } = await supabase
            .from("leads")
            .update(data)
            .eq("id", id);

          if (error) {
            console.error("Error updating lead:", id, error);
          }
        }
      }

      const tagInfo = selectedTags.length > 0 ? ` com ${selectedTags.length} tag(s)` : "";
      const insertedMsg = leadsToInsert.length > 0 ? `${leadsToInsert.length} novos` : "";
      const updatedMsg = leadsToUpdate.length > 0 ? `${leadsToUpdate.length} atualizados` : "";
      const resultParts = [insertedMsg, updatedMsg].filter(Boolean).join(", ");
      
      toast.success(`Leads importados${tagInfo}: ${resultParts}`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      onSuccess?.();
      handleReset();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao importar leads:", error);
      toast.error("Erro ao importar leads: " + error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setParsedFileData(null);
    setSelectedPhoneColumn(null);
    setSelectedNameColumn(null);
    setSelectedEmailColumn(null);
    setSelectedDocumentColumn(null);
    setSelectedCityColumn(null);
    setSelectedStateColumn(null);
    setSelectedCustomFieldColumns({});
    setSelectedTags([]);
    setShowCreateTag(false);
    setNewTagName("");
    setNewTagColor("#3b82f6");
    setStep("upload");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const previewData = useMemo(() => {
    if (!parsedFileData) return [];
    return parsedFileData.rows.slice(0, 3);
  }, [parsedFileData]);

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleReset();
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importar Leads
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Selecione um arquivo CSV para importar"}
            {step === "mapping" && "Configure o mapeamento das colunas"}
            {step === "tags" && "Adicione tags aos leads importados (opcional)"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {step === "upload" && (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    O arquivo CSV deve conter pelo menos uma coluna de <strong>telefone</strong>. 
                    Outras colunas serão detectadas automaticamente.
                  </AlertDescription>
                </Alert>

                <div 
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Clique para selecionar ou arraste o arquivo CSV
                  </p>
                  <Button variant="outline" size="sm">
                    Selecionar arquivo
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </>
            )}

            {step === "mapping" && parsedFileData && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-primary" />
                    <span className="font-medium">{parsedFileData.fileName}</span>
                    <Badge variant="secondary">{parsedFileData.rows.length} linhas</Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    Trocar arquivo
                  </Button>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Mapeamento de Colunas</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-destructive">Telefone *</Label>
                      <Select
                        value={selectedPhoneColumn?.toString() ?? ""}
                        onValueChange={(v) => setSelectedPhoneColumn(v ? parseInt(v) : null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {parsedFileData.headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Select
                        value={selectedNameColumn?.toString() ?? "none"}
                        onValueChange={(v) => setSelectedNameColumn(v === "none" ? null : parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não importar</SelectItem>
                          {parsedFileData.headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Select
                        value={selectedEmailColumn?.toString() ?? "none"}
                        onValueChange={(v) => setSelectedEmailColumn(v === "none" ? null : parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não importar</SelectItem>
                          {parsedFileData.headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>CPF/CNPJ</Label>
                      <Select
                        value={selectedDocumentColumn?.toString() ?? "none"}
                        onValueChange={(v) => setSelectedDocumentColumn(v === "none" ? null : parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não importar</SelectItem>
                          {parsedFileData.headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Cidade</Label>
                      <Select
                        value={selectedCityColumn?.toString() ?? "none"}
                        onValueChange={(v) => setSelectedCityColumn(v === "none" ? null : parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não importar</SelectItem>
                          {parsedFileData.headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Estado</Label>
                      <Select
                        value={selectedStateColumn?.toString() ?? "none"}
                        onValueChange={(v) => setSelectedStateColumn(v === "none" ? null : parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não importar</SelectItem>
                          {parsedFileData.headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {customFieldDefinitions.length > 0 && (
                    <>
                      <h4 className="font-medium mt-4">Campos Personalizados</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {customFieldDefinitions.map((field) => (
                          <div key={field.id} className="space-y-2">
                            <Label>{field.field_label}</Label>
                            <Select
                              value={selectedCustomFieldColumns[field.field_name]?.toString() ?? "none"}
                              onValueChange={(v) => {
                                if (v === "none") {
                                  const newCols = { ...selectedCustomFieldColumns };
                                  delete newCols[field.field_name];
                                  setSelectedCustomFieldColumns(newCols);
                                } else {
                                  setSelectedCustomFieldColumns({
                                    ...selectedCustomFieldColumns,
                                    [field.field_name]: parseInt(v),
                                  });
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Não importar</SelectItem>
                                {parsedFileData.headers.map((header, idx) => (
                                  <SelectItem key={idx} value={idx.toString()}>
                                    {header}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {previewData.length > 0 && (
                    <>
                      <h4 className="font-medium mt-4">Prévia dos dados</h4>
                      <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg max-h-32 overflow-y-auto">
                        {previewData.map((row, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="font-medium">
                              {selectedNameColumn !== null ? row[selectedNameColumn] : "Sem nome"}
                            </span>
                            <span>-</span>
                            <span>
                              {selectedPhoneColumn !== null ? row[selectedPhoneColumn] : "Sem telefone"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {step === "tags" && parsedFileData && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{parsedFileData.rows.length} leads prontos para importar</p>
                    <p className="text-sm text-muted-foreground">Adicione tags opcionalmente</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setStep("mapping")}>
                    Voltar
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Tags disponíveis</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateTag(true)}
                      className="gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Nova Tag
                    </Button>
                  </div>

                  {showCreateTag && (
                    <div className="p-4 border rounded-lg space-y-3 bg-muted/30">
                      <div className="space-y-2">
                        <Label>Nome da tag</Label>
                        <Input
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          placeholder="Ex: Campanha Janeiro"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cor</Label>
                        <div className="flex flex-wrap gap-2">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setNewTagColor(color)}
                              className={cn(
                                "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                                newTagColor === color ? "border-foreground scale-110" : "border-transparent"
                              )}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowCreateTag(false);
                            setNewTagName("");
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={createNewTag}
                          disabled={isCreatingTag || !newTagName.trim()}
                        >
                          {isCreatingTag ? "Criando..." : "Criar"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {tags.length === 0 && !showCreateTag ? (
                    <p className="text-sm text-muted-foreground p-4 text-center border rounded-lg">
                      Nenhuma tag disponível. Clique em "Nova Tag" para criar.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.name);
                        return (
                          <Button
                            key={tag.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => toggleTag(tag.name)}
                            className={cn(
                              "h-8 gap-1.5 transition-all",
                              isSelected && "ring-2 ring-primary ring-offset-1"
                            )}
                            style={{
                              backgroundColor: isSelected ? tag.color + "20" : "transparent",
                              borderColor: tag.color,
                            }}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="text-xs">{tag.name}</span>
                            {isSelected && <Check className="w-3 h-3 text-primary" />}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {selectedTags.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm font-medium mb-2">Tags selecionadas:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedTags.map((tagName) => {
                          const tag = tags.find(t => t.name === tagName);
                          return (
                            <Badge
                              key={tagName}
                              variant="secondary"
                              className="gap-1"
                              style={{
                                backgroundColor: tag?.color + "30",
                                borderColor: tag?.color,
                              }}
                            >
                              <Tag className="w-3 h-3" />
                              {tagName}
                              <button
                                onClick={() => toggleTag(tagName)}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {step === "mapping" && (
            <Button onClick={handleMappingConfirm} disabled={selectedPhoneColumn === null}>
              Continuar
            </Button>
          )}
          {step === "tags" && (
            <Button 
              onClick={handleImport} 
              disabled={importing}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              {importing ? "Importando..." : `Importar ${parsedFileData?.rows.length} leads`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
