import { useState } from "react";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, Plus, Trash2, Search, UserX } from "lucide-react";

interface BlacklistEntry {
  id: string;
  organization_id: string;
  phone: string;
  name: string | null;
  reason: string | null;
  blocked_by: string | null;
  created_at: string;
}

export default function ListaNegra() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [newEntry, setNewEntry] = useState({
    phone: "",
    name: "",
    reason: "",
  });

  // Get user's organization
  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Get blacklist entries
  const { data: blacklist, isLoading } = useQuery({
    queryKey: ["blacklist", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("blacklist")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BlacklistEntry[];
    },
    enabled: !!profile?.organization_id,
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
