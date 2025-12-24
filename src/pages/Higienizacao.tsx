import { useState, useRef, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Trash2,
  UserPlus,
  Search,
  Phone,
  Copy,
  Ban,
  Users,
  RefreshCw,
  Loader2,
  History,
  Tag,
  Filter,
  X,
  Smartphone,
  PhoneCall,
  MessageCircle,
  Zap,
  BarChart3,
  PieChart as PieChartIcon,
  Plus,
  MapPin,
  FileText,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { validateBrazilianPhone, formatBrazilianPhone, getValidationMessage, type PhoneValidationResult } from "@/lib/brazilPhoneValidation";

interface PhoneEntry {
  id: string;
  phone: string;
  originalPhone: string;
  name?: string;
  document?: string;
  city?: string;
  state?: string;
  customFields?: Record<string, string>;
  status: "pending" | "valid" | "invalid" | "duplicate" | "blacklisted" | "landline" | "whatsapp_valid" | "whatsapp_invalid";
  formattedPhone: string;
  source: "csv" | "leads";
  leadId?: string;
  tags?: string[];
  validationResult?: PhoneValidationResult;
  validationMessage?: string;
  hasWhatsApp?: boolean;
}

interface ValidationStats {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  blacklisted: number;
  pending: number;
  landline: number;
  whatsappValid: number;
  whatsappInvalid: number;
}

interface HygieneHistoryRecord {
  id: string;
  created_at: string;
  source_type: string;
  total_numbers: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  blacklisted_count: number;
  leads_saved: number;
  leads_deleted: number;
}

export default function Higienizacao() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "leads" | "history">("upload");
  const [phoneEntries, setPhoneEntries] = useState<PhoneEntry[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [leadsSavedCount, setLeadsSavedCount] = useState(0);
  const [leadsDeletedCount, setLeadsDeletedCount] = useState(0);
  const [currentSource, setCurrentSource] = useState<"csv" | "leads">("csv");
  const [isValidatingZapi, setIsValidatingZapi] = useState(false);
  const [zapiProgress, setZapiProgress] = useState(0);
  
  // Column mapping states
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [parsedFileData, setParsedFileData] = useState<{
    headers: string[];
    rows: string[][];
    fileName: string;
  } | null>(null);
  const [selectedPhoneColumn, setSelectedPhoneColumn] = useState<number | null>(null);
  const [selectedNameColumn, setSelectedNameColumn] = useState<number | null>(null);
  const [selectedDocumentColumn, setSelectedDocumentColumn] = useState<number | null>(null);
  const [selectedCityColumn, setSelectedCityColumn] = useState<number | null>(null);
  const [selectedStateColumn, setSelectedStateColumn] = useState<number | null>(null);
  const [selectedCustomFieldColumns, setSelectedCustomFieldColumns] = useState<Record<string, number>>({});
  
  // Save leads dialog states
  const [showSaveLeadsDialog, setShowSaveLeadsDialog] = useState(false);
  const [selectedTagsForSave, setSelectedTagsForSave] = useState<string[]>([]);
  const [isSavingLeads, setIsSavingLeads] = useState(false);
  const [saveOnlyWhatsApp, setSaveOnlyWhatsApp] = useState(false);
  
  // New tag creation states
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [isCreatingTag, setIsCreatingTag] = useState(false);

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

  // Fetch leads for selection with tags
  const { data: leads = [], refetch: refetchLeads } = useQuery({
    queryKey: ["leads-for-hygiene", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, email, tags")
        .eq("organization_id", profile.organization_id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  // Fetch available tags
  const { data: availableTags = [] } = useQuery({
    queryKey: ["lead-tags", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("lead_tags")
        .select("id, name, color")
        .eq("organization_id", profile.organization_id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  // Fetch custom field definitions
  const { data: customFieldDefinitions = [] } = useQuery({
    queryKey: ["custom-field-definitions", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("lead_custom_field_definitions")
        .select("id, field_name, field_label, field_type")
        .eq("organization_id", profile.organization_id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  // Fetch blacklist
  const { data: blacklist = [] } = useQuery({
    queryKey: ["blacklist", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("blacklist")
        .select("phone")
        .eq("organization_id", profile.organization_id);
      if (error) throw error;
      return data.map((b) => formatPhoneNumber(b.phone));
    },
    enabled: !!profile?.organization_id,
  });

  // Fetch hygiene history
  const { data: hygieneHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ["hygiene-history", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("hygiene_history")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as HygieneHistoryRecord[];
    },
    enabled: !!profile?.organization_id,
  });

  // Format phone number to standard format (usa a função do utilitário)
  const formatPhoneNumber = (phone: string): string => {
    return formatBrazilianPhone(phone);
  };

  // Save history record
  const saveHistoryRecord = async (stats: ValidationStats, leadsSaved: number, leadsDeleted: number) => {
    if (!profile?.organization_id || !user?.id) return;

    try {
      await supabase.from("hygiene_history").insert({
        organization_id: profile.organization_id,
        user_id: user.id,
        source_type: currentSource,
        total_numbers: stats.total,
        valid_count: stats.valid,
        invalid_count: stats.invalid,
        duplicate_count: stats.duplicates,
        blacklisted_count: stats.blacklisted,
        leads_saved: leadsSaved,
        leads_deleted: leadsDeleted,
      });
      refetchHistory();
    } catch (error) {
      console.error("Error saving history:", error);
    }
  };

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

  // Parse CSV file - Step 1: Read and detect columns
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
      const lines = content.split(/\r?\n/).filter((line) => line.trim());
      
      if (lines.length === 0) {
        toast.error("Arquivo vazio");
        return;
      }

      // Parse all lines to detect columns
      const allRows = lines.map((line) => 
        line.split(/[,;|\t]/).map((p) => p.trim().replace(/"/g, ""))
      );

      // Detect if first row is header (contains text like "phone", "telefone", "nome", etc.)
      const firstRow = allRows[0];
      
      // Build pattern that includes custom field definitions
      const customFieldPatterns = customFieldDefinitions.map(f => normalizeFieldName(f.field_label)).join("|");
      const basePattern = /phone|telefone|nome|name|email|celular|whatsapp|numero|número|cpf|cnpj|documento|cidade|city|estado|state|uf/i;
      
      const hasHeader = firstRow.some((cell) => {
        const normalizedCell = normalizeFieldName(cell);
        const matchesBase = basePattern.test(cell);
        const matchesCustom = customFieldDefinitions.some(f => 
          normalizeFieldName(f.field_label) === normalizedCell || 
          f.field_name === normalizedCell
        );
        return matchesBase || matchesCustom;
      });

      const headers = hasHeader 
        ? firstRow.map((h, i) => h || `Coluna ${i + 1}`)
        : firstRow.map((_, i) => `Coluna ${i + 1}`);
      
      const dataRows = hasHeader ? allRows.slice(1) : allRows;

      // Store parsed data and show column mapping dialog
      setParsedFileData({
        headers,
        rows: dataRows,
        fileName: file.name,
      });
      
      // Auto-detect phone column
      const phoneColumnIndex = headers.findIndex((h) => 
        /phone|telefone|celular|whatsapp|numero|número/i.test(h)
      );
      setSelectedPhoneColumn(phoneColumnIndex >= 0 ? phoneColumnIndex : null);
      
      // Auto-detect name column
      const nameColumnIndex = headers.findIndex((h) => 
        /^nome$|^name$/i.test(h)
      );
      setSelectedNameColumn(nameColumnIndex >= 0 ? nameColumnIndex : null);
      
      // Auto-detect document column (CPF/CNPJ)
      const documentColumnIndex = headers.findIndex((h) => 
        /cpf|cnpj|documento|document/i.test(h)
      );
      setSelectedDocumentColumn(documentColumnIndex >= 0 ? documentColumnIndex : null);
      
      // Auto-detect city column
      const cityColumnIndex = headers.findIndex((h) => 
        /cidade|city|municipio|município/i.test(h)
      );
      setSelectedCityColumn(cityColumnIndex >= 0 ? cityColumnIndex : null);
      
      // Auto-detect state column
      const stateColumnIndex = headers.findIndex((h) => 
        /estado|state|uf/i.test(h)
      );
      setSelectedStateColumn(stateColumnIndex >= 0 ? stateColumnIndex : null);
      
      // Auto-detect custom field columns
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
      
      setShowColumnMapping(true);
      toast.success(`Arquivo carregado: ${dataRows.length} linhas detectadas`);
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Process file after column selection
  const processFileWithColumns = () => {
    if (!parsedFileData || selectedPhoneColumn === null) {
      toast.error("Selecione a coluna de telefone");
      return;
    }

    const entries: PhoneEntry[] = [];
    const seenPhones = new Set<string>();

    parsedFileData.rows.forEach((row, index) => {
      const phone = row[selectedPhoneColumn];
      const name = selectedNameColumn !== null ? row[selectedNameColumn] : undefined;
      const document = selectedDocumentColumn !== null ? row[selectedDocumentColumn] : undefined;
      const city = selectedCityColumn !== null ? row[selectedCityColumn] : undefined;
      const state = selectedStateColumn !== null ? row[selectedStateColumn] : undefined;
      
      // Extract custom fields
      const customFields: Record<string, string> = {};
      Object.entries(selectedCustomFieldColumns).forEach(([fieldName, colIndex]) => {
        const value = row[colIndex];
        if (value) {
          customFields[fieldName] = value;
        }
      });

      if (!phone) return;

      const formattedPhone = formatPhoneNumber(phone);
      const isDuplicate = seenPhones.has(formattedPhone);
      const isBlacklisted = blacklist.includes(formattedPhone);

      seenPhones.add(formattedPhone);

      entries.push({
        id: `csv-${index}-${Date.now()}`,
        phone,
        originalPhone: phone,
        name: name || undefined,
        document: document || undefined,
        city: city || undefined,
        state: state || undefined,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        status: isDuplicate ? "duplicate" : isBlacklisted ? "blacklisted" : "pending",
        formattedPhone,
        source: "csv",
      });
    });

    setPhoneEntries(entries);
    setCurrentSource("csv");
    setLeadsSavedCount(0);
    setLeadsDeletedCount(0);
    setShowColumnMapping(false);
    setParsedFileData(null);
    setSelectedPhoneColumn(null);
    setSelectedNameColumn(null);
    setSelectedDocumentColumn(null);
    setSelectedCityColumn(null);
    setSelectedStateColumn(null);
    setSelectedCustomFieldColumns({});
    toast.success(`${entries.length} números carregados do arquivo`);
  };

  // Cancel column mapping
  const cancelColumnMapping = () => {
    setShowColumnMapping(false);
    setParsedFileData(null);
    setSelectedPhoneColumn(null);
    setSelectedNameColumn(null);
    setSelectedDocumentColumn(null);
    setSelectedCityColumn(null);
    setSelectedStateColumn(null);
    setSelectedCustomFieldColumns({});
  };

  // Load selected leads
  const loadSelectedLeads = () => {
    if (selectedLeadIds.length === 0) {
      toast.error("Selecione pelo menos um lead");
      return;
    }
    
    const seenPhones = new Set<string>();
    const entries: PhoneEntry[] = [];
    
    selectedLeadIds.forEach((leadId) => {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) return;
      
      const formattedPhone = formatPhoneNumber(lead.phone);
      const isDuplicate = seenPhones.has(formattedPhone);
      const isBlacklisted = blacklist.includes(formattedPhone);
      
      seenPhones.add(formattedPhone);
      
      entries.push({
        id: lead.id,
        phone: lead.phone,
        originalPhone: lead.phone,
        name: lead.name,
        status: isDuplicate ? "duplicate" : isBlacklisted ? "blacklisted" : "pending",
        formattedPhone,
        source: "leads",
        leadId: lead.id,
        tags: lead.tags || [],
      });
    });
    
    setPhoneEntries(entries);
    setCurrentSource("leads");
    setLeadsSavedCount(0);
    setLeadsDeletedCount(0);
    setActiveTab("upload");
    toast.success(`${entries.length} leads carregados para higienização`);
  };

  // Toggle lead selection
  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [...prev, leadId]
    );
  };

  // Toggle tag filter
  const toggleTagFilter = (tagName: string) => {
    setSelectedTagFilters((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  };

  // Filter leads by search and tags
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchesSearch =
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone.includes(searchTerm);
      
      const matchesTags =
        selectedTagFilters.length === 0 ||
        (l.tags && selectedTagFilters.some((tag) => l.tags?.includes(tag)));
      
      return matchesSearch && matchesTags;
    });
  }, [leads, searchTerm, selectedTagFilters]);

  // Select all filtered leads
  const selectAllLeads = () => {
    setSelectedLeadIds(filteredLeads.map((l) => l.id));
  };

  // Deselect all leads
  const deselectAllLeads = () => {
    setSelectedLeadIds([]);
  };

  // Validate WhatsApp numbers using local Brazilian phone validation
  const validateNumbers = async () => {
    if (phoneEntries.length === 0) {
      toast.error("Nenhum número para validar");
      return;
    }
    
    setIsValidating(true);
    setValidationProgress(0);
    
    const pendingEntries = phoneEntries.filter((e) => e.status === "pending");
    const totalPending = pendingEntries.length;
    
    // Process in batches for better UX
    const batchSize = 50;
    const batches = Math.ceil(totalPending / batchSize);
    
    for (let batch = 0; batch < batches; batch++) {
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, totalPending);
      const batchEntries = pendingEntries.slice(start, end);
      
      // Process batch
      const updates: { id: string; status: PhoneEntry["status"]; validationResult: PhoneValidationResult; validationMessage: string; formattedPhone: string }[] = [];
      
      for (const entry of batchEntries) {
        const result = validateBrazilianPhone(entry.formattedPhone);
        const message = getValidationMessage(result);
        
        let status: PhoneEntry["status"];
        if (result.isValid) {
          if (result.isLandline) {
            status = "landline";
          } else {
            status = "valid";
          }
        } else {
          status = "invalid";
        }
        
        updates.push({
          id: entry.id,
          status,
          validationResult: result,
          validationMessage: message,
          formattedPhone: result.formattedNumber || entry.formattedPhone,
        });
      }
      
      // Apply batch updates
      setPhoneEntries((prev) =>
        prev.map((e) => {
          const update = updates.find((u) => u.id === e.id);
          if (update) {
            return {
              ...e,
              status: update.status,
              validationResult: update.validationResult,
              validationMessage: update.validationMessage,
              formattedPhone: update.formattedPhone,
            };
          }
          return e;
        })
      );
      
      setValidationProgress(Math.round((end / totalPending) * 100));
      
      // Small delay between batches for UI responsiveness
      if (batch < batches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    
    setIsValidating(false);
    toast.success("Validação local concluída!");
  };

  // Validate WhatsApp numbers using Z-API
  const validateWithZapi = async () => {
    // Get entries that are valid mobile numbers (can use WhatsApp)
    const validMobileEntries = phoneEntries.filter(
      (e) => e.status === "valid" || e.status === "whatsapp_valid" || e.status === "whatsapp_invalid"
    );
    
    if (validMobileEntries.length === 0) {
      toast.error("Nenhum celular válido para verificar no WhatsApp. Execute a validação local primeiro.");
      return;
    }
    
    setIsValidatingZapi(true);
    setZapiProgress(0);
    
    try {
      const phones = validMobileEntries.map((e) => e.formattedPhone.replace(/\D/g, ''));
      
      toast.info(`Verificando ${phones.length} números no WhatsApp via Z-API...`);
      
      const { data, error } = await supabase.functions.invoke('zapi-validate-batch', {
        body: { phones }
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      const results = data.results as Array<{
        exists: boolean;
        inputPhone: string;
        outputPhone: string;
      }>;
      
      // Create a map for quick lookup
      const resultMap = new Map<string, boolean>();
      results.forEach((r) => {
        resultMap.set(r.inputPhone, r.exists);
        // Also map the cleaned format
        const cleaned = r.inputPhone.replace(/\D/g, '');
        resultMap.set(cleaned, r.exists);
      });
      
      // Update entries
      setPhoneEntries((prev) =>
        prev.map((e) => {
          if (e.status !== "valid" && e.status !== "whatsapp_valid" && e.status !== "whatsapp_invalid") {
            return e;
          }
          
          const cleanedPhone = e.formattedPhone.replace(/\D/g, '');
          const hasWhatsApp = resultMap.get(cleanedPhone);
          
          if (hasWhatsApp === undefined) {
            return e;
          }
          
          return {
            ...e,
            status: hasWhatsApp ? "whatsapp_valid" : "whatsapp_invalid",
            hasWhatsApp,
            validationMessage: hasWhatsApp 
              ? "✅ Número possui WhatsApp" 
              : "❌ Número não possui WhatsApp",
          };
        })
      );
      
      const whatsappCount = results.filter((r) => r.exists).length;
      const noWhatsappCount = results.filter((r) => !r.exists).length;
      
      toast.success(
        `Verificação Z-API concluída! ${whatsappCount} com WhatsApp, ${noWhatsappCount} sem WhatsApp.`
      );
    } catch (error) {
      console.error("Z-API validation error:", error);
      toast.error(`Erro na verificação Z-API: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    } finally {
      setIsValidatingZapi(false);
      setZapiProgress(100);
    }
  };

  // Calculate statistics
  const stats: ValidationStats = useMemo(() => {
    return {
      total: phoneEntries.length,
      valid: phoneEntries.filter((e) => e.status === "valid").length,
      invalid: phoneEntries.filter((e) => e.status === "invalid").length,
      duplicates: phoneEntries.filter((e) => e.status === "duplicate").length,
      blacklisted: phoneEntries.filter((e) => e.status === "blacklisted").length,
      pending: phoneEntries.filter((e) => e.status === "pending").length,
      landline: phoneEntries.filter((e) => e.status === "landline").length,
      whatsappValid: phoneEntries.filter((e) => e.status === "whatsapp_valid").length,
      whatsappInvalid: phoneEntries.filter((e) => e.status === "whatsapp_invalid").length,
    };
  }, [phoneEntries]);

  // Chart data for distribution
  const chartData = useMemo(() => {
    if (stats.total === 0) return { pieData: [], barData: [] };

    const pieData = [
      { name: 'WhatsApp ✓', value: stats.whatsappValid, color: '#16a34a' },
      { name: 'Celular Válido', value: stats.valid, color: '#22c55e' },
      { name: 'Sem WhatsApp', value: stats.whatsappInvalid, color: '#6b7280' },
      { name: 'Fixo', value: stats.landline, color: '#eab308' },
      { name: 'Inválido', value: stats.invalid, color: '#ef4444' },
      { name: 'Duplicado', value: stats.duplicates, color: '#f97316' },
      { name: 'Lista Negra', value: stats.blacklisted, color: '#78716c' },
      { name: 'Pendente', value: stats.pending, color: '#a1a1aa' },
    ].filter(item => item.value > 0);

    const barData = [
      { name: 'WhatsApp', válidos: stats.whatsappValid, inválidos: stats.whatsappInvalid },
      { name: 'Formato', válidos: stats.valid + stats.whatsappValid, inválidos: stats.invalid },
      { name: 'Tipo', celular: stats.valid + stats.whatsappValid + stats.whatsappInvalid, fixo: stats.landline },
    ];

    return { pieData, barData };
  }, [stats]);

  // Export to CSV
  const exportToCsv = (type: "all" | "valid" | "invalid" | "whatsapp") => {
    let entries = phoneEntries;
    let filename = "higienizacao_completa";
    
    if (type === "valid") {
      entries = phoneEntries.filter((e) => e.status === "valid" || e.status === "whatsapp_valid");
      filename = "numeros_validos";
    } else if (type === "whatsapp") {
      entries = phoneEntries.filter((e) => e.status === "whatsapp_valid");
      filename = "numeros_whatsapp_validos";
    } else if (type === "invalid") {
      entries = phoneEntries.filter(
        (e) => e.status === "invalid" || e.status === "duplicate" || e.status === "blacklisted" || e.status === "whatsapp_invalid"
      );
      filename = "numeros_invalidos";
    }
    
    const csvContent = [
      "Telefone Original,Telefone Formatado,Nome,Status",
      ...entries.map(
        (e) =>
          `"${e.originalPhone}","${e.formattedPhone}","${e.name || ""}","${e.status}"`
      ),
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    
    toast.success("Arquivo exportado com sucesso!");
  };

  // Count valid entries for saving (including whatsapp_valid)
  const validEntriesForSave = useMemo(() => {
    return phoneEntries.filter(
      (e) => (e.status === "valid" || e.status === "whatsapp_valid") && e.source === "csv"
    );
  }, [phoneEntries]);

  const whatsappValidEntriesForSave = useMemo(() => {
    return phoneEntries.filter(
      (e) => e.status === "whatsapp_valid" && e.source === "csv"
    );
  }, [phoneEntries]);

  // Open save leads dialog
  const openSaveLeadsDialog = (onlyWhatsApp: boolean = false) => {
    setSaveOnlyWhatsApp(onlyWhatsApp);
    setSelectedTagsForSave([]);
    setShowCreateTag(false);
    setNewTagName("");
    setNewTagColor("#3b82f6");
    setShowSaveLeadsDialog(true);
  };

  // Create new tag
  const createNewTag = async () => {
    if (!profile?.organization_id || !newTagName.trim()) {
      toast.error("Digite um nome para a tag");
      return;
    }
    
    setIsCreatingTag(true);
    
    const { data, error } = await supabase
      .from("lead_tags")
      .insert({
        name: newTagName.trim(),
        color: newTagColor,
        organization_id: profile.organization_id,
      })
      .select()
      .single();
    
    if (error) {
      toast.error("Erro ao criar tag: " + error.message);
      setIsCreatingTag(false);
      return;
    }
    
    // Refresh tags and select the new one
    queryClient.invalidateQueries({ queryKey: ["lead-tags"] });
    setSelectedTagsForSave((prev) => [...prev, newTagName.trim()]);
    setShowCreateTag(false);
    setNewTagName("");
    setNewTagColor("#3b82f6");
    setIsCreatingTag(false);
    toast.success(`Tag "${data.name}" criada com sucesso!`);
  };

  // Save valid numbers as leads with optional tags
  const saveValidAsLeads = async () => {
    if (!profile?.organization_id || !user?.id) {
      toast.error("Erro: usuário não autenticado");
      return;
    }
    
    setIsSavingLeads(true);
    
    // Filter based on save mode
    const entriesToSave = saveOnlyWhatsApp 
      ? whatsappValidEntriesForSave 
      : validEntriesForSave;
    
    if (entriesToSave.length === 0) {
      toast.error("Nenhum número válido para salvar");
      setIsSavingLeads(false);
      return;
    }
    
    const leadsToInsert = entriesToSave.map((e) => ({
      phone: e.formattedPhone,
      name: e.name || `Lead ${e.formattedPhone}`,
      document: e.document || null,
      city: e.city || null,
      state: e.state || null,
      custom_fields: e.customFields || {},
      user_id: user.id,
      organization_id: profile.organization_id,
      status: "novo",
      tags: selectedTagsForSave.length > 0 ? selectedTagsForSave : null,
    }));
    
    const { error } = await supabase.from("leads").insert(leadsToInsert);
    
    if (error) {
      toast.error("Erro ao salvar leads: " + error.message);
      setIsSavingLeads(false);
      return;
    }
    
    setLeadsSavedCount((prev) => prev + entriesToSave.length);
    setShowSaveLeadsDialog(false);
    setSelectedTagsForSave([]);
    setIsSavingLeads(false);
    
    const tagInfo = selectedTagsForSave.length > 0 
      ? ` com ${selectedTagsForSave.length} tag(s)` 
      : "";
    toast.success(`${entriesToSave.length} leads salvos com sucesso${tagInfo}!`);
    refetchLeads();
  };

  // Delete invalid leads
  const deleteInvalidLeads = async () => {
    const invalidLeadIds = phoneEntries
      .filter(
        (e) =>
          e.source === "leads" &&
          e.leadId &&
          (e.status === "invalid" || e.status === "duplicate")
      )
      .map((e) => e.leadId!);
    
    if (invalidLeadIds.length === 0) {
      toast.error("Nenhum lead inválido para excluir");
      return;
    }
    
    const { error } = await supabase
      .from("leads")
      .delete()
      .in("id", invalidLeadIds);
    
    if (error) {
      toast.error("Erro ao excluir leads: " + error.message);
      return;
    }
    
    setPhoneEntries((prev) =>
      prev.filter((e) => !invalidLeadIds.includes(e.leadId || ""))
    );
    
    setLeadsDeletedCount((prev) => prev + invalidLeadIds.length);
    toast.success(`${invalidLeadIds.length} leads inválidos excluídos!`);
    refetchLeads();
  };

  // Finalize and save history
  const finalizeHygiene = async () => {
    await saveHistoryRecord(stats, leadsSavedCount, leadsDeletedCount);
    clearEntries();
    toast.success("Higienização finalizada e histórico salvo!");
    setActiveTab("history");
  };

  // Clear all entries
  const clearEntries = () => {
    setPhoneEntries([]);
    setSelectedLeadIds([]);
    setValidationProgress(0);
    setLeadsSavedCount(0);
    setLeadsDeletedCount(0);
  };

  // Get status badge with validation message tooltip
  const getStatusBadge = (status: PhoneEntry["status"], validationMessage?: string) => {
    const badge = (() => {
      switch (status) {
        case "valid":
          return (
            <Badge className="bg-success text-success-foreground gap-1">
              <Smartphone className="w-3 h-3" /> Celular Válido
            </Badge>
          );
        case "whatsapp_valid":
          return (
            <Badge className="bg-green-600 text-white gap-1">
              <MessageCircle className="w-3 h-3" /> WhatsApp ✓
            </Badge>
          );
        case "whatsapp_invalid":
          return (
            <Badge variant="secondary" className="gap-1 bg-gray-500 text-white">
              <MessageCircle className="w-3 h-3" /> Sem WhatsApp
            </Badge>
          );
        case "landline":
          return (
            <Badge variant="secondary" className="gap-1 bg-warning text-warning-foreground">
              <PhoneCall className="w-3 h-3" /> Fixo
            </Badge>
          );
        case "invalid":
          return (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="w-3 h-3" /> Inválido
            </Badge>
          );
        case "duplicate":
          return (
            <Badge variant="secondary" className="gap-1 bg-orange-500 text-white">
              <Copy className="w-3 h-3" /> Duplicado
            </Badge>
          );
        case "blacklisted":
          return (
            <Badge variant="outline" className="gap-1 border-destructive text-destructive">
              <Ban className="w-3 h-3" /> Na Lista Negra
            </Badge>
          );
        default:
          return (
            <Badge variant="outline" className="gap-1">
              <RefreshCw className="w-3 h-3" /> Pendente
            </Badge>
          );
      }
    })();

    if (validationMessage && status !== "pending") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {badge}
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">{validationMessage}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return badge;
  };

  // Calculate history statistics
  const historyStats = useMemo(() => {
    if (hygieneHistory.length === 0) return null;
    
    const totalProcessed = hygieneHistory.reduce((acc, h) => acc + h.total_numbers, 0);
    const totalValid = hygieneHistory.reduce((acc, h) => acc + h.valid_count, 0);
    const totalInvalid = hygieneHistory.reduce((acc, h) => acc + h.invalid_count, 0);
    const totalSaved = hygieneHistory.reduce((acc, h) => acc + h.leads_saved, 0);
    const totalDeleted = hygieneHistory.reduce((acc, h) => acc + h.leads_deleted, 0);
    
    return {
      totalProcessed,
      totalValid,
      totalInvalid,
      totalSaved,
      totalDeleted,
      avgValidRate: totalProcessed > 0 ? Math.round((totalValid / totalProcessed) * 100) : 0,
    };
  }, [hygieneHistory]);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Higienização</h1>
            <p className="text-muted-foreground">
              Valide e limpe sua base de contatos para melhor entregabilidade
            </p>
          </div>
        </div>

        {/* Statistics */}
        {phoneEntries.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-9 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Smartphone className="w-4 h-4 text-success" />
                    <p className="text-2xl font-bold text-success">{stats.valid}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Celulares</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-500/50">
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    <p className="text-2xl font-bold text-green-600">{stats.whatsappValid}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Com WhatsApp</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <MessageCircle className="w-4 h-4 text-gray-500" />
                    <p className="text-2xl font-bold text-gray-500">{stats.whatsappInvalid}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Sem WhatsApp</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <PhoneCall className="w-4 h-4 text-warning" />
                    <p className="text-2xl font-bold text-warning">{stats.landline}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Fixos</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{stats.invalid}</p>
                  <p className="text-xs text-muted-foreground">Inválidos</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-500">{stats.duplicates}</p>
                  <p className="text-xs text-muted-foreground">Duplicados</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{stats.blacklisted}</p>
                  <p className="text-xs text-muted-foreground">Lista Negra</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Distribution Charts */}
        {phoneEntries.length > 0 && stats.pending === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pie Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4" />
                  Distribuição por Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {chartData.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        formatter={(value: number) => [value, 'Quantidade']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {chartData.pieData.map((entry, index) => (
                    <div key={index} className="flex items-center gap-1 text-xs">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span>{entry.name}: {entry.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Summary Report Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Relatório da Higienização
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Total Processado</span>
                    <span className="text-lg font-bold">{stats.total}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Taxa de Aprovação</span>
                      <span className="text-sm font-medium text-green-600">
                        {stats.total > 0 ? Math.round(((stats.valid + stats.whatsappValid) / stats.total) * 100) : 0}%
                      </span>
                    </div>
                    <Progress 
                      value={stats.total > 0 ? ((stats.valid + stats.whatsappValid) / stats.total) * 100 : 0} 
                      className="h-2 [&>div]:bg-green-600"
                    />
                  </div>

                  {stats.whatsappValid > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Com WhatsApp</span>
                        <span className="text-sm font-medium text-green-600">
                          {stats.valid + stats.whatsappValid > 0 
                            ? Math.round((stats.whatsappValid / (stats.valid + stats.whatsappValid + stats.whatsappInvalid)) * 100) 
                            : 0}%
                        </span>
                      </div>
                      <Progress 
                        value={(stats.whatsappValid / (stats.valid + stats.whatsappValid + stats.whatsappInvalid)) * 100}
                        className="h-2 [&>div]:bg-green-500"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Taxa de Rejeição</span>
                      <span className="text-sm font-medium text-destructive">
                        {stats.total > 0 
                          ? Math.round(((stats.invalid + stats.duplicates + stats.blacklisted + stats.whatsappInvalid + stats.landline) / stats.total) * 100) 
                          : 0}%
                      </span>
                    </div>
                    <Progress 
                      value={stats.total > 0 
                        ? ((stats.invalid + stats.duplicates + stats.blacklisted + stats.whatsappInvalid + stats.landline) / stats.total) * 100 
                        : 0}
                      className="h-2 [&>div]:bg-destructive"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <p className="text-lg font-bold text-green-600">{stats.whatsappValid}</p>
                    <p className="text-xs text-muted-foreground">Prontos para Disparo</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-950/30">
                    <p className="text-lg font-bold text-destructive">{stats.invalid + stats.duplicates + stats.blacklisted + stats.whatsappInvalid + stats.landline}</p>
                    <p className="text-xs text-muted-foreground">Removidos/Bloqueados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upload" | "leads" | "history")}>
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload / Resultados
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2">
              <Users className="w-4 h-4" />
              Leads Existentes
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            {/* Column Mapping Dialog */}
            {showColumnMapping && parsedFileData && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5" />
                    Mapeamento de Colunas
                  </CardTitle>
                  <CardDescription>
                    Arquivo: <span className="font-medium">{parsedFileData.fileName}</span> • {parsedFileData.rows.length} linhas detectadas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Phone Column Selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Phone className="w-4 h-4 text-primary" />
                        Telefone <span className="text-destructive">*</span>
                      </label>
                      <select
                        value={selectedPhoneColumn ?? ""}
                        onChange={(e) => setSelectedPhoneColumn(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Selecione...</option>
                        {parsedFileData.headers.map((header, index) => (
                          <option key={index} value={index}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Name Column Selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        Nome
                      </label>
                      <select
                        value={selectedNameColumn ?? ""}
                        onChange={(e) => setSelectedNameColumn(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Nenhuma</option>
                        {parsedFileData.headers.map((header, index) => (
                          <option key={index} value={index} disabled={index === selectedPhoneColumn}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Document Column Selection (CPF/CNPJ) */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        CPF/CNPJ
                      </label>
                      <select
                        value={selectedDocumentColumn ?? ""}
                        onChange={(e) => setSelectedDocumentColumn(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Nenhuma</option>
                        {parsedFileData.headers.map((header, index) => (
                          <option key={index} value={index} disabled={index === selectedPhoneColumn}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* City Column Selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        Cidade
                      </label>
                      <select
                        value={selectedCityColumn ?? ""}
                        onChange={(e) => setSelectedCityColumn(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Nenhuma</option>
                        {parsedFileData.headers.map((header, index) => (
                          <option key={index} value={index} disabled={index === selectedPhoneColumn}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* State Column Selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        Estado
                      </label>
                      <select
                        value={selectedStateColumn ?? ""}
                        onChange={(e) => setSelectedStateColumn(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Nenhuma</option>
                        {parsedFileData.headers.map((header, index) => (
                          <option key={index} value={index} disabled={index === selectedPhoneColumn}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Custom Field Columns */}
                    {customFieldDefinitions.length > 0 && (
                      <>
                        <div className="col-span-full">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground border-t pt-4 mt-2">
                            <Plus className="w-4 h-4" />
                            Campos Personalizados
                            <Badge variant="secondary" className="ml-1">
                              {Object.keys(selectedCustomFieldColumns).length} detectado(s)
                            </Badge>
                          </div>
                        </div>
                        {customFieldDefinitions.map((field) => (
                          <div key={field.id} className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                              <Tag className="w-4 h-4 text-muted-foreground" />
                              {field.field_label}
                            </label>
                            <select
                              value={selectedCustomFieldColumns[field.field_name] ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                setSelectedCustomFieldColumns((prev) => {
                                  if (value === "") {
                                    const newState = { ...prev };
                                    delete newState[field.field_name];
                                    return newState;
                                  }
                                  return { ...prev, [field.field_name]: parseInt(value) };
                                });
                              }}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">Nenhuma</option>
                              {parsedFileData.headers.map((header, index) => (
                                <option key={index} value={index} disabled={index === selectedPhoneColumn}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Preview Table */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Prévia dos dados (primeiras 5 linhas)</label>
                    <div className="rounded-md border overflow-auto max-h-48">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {parsedFileData.headers.map((header, index) => {
                              const isPhone = index === selectedPhoneColumn;
                              const isName = index === selectedNameColumn;
                              const isDocument = index === selectedDocumentColumn;
                              const isCity = index === selectedCityColumn;
                              const isState = index === selectedStateColumn;
                              const customFieldName = Object.entries(selectedCustomFieldColumns).find(([_, colIdx]) => colIdx === index)?.[0];
                              const customField = customFieldName ? customFieldDefinitions.find(f => f.field_name === customFieldName) : null;
                              const isCustom = !!customField;
                              
                              return (
                                <TableHead 
                                  key={index}
                                  className={
                                    isPhone ? "bg-primary/10 text-primary font-bold" :
                                    isName ? "bg-blue-500/10 text-blue-600 font-bold" :
                                    isDocument ? "bg-purple-500/10 text-purple-600 font-bold" :
                                    isCity ? "bg-green-500/10 text-green-600 font-bold" :
                                    isState ? "bg-orange-500/10 text-orange-600 font-bold" :
                                    isCustom ? "bg-pink-500/10 text-pink-600 font-bold" : ""
                                  }
                                >
                                  {header}
                                  {isPhone && <Badge className="ml-2 text-xs" variant="default">Telefone</Badge>}
                                  {isName && <Badge className="ml-2 text-xs bg-blue-500">Nome</Badge>}
                                  {isDocument && <Badge className="ml-2 text-xs bg-purple-500">CPF/CNPJ</Badge>}
                                  {isCity && <Badge className="ml-2 text-xs bg-green-500">Cidade</Badge>}
                                  {isState && <Badge className="ml-2 text-xs bg-orange-500">Estado</Badge>}
                                  {isCustom && <Badge className="ml-2 text-xs bg-pink-500">{customField?.field_label}</Badge>}
                                </TableHead>
                              );
                            })}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedFileData.rows.slice(0, 5).map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                              {row.map((cell, cellIndex) => {
                                const isPhone = cellIndex === selectedPhoneColumn;
                                const isName = cellIndex === selectedNameColumn;
                                const isDocument = cellIndex === selectedDocumentColumn;
                                const isCity = cellIndex === selectedCityColumn;
                                const isState = cellIndex === selectedStateColumn;
                                const isCustom = Object.values(selectedCustomFieldColumns).includes(cellIndex);
                                
                                return (
                                  <TableCell 
                                    key={cellIndex}
                                    className={
                                      isPhone ? "bg-primary/5 font-mono" :
                                      isName ? "bg-blue-500/5" :
                                      isDocument ? "bg-purple-500/5 font-mono" :
                                      isCity ? "bg-green-500/5" :
                                      isState ? "bg-orange-500/5" :
                                      isCustom ? "bg-pink-500/5" : ""
                                    }
                                  >
                                    {cell || <span className="text-muted-foreground italic">vazio</span>}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={cancelColumnMapping}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={processFileWithColumns}
                      disabled={selectedPhoneColumn === null}
                      className="gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar e Processar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!showColumnMapping && phoneEntries.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Importar Números</CardTitle>
                  <CardDescription>
                    Faça upload de um arquivo CSV ou TXT com os números de telefone
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">
                      Arraste um arquivo ou clique para selecionar
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Formato: CSV ou TXT • Você poderá selecionar qual coluna contém os telefones
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </CardContent>
              </Card>
            ) : !showColumnMapping && (
              <div className="space-y-4">
                {/* Actions */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={validateNumbers}
                        disabled={isValidating || isValidatingZapi || stats.pending === 0}
                        className="gap-2"
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Validando Formato...
                          </>
                        ) : (
                          <>
                            <Phone className="w-4 h-4" />
                            Validar Formato
                          </>
                        )}
                      </Button>
                      
                      <Button
                        onClick={validateWithZapi}
                        disabled={isValidating || isValidatingZapi || stats.valid === 0}
                        className="gap-2 bg-green-600 hover:bg-green-700"
                      >
                        {isValidatingZapi ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Verificando WhatsApp...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            Verificar WhatsApp (Z-API)
                          </>
                        )}
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => exportToCsv("valid")}
                        disabled={stats.valid + stats.whatsappValid === 0}
                        className="gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Exportar Válidos
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => exportToCsv("whatsapp")}
                        disabled={stats.whatsappValid === 0}
                        className="gap-2 border-green-500 text-green-600 hover:bg-green-50"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Exportar com WhatsApp
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => exportToCsv("invalid")}
                        disabled={stats.invalid + stats.duplicates + stats.blacklisted + stats.whatsappInvalid === 0}
                        className="gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Exportar Inválidos
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => openSaveLeadsDialog(false)}
                        disabled={validEntriesForSave.length === 0}
                        className="gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        Salvar Válidos ({validEntriesForSave.length})
                      </Button>
                      
                      {whatsappValidEntriesForSave.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => openSaveLeadsDialog(true)}
                          className="gap-2 border-green-500 text-green-600 hover:bg-green-50"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Salvar só WhatsApp ({whatsappValidEntriesForSave.length})
                        </Button>
                      )}
                      
                      <Button
                        variant="destructive"
                        onClick={deleteInvalidLeads}
                        disabled={
                          phoneEntries.filter(
                            (e) =>
                              e.source === "leads" &&
                              (e.status === "invalid" || e.status === "duplicate")
                          ).length === 0
                        }
                        className="gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir Leads Inválidos
                      </Button>
                      
                      <Button
                        variant="ghost"
                        onClick={clearEntries}
                        className="gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Limpar
                      </Button>

                      {stats.pending === 0 && stats.total > 0 && (
                        <Button
                          onClick={finalizeHygiene}
                          className="gap-2 ml-auto"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Finalizar e Salvar Histórico
                        </Button>
                      )}
                    </div>
                    
                    {isValidating && (
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progresso da validação de formato</span>
                          <span>{validationProgress}%</span>
                        </div>
                        <Progress value={validationProgress} />
                      </div>
                    )}
                    
                    {isValidatingZapi && (
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-green-600" />
                            Verificando WhatsApp via Z-API...
                          </span>
                          <span className="text-green-600">Processando</span>
                        </div>
                        <div className="relative">
                          <Progress value={100} className="animate-pulse [&>div]:bg-green-600" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Aguarde enquanto verificamos se os números possuem WhatsApp
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Results Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Resultados ({phoneEntries.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border max-h-96 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Telefone Original</TableHead>
                            <TableHead>Telefone Formatado</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Origem</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {phoneEntries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>{entry.name || "-"}</TableCell>
                              <TableCell className="font-mono text-sm">
                                {entry.originalPhone}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {entry.formattedPhone}
                              </TableCell>
                              <TableCell>{getStatusBadge(entry.status, entry.validationMessage)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {entry.source === "csv" ? "Arquivo" : "Lead"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Selecionar Leads</CardTitle>
                <CardDescription>
                  Selecione os leads da sua base para higienização. Use os filtros para refinar a seleção.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Buscar por nome ou telefone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {/* Tag Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <Tag className="w-4 h-4" />
                        Filtrar por Tags
                        {selectedTagFilters.length > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            {selectedTagFilters.length}
                          </Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Selecione as tags:</p>
                        {availableTags.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhuma tag disponível</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {availableTags.map((tag) => (
                              <Badge
                                key={tag.id}
                                variant={selectedTagFilters.includes(tag.name) ? "default" : "outline"}
                                className="cursor-pointer"
                                style={
                                  selectedTagFilters.includes(tag.name) && tag.color
                                    ? { backgroundColor: tag.color, borderColor: tag.color }
                                    : tag.color
                                    ? { borderColor: tag.color, color: tag.color }
                                    : {}
                                }
                                onClick={() => toggleTagFilter(tag.name)}
                              >
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {selectedTagFilters.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2"
                            onClick={() => setSelectedTagFilters([])}
                          >
                            Limpar filtros
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  
                  <Button variant="outline" size="sm" onClick={selectAllLeads}>
                    Selecionar Todos
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAllLeads}>
                    Limpar Seleção
                  </Button>
                </div>

                {/* Active tag filters */}
                {selectedTagFilters.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-sm text-muted-foreground">Filtros ativos:</span>
                    {selectedTagFilters.map((tag) => {
                      const tagData = availableTags.find((t) => t.name === tag);
                      return (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="gap-1 cursor-pointer"
                          style={tagData?.color ? { backgroundColor: tagData.color } : {}}
                          onClick={() => toggleTagFilter(tag)}
                        >
                          {tag}
                          <X className="w-3 h-3" />
                        </Badge>
                      );
                    })}
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  {selectedLeadIds.length} de {filteredLeads.length} leads selecionados
                  {selectedTagFilters.length > 0 && ` (filtrado de ${leads.length} total)`}
                </p>

                <div className="rounded-md border max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              filteredLeads.length > 0 &&
                              filteredLeads.every((l) => selectedLeadIds.includes(l.id))
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                selectAllLeads();
                              } else {
                                deselectAllLeads();
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeads.map((lead) => (
                        <TableRow
                          key={lead.id}
                          className="cursor-pointer"
                          onClick={() => toggleLeadSelection(lead.id)}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedLeadIds.includes(lead.id)}
                              onCheckedChange={() => toggleLeadSelection(lead.id)}
                            />
                          </TableCell>
                          <TableCell>{lead.name}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {lead.phone}
                          </TableCell>
                          <TableCell>
                            {lead.tags && lead.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {lead.tags.slice(0, 3).map((tag) => {
                                  const tagData = availableTags.find((t) => t.name === tag);
                                  return (
                                    <Badge
                                      key={tag}
                                      variant="outline"
                                      className="text-xs"
                                      style={tagData?.color ? { borderColor: tagData.color, color: tagData.color } : {}}
                                    >
                                      {tag}
                                    </Badge>
                                  );
                                })}
                                {lead.tags.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{lead.tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredLeads.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Nenhum lead encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <Button
                  onClick={loadSelectedLeads}
                  disabled={selectedLeadIds.length === 0}
                  className="w-full gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Carregar {selectedLeadIds.length} Leads para Higienização
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {/* Summary Statistics */}
            {historyStats && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{historyStats.totalProcessed.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground">Total Processados</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-success">{historyStats.totalValid.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground">Total Válidos</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-destructive">{historyStats.totalInvalid.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground">Total Inválidos</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{historyStats.avgValidRate}%</p>
                      <p className="text-xs text-muted-foreground">Taxa de Validação</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">+{historyStats.totalSaved.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground">Leads Salvos</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{hygieneHistory.length}</p>
                      <p className="text-xs text-muted-foreground">Higienizações</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* History Trend Chart */}
            {hygieneHistory.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Tendência de Higienizações
                  </CardTitle>
                  <CardDescription>Últimas higienizações realizadas</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hygieneHistory.slice(0, 10).reverse().map((h) => ({
                        data: format(new Date(h.created_at), "dd/MM", { locale: ptBR }),
                        válidos: h.valid_count,
                        inválidos: h.invalid_count,
                        duplicados: h.duplicate_count,
                        total: h.total_numbers,
                        taxa: h.total_numbers > 0 ? Math.round((h.valid_count / h.total_numbers) * 100) : 0,
                      }))}>
                        <XAxis dataKey="data" fontSize={12} />
                        <YAxis fontSize={12} />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                          formatter={(value: number, name: string) => [value.toLocaleString('pt-BR'), name]}
                        />
                        <Legend />
                        <Bar dataKey="válidos" fill="#22c55e" name="Válidos" />
                        <Bar dataKey="inválidos" fill="#ef4444" name="Inválidos" />
                        <Bar dataKey="duplicados" fill="#f97316" name="Duplicados" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* History Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Histórico de Higienizações</CardTitle>
                    <CardDescription>
                      Últimas 50 higienizações realizadas
                    </CardDescription>
                  </div>
                  {hygieneHistory.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const csvContent = [
                          "Data,Origem,Total,Válidos,Inválidos,Duplicados,Lista Negra,Salvos,Excluídos,Taxa de Aprovação",
                          ...hygieneHistory.map((h) => 
                            `"${format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}","${h.source_type === 'csv' ? 'Arquivo' : 'Leads'}",${h.total_numbers},${h.valid_count},${h.invalid_count},${h.duplicate_count},${h.blacklisted_count},${h.leads_saved},${h.leads_deleted},${h.total_numbers > 0 ? Math.round((h.valid_count / h.total_numbers) * 100) : 0}%`
                          ),
                        ].join("\n");
                        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = `historico_higienizacao_${new Date().toISOString().split("T")[0]}.csv`;
                        link.click();
                        toast.success("Histórico exportado com sucesso!");
                      }}
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Exportar Histórico
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {hygieneHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma higienização realizada ainda</p>
                    <p className="text-sm">Faça sua primeira higienização para ver o histórico aqui</p>
                  </div>
                ) : (
                  <div className="rounded-md border max-h-96 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead className="text-center">Válidos</TableHead>
                          <TableHead className="text-center">Inválidos</TableHead>
                          <TableHead className="text-center">Duplicados</TableHead>
                          <TableHead className="text-center">Lista Negra</TableHead>
                          <TableHead className="text-center">Taxa</TableHead>
                          <TableHead className="text-center">Salvos</TableHead>
                          <TableHead className="text-center">Excluídos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hygieneHistory.map((record) => {
                          const approvalRate = record.total_numbers > 0 
                            ? Math.round((record.valid_count / record.total_numbers) * 100) 
                            : 0;
                          return (
                            <TableRow key={record.id}>
                              <TableCell>
                                {format(new Date(record.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {record.source_type === "csv" ? "Arquivo" : "Leads"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center font-medium">
                                {record.total_numbers.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-center text-success">
                                {record.valid_count.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-center text-destructive">
                                {record.invalid_count.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-center text-warning">
                                {record.duplicate_count.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground">
                                {record.blacklisted_count.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge 
                                  variant={approvalRate >= 70 ? "default" : approvalRate >= 40 ? "secondary" : "destructive"}
                                  className={approvalRate >= 70 ? "bg-success text-success-foreground" : ""}
                                >
                                  {approvalRate}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {record.leads_saved > 0 ? (
                                  <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                                    +{record.leads_saved}
                                  </Badge>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {record.leads_deleted > 0 ? (
                                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                                    -{record.leads_deleted}
                                  </Badge>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Tips Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Dicas de Higienização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>
                  <strong>DDDs Brasileiros Válidos:</strong> Verificamos se o DDD é um código válido do Brasil (todos os 67 DDDs)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>
                  <strong>Celular vs Fixo:</strong> Identificamos automaticamente se o número é celular ou telefone fixo. Fixos não funcionam com WhatsApp!
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>
                  <strong>Formato de Celular:</strong> Celulares devem ter 11 dígitos, começar com 9, e o segundo dígito ser 6, 7, 8 ou 9
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <span>
                  <strong>Verificação WhatsApp (Z-API):</strong> Após validar o formato, use o botão "Verificar WhatsApp" para confirmar quais números realmente possuem WhatsApp ativo
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>
                  <strong>Detecção de Duplicados:</strong> Números repetidos são automaticamente identificados
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>
                  <strong>Formatação Automática:</strong> Números são padronizados para formato internacional (+55...) e o 9 é adicionado se necessário
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>
                  <strong>Lista Negra:</strong> Números na sua lista negra são identificados automaticamente
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>
                  <strong>Filtro por Tags:</strong> Selecione leads específicos filtrando por tags para uma higienização mais direcionada
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Save Leads Dialog with Tag Selection */}
        <Dialog open={showSaveLeadsDialog} onOpenChange={setShowSaveLeadsDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Salvar Leads
              </DialogTitle>
              <DialogDescription>
                {saveOnlyWhatsApp 
                  ? `Você está salvando ${whatsappValidEntriesForSave.length} leads com WhatsApp verificado.`
                  : `Você está salvando ${validEntriesForSave.length} leads válidos.`
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">
                    Deseja adicionar tags aos leads? (opcional)
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateTag(!showCreateTag)}
                    className="gap-1 h-7 text-xs"
                  >
                    <Plus className="w-3 h-3" />
                    Nova Tag
                  </Button>
                </div>
                
                {/* Create New Tag Form */}
                {showCreateTag && (
                  <div className="mb-3 p-3 border rounded-md bg-muted/30 space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nome da tag"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="flex-1 h-8"
                      />
                      <input
                        type="color"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="w-8 h-8 rounded border cursor-pointer"
                        title="Cor da tag"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowCreateTag(false);
                          setNewTagName("");
                          setNewTagColor("#3b82f6");
                        }}
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={createNewTag}
                        disabled={isCreatingTag || !newTagName.trim()}
                        className="flex-1 gap-1"
                      >
                        {isCreatingTag ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                        Criar
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-wrap gap-2 max-h-40 overflow-auto p-2 border rounded-md">
                  {availableTags.length === 0 && !showCreateTag ? (
                    <p className="text-sm text-muted-foreground">Nenhuma tag disponível. Clique em "Nova Tag" para criar.</p>
                  ) : (
                    availableTags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant={selectedTagsForSave.includes(tag.name) ? "default" : "outline"}
                        className="cursor-pointer transition-colors"
                        style={
                          selectedTagsForSave.includes(tag.name)
                            ? { backgroundColor: tag.color || undefined }
                            : { borderColor: tag.color || undefined, color: tag.color || undefined }
                        }
                        onClick={() => {
                          setSelectedTagsForSave((prev) =>
                            prev.includes(tag.name)
                              ? prev.filter((t) => t !== tag.name)
                              : [...prev, tag.name]
                          );
                        }}
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag.name}
                      </Badge>
                    ))
                  )}
                </div>
                {selectedTagsForSave.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {selectedTagsForSave.length} tag(s) selecionada(s): {selectedTagsForSave.join(", ")}
                  </p>
                )}
              </div>
            </div>
            
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowSaveLeadsDialog(false)}
                disabled={isSavingLeads}
              >
                Cancelar
              </Button>
              <Button
                onClick={saveValidAsLeads}
                disabled={isSavingLeads}
                className="gap-2"
              >
                {isSavingLeads ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Salvar {saveOnlyWhatsApp ? whatsappValidEntriesForSave.length : validEntriesForSave.length} Leads
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
