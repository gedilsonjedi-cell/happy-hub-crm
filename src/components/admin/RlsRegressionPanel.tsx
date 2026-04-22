import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, ShieldCheck, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

interface CheckRow {
  check_name: string;
  expected: string;
  result: string;
  passed: boolean;
  details: string;
}

interface UserOption {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  organization_id: string | null;
  organization_name: string | null;
}

export function RlsRegressionPanel() {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, CheckRow[]>>({});

  const handleSearch = async () => {
    if (!search.trim()) {
      toast.error("Digite parte do email do usuário");
      return;
    }
    setSearching(true);
    try {
      const term = `%${search.trim()}%`;
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, organization_id, organizations(name)")
        .ilike("email", term)
        .limit(20);

      if (error) throw error;

      const userIds = (profiles ?? []).map((p) => p.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as string]));

      setUsers(
        (profiles ?? []).map((p) => ({
          user_id: p.user_id,
          email: p.email,
          display_name: p.display_name,
          role: roleMap.get(p.user_id) ?? null,
          organization_id: p.organization_id,
          organization_name: (p.organizations as { name?: string } | null)?.name ?? null,
        }))
      );

      if ((profiles ?? []).length === 0) {
        toast.info("Nenhum usuário encontrado");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao buscar usuários");
    } finally {
      setSearching(false);
    }
  };

  const handleRun = async (userId: string) => {
    setRunning(userId);
    try {
      const { data, error } = await supabase.rpc("run_rls_visibility_check", {
        _user_id: userId,
      });
      if (error) throw error;
      setResults((prev) => ({ ...prev, [userId]: (data ?? []) as CheckRow[] }));
      const passed = ((data ?? []) as CheckRow[]).every((r) => r.passed);
      if (passed) {
        toast.success("Todos os testes de RLS passaram");
      } else {
        toast.warning("Alguns testes de RLS falharam — revise abaixo");
      }
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao rodar teste: ${(err as Error).message}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Testes de regressão de RLS
        </CardTitle>
        <CardDescription>
          Verifica que um usuário (ex.: atendente) consegue listar canais e conversas pendentes/ativas
          da própria organização e que tokens sensíveis estão bloqueados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="rls-user-search">Buscar usuário por email</Label>
            <Input
              id="rls-user-search"
              placeholder="email@exemplo.com"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-2">Buscar</span>
          </Button>
        </div>

        {users.length > 0 && (
          <div className="space-y-3">
            {users.map((u) => {
              const userResults = results[u.user_id];
              const allPassed = userResults && userResults.every((r) => r.passed);
              return (
                <div key={u.user_id} className="border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{u.display_name || u.email}</span>
                        {u.role && <Badge variant="secondary">{u.role}</Badge>}
                        {u.organization_name && (
                          <Badge variant="outline">{u.organization_name}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {userResults && (
                        allPassed ? (
                          <Badge className="bg-success text-success-foreground">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="w-3 h-3 mr-1" />
                            Falhou
                          </Badge>
                        )
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleRun(u.user_id)}
                        disabled={running === u.user_id}
                      >
                        {running === u.user_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Rodar testes"
                        )}
                      </Button>
                    </div>
                  </div>

                  {userResults && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Verificação</TableHead>
                          <TableHead>Esperado</TableHead>
                          <TableHead>Resultado</TableHead>
                          <TableHead className="w-24 text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userResults.map((r) => (
                          <TableRow key={r.check_name}>
                            <TableCell className="font-mono text-xs">{r.check_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.expected}
                            </TableCell>
                            <TableCell className="text-xs">{r.result}</TableCell>
                            <TableCell className="text-right">
                              {r.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-success inline-block" />
                              ) : (
                                <XCircle className="w-4 h-4 text-destructive inline-block" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
