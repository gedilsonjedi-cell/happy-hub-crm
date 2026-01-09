import { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  Loader2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AppRole = "supervisor" | "atendente";

interface BatchUser {
  name: string;
  email: string;
  role: AppRole;
  status: "pending" | "success" | "error";
  error?: string;
  tempPassword?: string;
}

interface BatchUserImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  onImportComplete: () => void;
}

const generateSecurePassword = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
};

const parseCSV = (text: string): string[][] => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
};

export function BatchUserImport({
  open,
  onOpenChange,
  organizationId,
  onImportComplete,
}: BatchUserImportProps) {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "complete">("upload");
  const [users, setUsers] = useState<BatchUser[]>([]);
  const [defaultRole, setDefaultRole] = useState<AppRole>("atendente");
  const [importProgress, setImportProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const resetState = () => {
    setStep("upload");
    setUsers([]);
    setDefaultRole("atendente");
    setImportProgress(0);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        toast.error("Erro ao ler arquivo");
        return;
      }

      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error("Arquivo vazio");
        return;
      }

      // Check if first row is header
      const firstRow = rows[0];
      const hasHeader = firstRow.some(cell => 
        cell.toLowerCase().includes("nome") || 
        cell.toLowerCase().includes("email") ||
        cell.toLowerCase().includes("name")
      );

      const dataRows = hasHeader ? rows.slice(1) : rows;
      
      const parsedUsers: BatchUser[] = dataRows
        .filter(row => row.length >= 2 && row[0] && row[1])
        .map(row => {
          const name = row[0].trim();
          const email = row[1].trim().toLowerCase();
          const roleFromFile = row[2]?.trim().toLowerCase();
          
          let role: AppRole = defaultRole;
          if (roleFromFile === "supervisor") {
            role = "supervisor";
          } else if (roleFromFile === "atendente") {
            role = "atendente";
          }

          return {
            name,
            email,
            role,
            status: "pending" as const,
          };
        });

      if (parsedUsers.length === 0) {
        toast.error("Nenhum usuário válido encontrado no arquivo");
        return;
      }

      // Validate emails
      const validatedUsers = parsedUsers.map(user => ({
        ...user,
        status: validateEmail(user.email) ? "pending" as const : "error" as const,
        error: validateEmail(user.email) ? undefined : "Email inválido",
      }));

      // Check for duplicates
      const emailCounts = new Map<string, number>();
      validatedUsers.forEach(u => {
        emailCounts.set(u.email, (emailCounts.get(u.email) || 0) + 1);
      });

      const finalUsers = validatedUsers.map(user => {
        if ((emailCounts.get(user.email) || 0) > 1 && user.status !== "error") {
          return { ...user, status: "error" as const, error: "Email duplicado" };
        }
        return user;
      });

      setUsers(finalUsers);
      setStep("preview");
    };

    reader.onerror = () => {
      toast.error("Erro ao ler arquivo");
    };

    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".txt"))) {
      processFile(file);
    } else {
      toast.error("Por favor, envie um arquivo CSV");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const updateUserRole = (index: number, role: AppRole) => {
    setUsers(prev => prev.map((u, i) => i === index ? { ...u, role } : u));
  };

  const removeUser = (index: number) => {
    setUsers(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (!organizationId) {
      toast.error("Organização não identificada");
      return;
    }

    const pendingUsers = users.filter(u => u.status === "pending");
    if (pendingUsers.length === 0) {
      toast.error("Nenhum usuário válido para importar");
      return;
    }

    setStep("importing");
    let completed = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      if (user.status !== "pending") continue;

      try {
        const tempPassword = generateSecurePassword();

        // Create user via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: user.email,
          password: tempPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              display_name: user.name,
            }
          }
        });

        if (authError) {
          throw new Error(authError.message);
        }

        if (!authData.user) {
          throw new Error("Erro ao criar usuário");
        }

        // Create or update profile
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({
            user_id: authData.user.id,
            email: user.email,
            display_name: user.name,
            organization_id: organizationId,
          }, { onConflict: "user_id" });

        if (profileError) {
          console.error("Profile error:", profileError);
        }

        // Assign role
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: authData.user.id,
            role: user.role,
          });

        if (roleError) {
          console.error("Role error:", roleError);
        }

        setUsers(prev => prev.map((u, idx) => 
          idx === i ? { ...u, status: "success", tempPassword } : u
        ));
      } catch (error: any) {
        const errorMessage = error.message?.includes("already registered") 
          ? "Email já cadastrado" 
          : error.message || "Erro desconhecido";
          
        setUsers(prev => prev.map((u, idx) => 
          idx === i ? { ...u, status: "error", error: errorMessage } : u
        ));
      }

      completed++;
      setImportProgress((completed / pendingUsers.length) * 100);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setStep("complete");
    onImportComplete();
  };

  const downloadTemplate = () => {
    const template = "Nome,Email,Função\nJoão Silva,joao@empresa.com,atendente\nMaria Santos,maria@empresa.com,supervisor";
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo_usuarios.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadResults = () => {
    const headers = "Nome,Email,Função,Status,Senha Temporária\n";
    const rows = users.map(u => 
      `"${u.name}","${u.email}","${u.role}","${u.status === 'success' ? 'Criado' : u.error || 'Erro'}","${u.tempPassword || ''}"`
    ).join("\n");
    
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `usuarios_importados_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const successCount = users.filter(u => u.status === "success").length;
  const errorCount = users.filter(u => u.status === "error").length;
  const pendingCount = users.filter(u => u.status === "pending").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Importar Usuários em Lote
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Faça upload de um arquivo CSV com os dados dos usuários"}
            {step === "preview" && "Revise os usuários antes de importar"}
            {step === "importing" && "Importando usuários..."}
            {step === "complete" && "Importação concluída"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {step === "upload" && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-foreground font-medium mb-2">
                  Arraste um arquivo CSV aqui
                </p>
                <p className="text-muted-foreground text-sm mb-4">
                  ou clique para selecionar
                </p>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="batch-file-input"
                />
                <Button asChild variant="outline">
                  <label htmlFor="batch-file-input" className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Selecionar Arquivo
                  </label>
                </Button>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Formato esperado:</strong> CSV com colunas Nome, Email, Função (opcional).
                  <br />
                  Funções aceitas: <Badge variant="outline" className="mx-1">atendente</Badge> 
                  <Badge variant="outline" className="mx-1">supervisor</Badge>
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Função padrão:</span>
                  <Select value={defaultRole} onValueChange={(v) => setDefaultRole(v as AppRole)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="atendente">Atendente</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Modelo
                </Button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  Total: <strong>{users.length}</strong>
                </span>
                {pendingCount > 0 && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
                    {pendingCount} prontos
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive">
                    {errorCount} com erro
                  </Badge>
                )}
              </div>

              <ScrollArea className="h-[350px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user, index) => (
                      <TableRow key={index} className={user.status === "error" ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Select 
                            value={user.role} 
                            onValueChange={(v) => updateUserRole(index, v as AppRole)}
                            disabled={user.status === "error"}
                          >
                            <SelectTrigger className="w-[120px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="atendente">Atendente</SelectItem>
                              <SelectItem value="supervisor">Supervisor</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {user.status === "pending" && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
                              Pronto
                            </Badge>
                          )}
                          {user.status === "error" && (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive">
                              {user.error}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => removeUser(index)}
                          >
                            <XCircle className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {step === "importing" && (
            <div className="py-8 space-y-6">
              <div className="flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importando usuários...</span>
                  <span>{Math.round(importProgress)}%</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
              <p className="text-center text-muted-foreground text-sm">
                Por favor, não feche esta janela
              </p>
            </div>
          )}

          {step === "complete" && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4 py-4">
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">{successCount} criados</span>
                </div>
                {errorCount > 0 && (
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">{errorCount} com erro</span>
                  </div>
                )}
              </div>

              <Alert className="bg-amber-500/10 border-amber-500/30">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-amber-600">
                  <strong>Importante:</strong> Baixe o relatório com as senhas temporárias. 
                  Os usuários receberão um email de confirmação e deverão redefinir a senha no primeiro acesso.
                </AlertDescription>
              </Alert>

              <ScrollArea className="h-[250px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Senha Temporária</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          {user.status === "success" ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Criado
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="w-3 h-3 mr-1" />
                              {user.error}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {user.tempPassword || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}
          
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Voltar
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={pendingCount === 0}
              >
                Importar {pendingCount} Usuário{pendingCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          
          {step === "complete" && (
            <>
              <Button variant="outline" onClick={downloadResults}>
                <Download className="w-4 h-4 mr-2" />
                Baixar Relatório
              </Button>
              <Button onClick={handleClose}>
                Concluir
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
