import { useState, useRef, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface PhoneEntry {
  id: string;
  phone: string;
  originalPhone: string;
  name?: string;
  status: "pending" | "valid" | "invalid" | "duplicate" | "blacklisted";
  formattedPhone: string;
  source: "csv" | "leads";
  leadId?: string;
}

interface ValidationStats {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  blacklisted: number;
  pending: number;
}

export default function Higienizacao() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "leads">("upload");
  const [phoneEntries, setPhoneEntries] = useState<PhoneEntry[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

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

  // Fetch leads for selection
  const { data: leads = [], refetch: refetchLeads } = useQuery({
    queryKey: ["leads-for-hygiene", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, email")
        .eq("organization_id", profile.organization_id)
        .order("name");
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

  // Format phone number to standard format
  const formatPhoneNumber = (phone: string): string => {
    const digits = phone.replace(/\D/g, "");
    
    // Brazilian numbers
    if (digits.length === 11) {
      return `+55${digits}`;
    } else if (digits.length === 13 && digits.startsWith("55")) {
      return `+${digits}`;
    } else if (digits.length === 12 && digits.startsWith("55")) {
      // Missing 9 in mobile
      const ddd = digits.slice(2, 4);
      const number = digits.slice(4);
      return `+55${ddd}9${number}`;
    }
    
    // If already has country code
    if (digits.startsWith("55") && digits.length >= 12) {
      return `+${digits}`;
    }
    
    // Default: add Brazil code
    return `+55${digits}`;
  };

  // Parse CSV file
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
      
      const entries: PhoneEntry[] = [];
      const seenPhones = new Set<string>();
      
      lines.forEach((line, index) => {
        // Skip header if it looks like a header
        if (index === 0 && (line.toLowerCase().includes("phone") || line.toLowerCase().includes("telefone"))) {
          return;
        }
        
        // Parse CSV line
        const parts = line.split(/[,;|\t]/).map((p) => p.trim().replace(/"/g, ""));
        const phone = parts[0];
        const name = parts[1] || undefined;
        
        if (!phone) return;
        
        const formattedPhone = formatPhoneNumber(phone);
        const isDuplicate = seenPhones.has(formattedPhone);
        const isBlacklisted = blacklist.includes(formattedPhone);
        
        seenPhones.add(formattedPhone);
        
        entries.push({
          id: `csv-${index}-${Date.now()}`,
          phone,
          originalPhone: phone,
          name,
          status: isDuplicate ? "duplicate" : isBlacklisted ? "blacklisted" : "pending",
          formattedPhone,
          source: "csv",
        });
      });
      
      setPhoneEntries(entries);
      toast.success(`${entries.length} números carregados do arquivo`);
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
      });
    });
    
    setPhoneEntries(entries);
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

  // Select all leads
  const selectAllLeads = () => {
    const filteredLeads = leads.filter(
      (l) =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone.includes(searchTerm)
    );
    setSelectedLeadIds(filteredLeads.map((l) => l.id));
  };

  // Deselect all leads
  const deselectAllLeads = () => {
    setSelectedLeadIds([]);
  };

  // Validate WhatsApp numbers (simulated - in production would use WhatsApp Business API)
  const validateNumbers = async () => {
    if (phoneEntries.length === 0) {
      toast.error("Nenhum número para validar");
      return;
    }
    
    setIsValidating(true);
    setValidationProgress(0);
    
    const pendingEntries = phoneEntries.filter(
      (e) => e.status === "pending"
    );
    
    // Simulate validation (in production, this would call WhatsApp Business API)
    for (let i = 0; i < pendingEntries.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const entry = pendingEntries[i];
      // Simulate: 85% chance of being valid for proper formatted numbers
      const isValid = entry.formattedPhone.length >= 13 && Math.random() > 0.15;
      
      setPhoneEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: isValid ? "valid" : "invalid" }
            : e
        )
      );
      
      setValidationProgress(Math.round(((i + 1) / pendingEntries.length) * 100));
    }
    
    setIsValidating(false);
    toast.success("Validação concluída!");
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
    };
  }, [phoneEntries]);

  // Export to CSV
  const exportToCsv = (type: "all" | "valid" | "invalid") => {
    let entries = phoneEntries;
    let filename = "higienizacao_completa";
    
    if (type === "valid") {
      entries = phoneEntries.filter((e) => e.status === "valid");
      filename = "numeros_validos";
    } else if (type === "invalid") {
      entries = phoneEntries.filter(
        (e) => e.status === "invalid" || e.status === "duplicate" || e.status === "blacklisted"
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

  // Save valid numbers as leads
  const saveValidAsLeads = async () => {
    if (!profile?.organization_id || !user?.id) {
      toast.error("Erro: usuário não autenticado");
      return;
    }
    
    const validEntries = phoneEntries.filter(
      (e) => e.status === "valid" && e.source === "csv"
    );
    
    if (validEntries.length === 0) {
      toast.error("Nenhum número válido para salvar");
      return;
    }
    
    const leadsToInsert = validEntries.map((e) => ({
      phone: e.formattedPhone,
      name: e.name || `Lead ${e.formattedPhone}`,
      user_id: user.id,
      organization_id: profile.organization_id,
      status: "novo",
    }));
    
    const { error } = await supabase.from("leads").insert(leadsToInsert);
    
    if (error) {
      toast.error("Erro ao salvar leads: " + error.message);
      return;
    }
    
    toast.success(`${validEntries.length} leads salvos com sucesso!`);
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
    
    toast.success(`${invalidLeadIds.length} leads inválidos excluídos!`);
    refetchLeads();
  };

  // Clear all entries
  const clearEntries = () => {
    setPhoneEntries([]);
    setSelectedLeadIds([]);
    setValidationProgress(0);
  };

  // Get status badge
  const getStatusBadge = (status: PhoneEntry["status"]) => {
    switch (status) {
      case "valid":
        return (
          <Badge className="bg-success text-success-foreground gap-1">
            <CheckCircle2 className="w-3 h-3" /> Válido
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
          <Badge variant="secondary" className="gap-1 bg-warning text-warning-foreground">
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
  };

  const filteredLeads = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone.includes(searchTerm)
  );

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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
                  <p className="text-2xl font-bold text-success">{stats.valid}</p>
                  <p className="text-xs text-muted-foreground">Válidos</p>
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
                  <p className="text-2xl font-bold text-warning">{stats.duplicates}</p>
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

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upload" | "leads")}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload de Arquivo
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2">
              <Users className="w-4 h-4" />
              Leads Existentes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            {phoneEntries.length === 0 ? (
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
                      Formato: CSV ou TXT com uma coluna de telefone (opcionalmente nome na segunda coluna)
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
            ) : (
              <div className="space-y-4">
                {/* Actions */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={validateNumbers}
                        disabled={isValidating || stats.pending === 0}
                        className="gap-2"
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Validando...
                          </>
                        ) : (
                          <>
                            <Phone className="w-4 h-4" />
                            Validar WhatsApp
                          </>
                        )}
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => exportToCsv("valid")}
                        disabled={stats.valid === 0}
                        className="gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Exportar Válidos
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => exportToCsv("invalid")}
                        disabled={stats.invalid + stats.duplicates + stats.blacklisted === 0}
                        className="gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Exportar Inválidos
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={saveValidAsLeads}
                        disabled={stats.valid === 0 || phoneEntries.every((e) => e.source === "leads")}
                        className="gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        Salvar Válidos como Leads
                      </Button>
                      
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
                    </div>
                    
                    {isValidating && (
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progresso da validação</span>
                          <span>{validationProgress}%</span>
                        </div>
                        <Progress value={validationProgress} />
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
                              <TableCell>{getStatusBadge(entry.status)}</TableCell>
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
                  Selecione os leads da sua base para higienização
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Buscar por nome ou telefone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={selectAllLeads}>
                    Selecionar Todos
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAllLeads}>
                    Limpar Seleção
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground">
                  {selectedLeadIds.length} de {leads.length} leads selecionados
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
                        <TableHead>Email</TableHead>
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
                          <TableCell>{lead.email || "-"}</TableCell>
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
                  <strong>Detecção de Duplicados:</strong> Números repetidos são automaticamente identificados
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>
                  <strong>Formatação Automática:</strong> Números são padronizados para formato internacional (+55...)
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
                  <strong>Validação WhatsApp:</strong> Verifique se os números possuem conta ativa no WhatsApp
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
