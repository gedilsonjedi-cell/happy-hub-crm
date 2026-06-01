import { useState, useRef, useMemo } from "react";
import { Upload, FileSpreadsheet, AlertCircle, Check, Plus, X, Tag, Eye, AlertTriangle, Users, Loader2, CheckCircle2, XCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeadsByPhones } from "@/lib/fetchLeadsByPhones";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizePhoneForStorage } from "@/lib/brazilPhoneValidation";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

interface ParsedLead {
  phone: string;
  name: string;
  email: string | null;
  document: string | null;
  city: string | null;
  state: string | null;
  customFields: Record<string, string>;
  rowIndex: number;
  hasWhatsApp?: boolean;
}

interface ExistingLead {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  document: string | null;
  city: string | null;
  state: string | null;
  tags: string[] | null;
  custom_fields: Record<string, string> | null;
}

// Conflict types
interface SpreadsheetConflict {
  type: "spreadsheet";
  phone: string;
  leads: ParsedLead[];
  selectedIndex: number | null;
}

interface DatabaseConflict {
  type: "database";
  phone: string;
  newLead: ParsedLead;
  existingLead: ExistingLead;
  resolution: "update" | "skip" | null;
}

type Conflict = SpreadsheetConflict | DatabaseConflict;

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
];

const IMPORT_BATCH_SIZE = 500;

