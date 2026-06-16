import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, Plus, Trash2, Search, UserX, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface BlacklistEntry {
  id: string;
  organization_id: string;
  phone: string;
  name: string | null;
  reason: string | null;
  blocked_by: string | null;
  created_at: string;
}

interface ImportResult {
  success: number;
  duplicates: number;
  errors: number;
  total: number;
}

export default function ListaNegra() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [newEntry, setNewEntry] = useState({
    phone: "",
    name: "",
    reason: "",
  });
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ phone: string; name?: string }[]>([]);

  // Get effective organization (respects super_admin impersonation)
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const profile = effectiveOrganizationId
    ? { organization_id: effectiveOrganizationId }
    : null;

  // Get blacklist entries
  const { data: blacklist, isLoading } = useQuery({
    queryKey: ["blacklist", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return [];
      const { data, error } = await supabase
        .from("blacklist")
        .select("*")
        .eq("organization_id", effectiveOrganizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BlacklistEntry[];
    },
    enabled: !!effectiveOrganizationId,
  });

  // Add to blacklist mutation
  const addMutation = useMutation({
    mutationFn: async (entry: typeof newEntry) => {
      if (!profile?.organization_id) throw new Error("No organization");
      
      // Format phone number
      const phone = entry.phone.replace(/\D/g, "");
      
      const { error } = await supabase.from("blacklist").insert({
        organization_id: profile.organization_id,
        phone,
        name: entry.name || null,
        reason: entry.reason || null,
        blocked_by: user?.id,
      });
      
      if (error) {
        if (error.code === "23505") {
          throw new Error("Este número já está na lista negra");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blacklist"] });
      toast.success("Contato adicionado à lista negra");
      setIsAddDialogOpen(false);
      setNewEntry({ phone: "", name: "", reason: "" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar");
    },
  });

  // Remove from blacklist mutation
  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blacklist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blacklist"] });
      toast.success("Contato removido da lista negra");
      setDeleteId(null);
    },
    onError: () => {
      toast.error("Erro ao remover contato");
    },
  });

  const formatPhone = (phone: string) => {
    if (phone.length === 13) {
      return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    if (phone.length === 12) {
      return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`;
    }
    return phone;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error("Por favor, selecione um arquivo CSV");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const entries: { phone: string; name?: string }[] = [];

    // Skip header if it looks like one
    const startIndex = lines[0]?.toLowerCase().includes('telefone') || 
                       lines[0]?.toLowerCase().includes('phone') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(/[,;]/).map(p => p.trim().replace(/"/g, ''));
      const phone = parts[0]?.replace(/\D/g, '');
      const name = parts[1] || undefined;

      if (phone && phone.length >= 10) {
        entries.push({ phone, name });
      }
    }

    setCsvPreview(entries.slice(0, 5));
    setImportResult(null);
    
    if (entries.length === 0) {
      toast.error("Nenhum número válido encontrado no arquivo");
    } else {
      setIsImportDialogOpen(true);
    }
  };

  const handleImport = async () => {
    if (!profile?.organization_id || !fileInputRef.current?.files?.[0]) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportResult(null);

    const file = fileInputRef.current.files[0];
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    const startIndex = lines[0]?.toLowerCase().includes('telefone') || 
                       lines[0]?.toLowerCase().includes('phone') ? 1 : 0;

    const entries: { phone: string; name?: string }[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(/[,;]/).map(p => p.trim().replace(/"/g, ''));
      const phone = parts[0]?.replace(/\D/g, '');
      const name = parts[1] || undefined;
      if (phone && phone.length >= 10) {
        entries.push({ phone, name });
      }
    }

    let success = 0;
    let duplicates = 0;
    let errors = 0;
    const batchSize = 50;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      const { error } = await supabase.from("blacklist").insert(
        batch.map(entry => ({
          organization_id: profile.organization_id,
          phone: entry.phone,
          name: entry.name || null,
          reason: "Importado via CSV",
          blocked_by: user?.id,
        }))
      );

      if (error) {
        // Handle batch errors - try individual inserts
        for (const entry of batch) {
          const { error: singleError } = await supabase.from("blacklist").insert({
            organization_id: profile.organization_id,
            phone: entry.phone,
            name: entry.name || null,
            reason: "Importado via CSV",
            blocked_by: user?.id,
          });

          if (singleError) {
            if (singleError.code === '23505') {
              duplicates++;
            } else {
              errors++;
            }
          } else {
            success++;
          }
        }
      } else {
        success += batch.length;
      }

      setImportProgress(Math.round(((i + batch.length) / entries.length) * 100));
    }

    setImportResult({ success, duplicates, errors, total: entries.length });
    setIsImporting(false);
    queryClient.invalidateQueries({ queryKey: ["blacklist"] });

    if (success > 0) {
      toast.success(`${success} contatos importados com sucesso`);
    }
  };

  const resetImport = () => {
    setIsImportDialogOpen(false);
    setCsvPreview([]);
    setImportResult(null);
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredBlacklist = blacklist?.filter(
    (entry) =>
      entry.phone.includes(searchTerm.replace(/\D/g, "")) ||
      entry.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Ban className="h-8 w-8 text-destructive" />
              Lista Negra
            </h1>
            <p className="text-muted-foreground">
              Contatos bloqueados que não receberão disparos
            </p>
          </div>

          <div className="flex gap-2">
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Importar CSV
            </Button>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Contato
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar à Lista Negra</DialogTitle>
                  <DialogDescription>
                    Este contato não receberá mais disparos da sua organização.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input
                      id="phone"
                      placeholder="5511999999999"
                      value={newEntry.phone}
                      onChange={(e) =>
                        setNewEntry({ ...newEntry, phone: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Formato: código do país + DDD + número
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome (opcional)</Label>
                    <Input
                      id="name"
                      placeholder="Nome do contato"
                      value={newEntry.name}
                      onChange={(e) =>
                        setNewEntry({ ...newEntry, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Motivo (opcional)</Label>
                    <Textarea
                      id="reason"
                      placeholder="Por que este contato está sendo bloqueado?"
                      value={newEntry.reason}
                      onChange={(e) =>
                        setNewEntry({ ...newEntry, reason: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => addMutation.mutate(newEntry)}
                    disabled={!newEntry.phone || addMutation.isPending}
                  >
                    {addMutation.isPending ? "Adicionando..." : "Adicionar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Import Dialog */}
        <Dialog open={isImportDialogOpen} onOpenChange={(open) => !isImporting && (open ? setIsImportDialogOpen(true) : resetImport())}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Importar Lista Negra
              </DialogTitle>
              <DialogDescription>
                Importe contatos em massa a partir de um arquivo CSV.
              </DialogDescription>
            </DialogHeader>

            {!importResult ? (
              <>
                <div className="space-y-4 py-4">
                  {csvPreview.length > 0 && (
                    <div className="space-y-2">
                      <Label>Pré-visualização ({csvPreview.length} de {fileInputRef.current?.files?.[0] ? "..." : "0"} contatos)</Label>
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Telefone</TableHead>
                              <TableHead>Nome</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {csvPreview.map((entry, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-sm">{formatPhone(entry.phone)}</TableCell>
                                <TableCell>{entry.name || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Mostrando os primeiros 5 registros
                      </p>
                    </div>
                  )}

                  {isImporting && (
                    <div className="space-y-2">
                      <Label>Importando...</Label>
                      <Progress value={importProgress} className="h-2" />
                      <p className="text-sm text-muted-foreground text-center">
                        {importProgress}% concluído
                      </p>
                    </div>
                  )}

                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">Formato esperado do CSV:</p>
                    <code className="text-xs bg-background p-2 rounded block">
                      telefone,nome<br/>
                      5511999999999,João Silva<br/>
                      5521988888888,Maria Santos
                    </code>
                    <p className="text-xs text-muted-foreground">
                      A coluna de nome é opcional. Separadores aceitos: vírgula (,) ou ponto e vírgula (;)
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={resetImport} disabled={isImporting}>
                    Cancelar
                  </Button>
                  <Button onClick={handleImport} disabled={isImporting || csvPreview.length === 0}>
                    {isImporting ? "Importando..." : "Importar Contatos"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="py-6 space-y-6">
                <div className="text-center space-y-2">
                  <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                  <h3 className="text-lg font-semibold">Importação Concluída</h3>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-primary/10 rounded-lg p-4">
                    <p className="text-2xl font-bold text-primary">{importResult.success}</p>
                    <p className="text-xs text-muted-foreground">Importados</p>
                  </div>
                  <div className="bg-warning/10 rounded-lg p-4">
                    <p className="text-2xl font-bold text-warning">{importResult.duplicates}</p>
                    <p className="text-xs text-muted-foreground">Duplicados</p>
                  </div>
                  <div className="bg-destructive/10 rounded-lg p-4">
                    <p className="text-2xl font-bold text-destructive">{importResult.errors}</p>
                    <p className="text-xs text-muted-foreground">Erros</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button onClick={resetImport}>Fechar</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Contatos Bloqueados</CardTitle>
                <CardDescription>
                  {blacklist?.length || 0} contatos na lista negra
                </CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredBlacklist && filteredBlacklist.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contato</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Data do Bloqueio</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBlacklist.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserX className="h-4 w-4 text-destructive" />
                          <span className="font-medium">
                            {entry.name || "Sem nome"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatPhone(entry.phone)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {entry.reason || "-"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Ban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Nenhum contato na lista negra</p>
                <p className="text-sm">
                  Adicione contatos que não devem receber disparos
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da Lista Negra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este contato da lista negra? Ele
              voltará a receber disparos normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && removeMutation.mutate(deleteId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
