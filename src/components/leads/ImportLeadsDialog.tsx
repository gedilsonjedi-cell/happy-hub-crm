import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
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
import { TagSelector } from "./TagSelector";

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ParsedLead {
  name: string;
  phone: string;
  email?: string;
}

export function ImportLeadsDialog({ open, onOpenChange, onSuccess }: ImportLeadsDialogProps) {
  const { user } = useAuth();
  const { organizationId } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<"upload" | "preview">("upload");

  const parseCSV = (content: string): ParsedLead[] => {
    const lines = content.split("\n").filter(line => line.trim());
    if (lines.length === 0) return [];

    // Detectar separador (vírgula ou ponto-e-vírgula)
    const separator = lines[0].includes(";") ? ";" : ",";
    
    // Primeira linha é o cabeçalho
    const headers = lines[0].toLowerCase().split(separator).map(h => h.trim().replace(/"/g, ""));
    
    const nameIndex = headers.findIndex(h => h.includes("nome") || h === "name");
    const phoneIndex = headers.findIndex(h => h.includes("telefone") || h.includes("phone") || h.includes("celular") || h.includes("whatsapp"));
    const emailIndex = headers.findIndex(h => h.includes("email") || h === "e-mail");

    if (phoneIndex === -1) {
      toast.error("Coluna de telefone não encontrada. Use 'telefone', 'phone', 'celular' ou 'whatsapp'.");
      return [];
    }

    const leads: ParsedLead[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(separator).map(v => v.trim().replace(/"/g, ""));
      
      const phone = values[phoneIndex]?.replace(/\D/g, "");
      if (!phone || phone.length < 10) continue;

      leads.push({
        name: nameIndex !== -1 ? values[nameIndex] || "Sem nome" : "Sem nome",
        phone,
        email: emailIndex !== -1 ? values[emailIndex] : undefined,
      });
    }

    return leads;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      toast.error("Por favor, selecione um arquivo CSV");
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const leads = parseCSV(content);
      setParsedLeads(leads);
      setStep("preview");
    };
    reader.readAsText(selectedFile);
  };

  const handleImport = async () => {
    if (!user || !organizationId || parsedLeads.length === 0) return;

    setImporting(true);

    try {
      const leadsToInsert = parsedLeads.map(lead => ({
        organization_id: organizationId,
        user_id: user.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email || null,
        tags: selectedTags.length > 0 ? selectedTags : null,
        status: "new",
      }));

      const { error } = await supabase
        .from("leads")
        .insert(leadsToInsert);

      if (error) throw error;

      toast.success(`${parsedLeads.length} leads importados com sucesso!`);
      onSuccess?.();
      handleReset();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao importar leads:", error);
      if (error.code === "23505") {
        toast.error("Alguns telefones já existem na base");
      } else {
        toast.error("Erro ao importar leads");
      }
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedLeads([]);
    setSelectedTags([]);
    setStep("upload");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleReset();
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importar Leads
          </DialogTitle>
          <DialogDescription>
            Importe leads de uma planilha CSV
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === "upload" ? (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  O arquivo CSV deve conter colunas: <strong>nome</strong> (opcional), <strong>telefone</strong> (obrigatório), <strong>email</strong> (opcional)
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
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-primary" />
                  <span className="font-medium">{file?.name}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Trocar arquivo
                </Button>
              </div>

              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium mb-2">
                  {parsedLeads.length} leads encontrados
                </p>
                <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                  {parsedLeads.slice(0, 5).map((lead, i) => (
                    <div key={i}>
                      {lead.name} - {lead.phone}
                    </div>
                  ))}
                  {parsedLeads.length > 5 && (
                    <div className="text-muted-foreground">
                      ... e mais {parsedLeads.length - 5} leads
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Atribuir tags aos leads importados (opcional):
                </label>
                <TagSelector
                  selectedTags={selectedTags}
                  onTagsChange={setSelectedTags}
                />
              </div>

              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {step === "preview" && (
            <Button 
              onClick={handleImport} 
              disabled={importing || parsedLeads.length === 0}
            >
              {importing ? "Importando..." : `Importar ${parsedLeads.length} leads`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