export function ImportLeadsDialog({ open, onOpenChange, onSuccess }: ImportLeadsDialogProps) {
  const { user } = useAuth();
  const { effectiveOrganizationId: organizationId } = useEffectiveOrganizationId();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<"upload" | "mapping" | "duplicates" | "validating" | "conflicts" | "tags">("upload");
  
  // Spreadsheet duplicates state (before WhatsApp validation)
  const [spreadsheetDuplicates, setSpreadsheetDuplicates] = useState<SpreadsheetConflict[]>([]);
  const [dedupedLeads, setDedupedLeads] = useState<ParsedLead[]>([]);
  const [parsedFileData, setParsedFileData] = useState<ParsedFileData | null>(null);
  
  // Column mapping states
  const [selectedPhoneColumn, setSelectedPhoneColumn] = useState<number | null>(null);
  const [selectedNameColumn, setSelectedNameColumn] = useState<number | null>(null);
  const [selectedEmailColumn, setSelectedEmailColumn] = useState<number | null>(null);
  const [selectedDocumentColumn, setSelectedDocumentColumn] = useState<number | null>(null);
  const [selectedCityColumn, setSelectedCityColumn] = useState<number | null>(null);
  const [selectedStateColumn, setSelectedStateColumn] = useState<number | null>(null);
  const [selectedCustomFieldColumns, setSelectedCustomFieldColumns] = useState<Record<string, number>>({});
  const [newFieldsToCreate, setNewFieldsToCreate] = useState<Record<number, string>>({});
  const [showCreateFieldDialog, setShowCreateFieldDialog] = useState(false);
  const [newFieldColumnIndex, setNewFieldColumnIndex] = useState<number | null>(null);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [isCreatingField, setIsCreatingField] = useState(false);
  
  // WhatsApp validation states
  const [validationProgress, setValidationProgress] = useState(0);
  const [validationStats, setValidationStats] = useState<{
    total: number;
    withWhatsApp: number;
    withoutWhatsApp: number;
  } | null>(null);
  
  // Conflict resolution states
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [existingLeadsMap, setExistingLeadsMap] = useState<Map<string, ExistingLead>>(new Map());
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  
  // Tags states
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  
  const [importing, setImporting] = useState(false);

  // Fetch custom field definitions
  const { data: customFieldDefinitions = [], refetch: refetchCustomFields } = useQuery({
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

  // Parse CSV line respecting quoted fields (handles commas inside quotes)
  const parseCSVLine = (line: string, separator: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote inside quoted field
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === separator && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    
    return result;
  };

  // Detect the best separator for the CSV content
  const detectSeparator = (content: string): string => {
    const lines = content.split(/\r?\n/).filter(line => line.trim()).slice(0, 10);
    if (lines.length === 0) return ",";
    
    // Count separators outside quotes in a line
    const countSeparators = (line: string, sep: string): number => {
      let count = 0;
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === sep && !inQuotes) count++;
      }
      return count;
    };
    
    const separators = [";", ",", "\t", "|"];
    
    // For each separator, calculate consistency score across lines
    // A good separator should produce the same column count on each line
    const evaluateSeparator = (sep: string): { score: number; avgCount: number } => {
      const counts = lines.map(line => countSeparators(line, sep));
      if (counts.every(c => c === 0)) return { score: 0, avgCount: 0 };
      
      const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
      
      // Calculate variance - lower is better (more consistent)
      const variance = counts.reduce((sum, c) => sum + Math.pow(c - avgCount, 2), 0) / counts.length;
      
      // Score: higher avgCount is better, lower variance is better
      const consistencyScore = avgCount > 0 ? avgCount / (1 + variance) : 0;
      
      return { score: consistencyScore, avgCount };
    };
    
    let bestSep = ",";
    let bestScore = 0;
    
    for (const sep of separators) {
      const { score, avgCount } = evaluateSeparator(sep);
      
      // Need at least 1 separator on average to be considered
      if (avgCount >= 1 && score > bestScore) {
        bestScore = score;
        bestSep = sep;
      }
    }
    
    console.log(`[ImportLeads] Separator scores:`, separators.map(sep => ({
      sep: sep === "\t" ? "TAB" : sep,
      ...evaluateSeparator(sep)
    })));
    
    return bestSep;
  };

  // Clean content: remove BOM and normalize encoding issues
  const cleanContent = (content: string): string => {
    // Remove BOM (Byte Order Mark) if present
    let cleaned = content.replace(/^\uFEFF/, '');
    
    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Fix common encoding issues (Windows-1252 to UTF-8)
    cleaned = cleaned
      .replace(/\u0093/g, '"')  // Left double quote
      .replace(/\u0094/g, '"')  // Right double quote
      .replace(/\u0091/g, "'")  // Left single quote
      .replace(/\u0092/g, "'")  // Right single quote
      .replace(/\u0096/g, '-')  // En dash
      .replace(/\u0097/g, '-'); // Em dash
    
    return cleaned;
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
      const rawContent = event.target?.result as string;
      
      // Clean content: remove BOM, fix encoding issues
      const content = cleanContent(rawContent);
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        toast.error("Arquivo vazio");
        return;
      }

      // Detect separator intelligently
      const separator = detectSeparator(content);
      console.log(`[ImportLeads] Detected separator: "${separator === "\t" ? "TAB" : separator}", lines: ${lines.length}`);

      // Parse all rows respecting quoted fields
      const allRows = lines.map(line => parseCSVLine(line, separator));

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

  // Normalize phone for comparison (get last 8 digits)
  const normalizePhoneForCompare = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return digits.slice(-8);
  };

  // Validate WhatsApp numbers using Z-API
  const validateWhatsAppNumbers = async (leads: ParsedLead[]): Promise<ParsedLead[]> => {
    const phones = leads.map(l => l.phone);
    const BATCH_SIZE = 500;
    const validatedLeads: ParsedLead[] = [];
    
    let processed = 0;
    
    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
      const batch = phones.slice(i, i + BATCH_SIZE);
      
      try {
        const { data, error } = await supabase.functions.invoke("zapi-validate-batch", {
          body: { phones: batch },
        });
        
        if (error) {
          console.error("Z-API validation error:", error);
          // On error, mark all as having WhatsApp (don't block import)
          for (let j = 0; j < batch.length; j++) {
            const leadIndex = i + j;
            if (leadIndex < leads.length) {
              validatedLeads.push({ ...leads[leadIndex], hasWhatsApp: true });
            }
          }
        } else if (data?.results) {
          // Map results back to leads
          for (let j = 0; j < batch.length; j++) {
            const leadIndex = i + j;
            if (leadIndex < leads.length) {
              const result = data.results[j];
              validatedLeads.push({
                ...leads[leadIndex],
                hasWhatsApp: result?.exists ?? true, // Default to true if no result
              });
            }
          }
        }
      } catch (err) {
        console.error("Error calling Z-API:", err);
        // On error, include all leads (don't block)
        for (let j = 0; j < batch.length; j++) {
          const leadIndex = i + j;
          if (leadIndex < leads.length) {
            validatedLeads.push({ ...leads[leadIndex], hasWhatsApp: true });
          }
        }
      }
      
      processed += batch.length;
      setValidationProgress(Math.round((processed / phones.length) * 100));
      
      // Small delay between batches
      if (i + BATCH_SIZE < phones.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    return validatedLeads;
  };

  // Score a lead to determine which is "best" to keep
  const scoreLead = (lead: ParsedLead): number => {
    let score = 0;
    if (lead.name && !lead.name.startsWith('Lead ')) score += 100;
    if (lead.email) score += 50;
    if (lead.document) score += 50;
    if (lead.city) score += 25;
    if (lead.state) score += 25;
    if (Object.keys(lead.customFields).length > 0) score += 20;
    return score;
  };

  const handleMappingConfirm = async () => {
    if (selectedPhoneColumn === null) {
      toast.error("Selecione a coluna de telefone");
      return;
    }
    
    if (!parsedFileData || !organizationId) return;
    
    // Parse all leads from file
    const leads: ParsedLead[] = parsedFileData.rows
      .map((row, rowIndex) => {
        const rawPhone = row[selectedPhoneColumn]?.replace(/\D/g, "");
        if (!rawPhone || rawPhone.length < 10) return null;
        
        const phone = normalizePhoneForStorage(rawPhone);
        
        const name = selectedNameColumn !== null ? row[selectedNameColumn] : null;
        const email = selectedEmailColumn !== null ? row[selectedEmailColumn] : null;
        const document = selectedDocumentColumn !== null ? row[selectedDocumentColumn] : null;
        const city = selectedCityColumn !== null ? row[selectedCityColumn] : null;
        const state = selectedStateColumn !== null ? row[selectedStateColumn] : null;

        const customFields: Record<string, string> = {};
        Object.entries(selectedCustomFieldColumns).forEach(([fieldName, colIndex]) => {
          const value = row[colIndex];
          if (value) customFields[fieldName] = value;
        });

        return {
          phone,
          name: name?.trim() || `Lead ${phone}`,
          email: email?.trim() || null,
          document: document?.trim() || null,
          city: city?.trim() || null,
          state: state?.trim() || null,
          customFields,
          rowIndex,
        };
      })
      .filter((l): l is ParsedLead => l !== null);

    if (leads.length === 0) {
      toast.error("Nenhum número válido encontrado");
      return;
    }

    // Detect duplicates within the spreadsheet BEFORE WhatsApp validation
    const phoneGroups = new Map<string, ParsedLead[]>();
    leads.forEach(lead => {
      const normalizedPhone = normalizePhoneForCompare(lead.phone);
      const existing = phoneGroups.get(normalizedPhone) || [];
      existing.push(lead);
      phoneGroups.set(normalizedPhone, existing);
    });
    
    const duplicates: SpreadsheetConflict[] = [];
    phoneGroups.forEach((groupLeads, phone) => {
      if (groupLeads.length > 1) {
        // Auto-select the lead with the best data
        const scored = groupLeads.map((lead, idx) => ({ lead, idx, score: scoreLead(lead) }));
        scored.sort((a, b) => b.score - a.score);
        
        duplicates.push({
          type: "spreadsheet",
          phone,
          leads: groupLeads,
          selectedIndex: scored[0].idx, // Auto-select the best one
        });
      }
    });

    if (duplicates.length > 0) {
      // Show duplicates step for user to review/confirm
      setSpreadsheetDuplicates(duplicates);
      setDedupedLeads(leads);
      setStep("duplicates");
      toast.info(`${duplicates.length} número(s) duplicado(s) encontrado(s) na planilha`);
    } else {
      // No duplicates, proceed directly to WhatsApp validation
      setDedupedLeads(leads);
      proceedToValidation(leads);
    }
  };

  const updateDuplicateSelection = (phone: string, selectedIndex: number) => {
    setSpreadsheetDuplicates(prev => prev.map(c => 
      c.phone === phone ? { ...c, selectedIndex } : c
    ));
  };

  const handleDuplicatesConfirm = () => {
    // Check all duplicates are resolved
    const unresolved = spreadsheetDuplicates.filter(c => c.selectedIndex === null);
    if (unresolved.length > 0) {
      toast.error(`Resolva ${unresolved.length} conflito(s) de duplicatas`);
      return;
    }

    // Build deduplicated leads list
    const duplicatePhones = new Set(spreadsheetDuplicates.map(c => c.phone));
    const selectedRowIndices = new Set(
      spreadsheetDuplicates.map(c => c.leads[c.selectedIndex!].rowIndex)
    );
    
    const finalLeads = dedupedLeads.filter(lead => {
      const suffix = normalizePhoneForCompare(lead.phone);
      if (duplicatePhones.has(suffix)) {
        return selectedRowIndices.has(lead.rowIndex);
      }
      return true;
    });

    const removedCount = dedupedLeads.length - finalLeads.length;
    if (removedCount > 0) {
      toast.success(`${removedCount} duplicata(s) removida(s)`);
    }

    proceedToValidation(finalLeads);
  };

  const proceedToValidation = async (leads: ParsedLead[]) => {
    setStep("validating");
    setValidationProgress(0);
    setValidationStats(null);
    
    try {
      // VALIDATE WHATSAPP - This is now mandatory
      const validatedLeads = await validateWhatsAppNumbers(leads);
      
      // Filter only leads with WhatsApp
      const leadsWithWhatsApp = validatedLeads.filter(l => l.hasWhatsApp === true);
      const leadsWithoutWhatsApp = validatedLeads.filter(l => l.hasWhatsApp === false);
      
      setValidationStats({
        total: validatedLeads.length,
        withWhatsApp: leadsWithWhatsApp.length,
        withoutWhatsApp: leadsWithoutWhatsApp.length,
      });
      
      if (leadsWithWhatsApp.length === 0) {
        toast.error("Nenhum número com WhatsApp encontrado na planilha");
        setStep("mapping");
        return;
      }
      
      setParsedLeads(leadsWithWhatsApp);
      
      // Now check for database conflicts only
      setCheckingConflicts(true);
      
      // Check which phones already exist in database using suffix matching
      // Paginated to bypass Supabase's 1000-row default limit.
      const existingLeads = await fetchAllLeads<ExistingLead>({
        organizationId,
        columns: "id, phone, name, email, document, city, state, tags, custom_fields",
        orderBy: null,
      });
      
      const existingMap = new Map<string, ExistingLead>();
      (existingLeads || []).forEach(lead => {
        const suffix = normalizePhoneForCompare(lead.phone);
        const existing = existingMap.get(suffix);
        if (!existing || (lead.tags && lead.tags.length > 0) || (lead.name && !lead.name.startsWith('Lead '))) {
          existingMap.set(suffix, lead as ExistingLead);
        }
      });
      
      setExistingLeadsMap(existingMap);
      
      // Find database conflicts only (no more spreadsheet conflicts here)
      const databaseConflicts: DatabaseConflict[] = [];
      const seenPhoneSuffixes = new Set<string>();
      
      leadsWithWhatsApp.forEach(lead => {
        const suffix = normalizePhoneForCompare(lead.phone);
        if (seenPhoneSuffixes.has(suffix)) return;
        seenPhoneSuffixes.add(suffix);
        
        const existingLead = existingMap.get(suffix);
        if (existingLead) {
          databaseConflicts.push({
            type: "database",
            phone: suffix,
            newLead: lead,
            existingLead,
            resolution: "update",
          });
        }
      });
      
      setConflicts(databaseConflicts);
      
      if (databaseConflicts.length > 0) {
        setStep("conflicts");
      } else {
        setStep("tags");
      }
    } catch (error) {
      console.error("Error validating/checking conflicts:", error);
      toast.error("Erro ao validar números");
      setStep("mapping");
    } finally {
      setCheckingConflicts(false);
    }
  };

  const resolvedConflictsCount = useMemo(() => {
    return conflicts.filter(c => {
      if (c.type === "spreadsheet") return c.selectedIndex !== null;
      if (c.type === "database") return c.resolution !== null;
      return false;
    }).length;
  }, [conflicts]);

  // updateSpreadsheetConflictSelection removed - now handled in duplicates step

  const updateDatabaseConflictResolution = (phone: string, resolution: "update" | "skip") => {
    setConflicts(prev => prev.map(c => 
      c.type === "database" && c.phone === phone 
        ? { ...c, resolution } 
        : c
    ));
  };

  const handleConflictsConfirm = () => {
    // Database conflicts all have default resolution, so just proceed
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

  const createNewCustomField = async (columnIndex: number, label: string) => {
    if (!organizationId || !label.trim()) return;
    
    setIsCreatingField(true);
    
    const fieldName = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    
    const { data, error } = await supabase
      .from("lead_custom_field_definitions")
      .insert({
        field_name: fieldName,
        field_label: label.trim(),
        field_type: "text",
        organization_id: organizationId,
        display_order: customFieldDefinitions.length + 1,
      })
      .select()
      .single();
    
    if (error) {
      toast.error("Erro ao criar campo: " + error.message);
      setIsCreatingField(false);
      return;
    }
    
    await refetchCustomFields();
    setSelectedCustomFieldColumns({
      ...selectedCustomFieldColumns,
      [fieldName]: columnIndex,
    });
    setShowCreateFieldDialog(false);
    setNewFieldLabel("");
    setNewFieldColumnIndex(null);
    setIsCreatingField(false);
    toast.success(`Campo "${label}" criado!`);
  };

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      setSelectedTags(selectedTags.filter(t => t !== tagName));
    } else {
      setSelectedTags([...selectedTags, tagName]);
    }
  };

  const handleImport = async () => {
    if (!user || !organizationId) return;

    setImporting(true);

    try {
      // Build list of leads to import based on conflict resolutions
      const databaseConflicts = conflicts as DatabaseConflict[];
      
      // All spreadsheet duplicates were already resolved before validation
      let leadsToProcess = parsedLeads;
      
      if (leadsToProcess.length === 0) {
        toast.error("Nenhum lead para importar");
        setImporting(false);
        return;
      }
      
      // Build maps for database conflict resolutions
      const dbConflictResolutions = new Map(
        databaseConflicts.map(c => [c.phone, { resolution: c.resolution, existingLead: c.existingLead }])
      );
      
      // Separate into updates and inserts
      const leadsToInsert: any[] = [];
      const leadsToUpdate: { id: string; data: any }[] = [];
      const processedSuffixes = new Set<string>();

      for (const lead of leadsToProcess) {
        const suffix = normalizePhoneForCompare(lead.phone);
        if (processedSuffixes.has(suffix)) continue;
        processedSuffixes.add(suffix);
        
        const dbConflict = dbConflictResolutions.get(suffix);
        
        if (dbConflict) {
          if (dbConflict.resolution === "skip") continue;
          
          // Update existing lead
          const existing = dbConflict.existingLead;
          const mergedCustomFields = {
            ...(existing.custom_fields || {}),
            ...lead.customFields,
          };
          
          const existingTags = existing.tags || [];
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
          // Check if exists by suffix in our map
          const existingLead = existingLeadsMap.get(suffix);
          
          if (existingLead) {
            const mergedCustomFields = {
              ...(existingLead.custom_fields || {}),
              ...lead.customFields,
            };
            
            const existingTags = existingLead.tags || [];
            const mergedTags = [...new Set([...existingTags, ...selectedTags])];

            leadsToUpdate.push({
              id: existingLead.id,
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
    setConflicts([]);
    setParsedLeads([]);
    setExistingLeadsMap(new Map());
    setValidationProgress(0);
    setValidationStats(null);
    setSpreadsheetDuplicates([]);
    setDedupedLeads([]);
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
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importar Leads
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Selecione um arquivo CSV para importar"}
            {step === "mapping" && "Configure o mapeamento das colunas"}
            {step === "duplicates" && "Números duplicados detectados na planilha"}
            {step === "validating" && "Validando números no WhatsApp..."}
            {step === "conflicts" && "Resolva conflitos com leads já existentes"}
            {step === "tags" && "Adicione tags aos leads importados (opcional)"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-auto" viewportClassName="max-h-[60vh]">
          <div className="space-y-4 py-4 pr-4 pl-1">
            {step === "upload" && (
              <>
                <Alert>
                  <Smartphone className="h-4 w-4" />
                  <AlertDescription>
                    Apenas contatos com <strong>WhatsApp ativo</strong> serão importados. 
                    A validação é automática e gratuita.
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

                  {/* Create new custom field from unmapped columns */}
                  <div className="mt-4 p-4 border border-dashed border-primary/30 rounded-lg bg-primary/5">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Criar campo personalizado
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 mb-3">
                      Selecione uma coluna da planilha para criar um novo campo (ex: link dinâmico)
                    </p>
                    <div className="flex gap-2">
                      <Select
                        value={newFieldColumnIndex?.toString() ?? ""}
                        onValueChange={(v) => {
                          setNewFieldColumnIndex(parseInt(v));
                          setNewFieldLabel(parsedFileData.headers[parseInt(v)] || "");
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Selecione coluna..." />
                        </SelectTrigger>
                        <SelectContent>
                          {parsedFileData.headers.map((header, idx) => (
                            <SelectItem key={idx} value={idx.toString()}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {newFieldColumnIndex !== null && (
                        <>
                          <Input
                            placeholder="Nome do campo"
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            onClick={() => createNewCustomField(newFieldColumnIndex, newFieldLabel)}
                            disabled={isCreatingField || !newFieldLabel.trim()}
                          >
                            {isCreatingField ? "..." : "Criar"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {previewData.length > 0 && (
                    <>
                      <h4 className="font-medium mt-4">Prévia dos dados</h4>
                      <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted/50 rounded-lg max-h-48 overflow-y-auto">
                        {previewData.map((row, i) => {
                          const name = selectedNameColumn !== null ? row[selectedNameColumn] : null;
                          const phone = selectedPhoneColumn !== null ? row[selectedPhoneColumn] : null;
                          const email = selectedEmailColumn !== null ? row[selectedEmailColumn] : null;
                          const document = selectedDocumentColumn !== null ? row[selectedDocumentColumn] : null;
                          const city = selectedCityColumn !== null ? row[selectedCityColumn] : null;
                          const state = selectedStateColumn !== null ? row[selectedStateColumn] : null;
                          
                          const customFieldsValues: { label: string; value: string }[] = [];
                          Object.entries(selectedCustomFieldColumns).forEach(([fieldName, colIndex]) => {
                            const value = row[colIndex];
                            if (value) {
                              const fieldDef = customFieldDefinitions.find(f => f.field_name === fieldName);
                              customFieldsValues.push({
                                label: fieldDef?.field_label || fieldName,
                                value: value
                              });
                            }
                          });
                          
                          return (
                            <div key={i} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <span className="font-medium text-foreground">
                                  {name || "Sem nome"}
                                </span>
                                <span className="text-primary">
                                  {phone || "Sem telefone"}
                                </span>
                              </div>
                              
                              {(email || document || city || state || customFieldsValues.length > 0) && (
                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-muted-foreground">
                                  {email && (
                                    <span>📧 {email}</span>
                                  )}
                                  {document && (
                                    <span>📄 {document}</span>
                                  )}
                                  {city && (
                                    <span>📍 {city}{state ? ` - ${state}` : ''}</span>
                                  )}
                                  {!city && state && (
                                    <span>📍 {state}</span>
                                  )}
                                  {customFieldsValues.map((cf, cfIndex) => (
                                    <span key={cfIndex} className="text-primary/80">
                                      {cf.label}: {cf.value}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {step === "duplicates" && (
              <>
                <Alert className="bg-amber-500/10 border-amber-500/30">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription>
                    Foram encontrados <strong>{spreadsheetDuplicates.length}</strong> número(s) repetido(s) na planilha.
                    {" "}O sistema selecionou automaticamente o registro mais completo de cada grupo.
                    Revise e confirme antes de prosseguir.
                  </AlertDescription>
                </Alert>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Users className="w-4 h-4 text-amber-500" />
                      {spreadsheetDuplicates.reduce((acc, c) => acc + c.leads.length - 1, 0)} duplicata(s) serão removidas
                    </p>
                    <p className="text-sm text-muted-foreground">
                      De {dedupedLeads.length} registros, {dedupedLeads.length - spreadsheetDuplicates.reduce((acc, c) => acc + c.leads.length - 1, 0)} serão enviados para validação
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {spreadsheetDuplicates.map((c) => (
                    <div key={c.phone} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{c.leads.length} registros com o mesmo número</span>
                        <Badge variant="outline" className="ml-auto font-mono">
                          {c.leads[0].phone}
                        </Badge>
                      </div>
                      
                      <RadioGroup
                        value={c.selectedIndex?.toString() ?? ""}
                        onValueChange={(v) => updateDuplicateSelection(c.phone, parseInt(v))}
                      >
                        {c.leads.map((lead, idx) => (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex items-center justify-between p-3 rounded-lg border transition-colors",
                              c.selectedIndex === idx 
                                ? "border-primary bg-primary/5" 
                                : "border-border hover:border-primary/50"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <RadioGroupItem value={idx.toString()} id={`dup-${c.phone}-${idx}`} />
                              <div>
                                <p className="font-medium">{lead.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {[
                                    lead.email,
                                    lead.document,
                                    lead.city && lead.state ? `${lead.city} - ${lead.state}` : lead.city || lead.state,
                                    Object.keys(lead.customFields).length > 0 ? `${Object.keys(lead.customFields).length} campo(s)` : null,
                                  ].filter(Boolean).join(' • ') || 'Sem dados adicionais'}
                                </p>
                              </div>
                            </div>
                            <Label htmlFor={`dup-${c.phone}-${idx}`} className="text-sm cursor-pointer text-primary">
                              {c.selectedIndex === idx ? "✓ Selecionado" : "Manter este"}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
                </div>
              </>
            )}

            {step === "validating" && (
              <div className="py-12 space-y-6">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Validando números no WhatsApp</h3>
                  <p className="text-sm text-muted-foreground">
                    Verificando quais contatos possuem WhatsApp ativo...
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progresso</span>
                    <span>{validationProgress}%</span>
                  </div>
                  <Progress value={validationProgress} className="h-2" />
                </div>
                
                {validationStats && (
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{validationStats.total}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="text-center p-4 bg-primary/10 rounded-lg">
                      <p className="text-2xl font-bold text-primary">{validationStats.withWhatsApp}</p>
                      <p className="text-xs text-muted-foreground">Com WhatsApp</p>
                    </div>
                    <div className="text-center p-4 bg-destructive/10 rounded-lg">
                      <p className="text-2xl font-bold text-destructive">{validationStats.withoutWhatsApp}</p>
                      <p className="text-xs text-muted-foreground">Sem WhatsApp</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === "conflicts" && (
              <>
                {/* Show validation summary if available */}
                {validationStats && (
                  <Alert className="mb-4 bg-primary/5 border-primary/20">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <AlertDescription>
                      <strong>{validationStats.withWhatsApp}</strong> contatos com WhatsApp serão importados
                      {validationStats.withoutWhatsApp > 0 && (
                        <span className="text-muted-foreground">
                          {" "}({validationStats.withoutWhatsApp} descartados por não terem WhatsApp)
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      Leads já existentes no sistema
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Escolha se deseja atualizar ou manter os dados existentes
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{conflicts.length}</p>
                    <p className="text-xs text-muted-foreground">Conflito(s)</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {conflicts.map((conflict) => {
                    const c = conflict as DatabaseConflict;
                    return (
                      <div key={c.phone} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <AlertCircle className="w-4 h-4" />
                          <span>Contato já existe no sistema</span>
                          <Badge variant="outline" className="ml-auto font-mono">
                            {c.newLead.phone}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">Na planilha</p>
                            <p className="font-medium">{c.newLead.name}</p>
                            <p className="text-xs">{c.newLead.email || "-"}</p>
                            <p className="text-xs">{c.newLead.document || "-"}</p>
                          </div>
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">No sistema</p>
                            <p className="font-medium">{c.existingLead.name}</p>
                            <p className="text-xs">{c.existingLead.email || "-"}</p>
                            <p className="text-xs">{c.existingLead.document || "-"}</p>
                            {c.existingLead.tags && c.existingLead.tags.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {c.existingLead.tags.slice(0, 3).map((tag, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <RadioGroup
                          value={c.resolution ?? ""}
                          onValueChange={(v) => updateDatabaseConflictResolution(c.phone, v as "update" | "skip")}
                          className="flex gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="update" id={`${c.phone}-update`} />
                            <Label htmlFor={`${c.phone}-update`} className="text-sm cursor-pointer">
                              Atualizar com dados da planilha
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="skip" id={`${c.phone}-skip`} />
                            <Label htmlFor={`${c.phone}-skip`} className="text-sm cursor-pointer">
                              Manter dados do sistema
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {step === "tags" && parsedFileData && (
              <>
                {/* Show validation summary */}
                {validationStats && (
                  <Alert className="mb-4 bg-primary/5 border-primary/20">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <AlertDescription>
                      <strong>{parsedLeads.length}</strong> contatos com WhatsApp prontos para importar
                      {validationStats.withoutWhatsApp > 0 && (
                        <span className="text-muted-foreground">
                          {" "}({validationStats.withoutWhatsApp} descartados)
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{parsedLeads.length} leads prontos para importar</p>
                    <p className="text-sm text-muted-foreground">Adicione tags opcionalmente</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => conflicts.length > 0 ? setStep("conflicts") : setStep("mapping")}>
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
          <Button variant="outline" onClick={() => {
            handleReset();
            onOpenChange(false);
          }} disabled={step === "validating"}>
            Cancelar
          </Button>
          {step === "mapping" && (
            <Button onClick={handleMappingConfirm} disabled={selectedPhoneColumn === null}>
              Próximo
            </Button>
          )}
          {step === "duplicates" && (
            <>
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Voltar
              </Button>
              <Button 
                onClick={handleDuplicatesConfirm}
                disabled={spreadsheetDuplicates.some(c => c.selectedIndex === null)}
              >
                Validar WhatsApp ({dedupedLeads.length - spreadsheetDuplicates.reduce((acc, c) => acc + c.leads.length - 1, 0)} leads)
              </Button>
            </>
          )}
          {step === "validating" && (
            <Button disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Validando...
            </Button>
          )}
          {step === "conflicts" && (
            <>
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Voltar
              </Button>
              <Button onClick={handleConflictsConfirm}>
                Próximo
              </Button>
            </>
          )}
          {step === "tags" && (
            <Button 
              onClick={handleImport} 
              disabled={importing}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              {importing ? "Importando..." : `Importar ${parsedLeads.length} leads`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
