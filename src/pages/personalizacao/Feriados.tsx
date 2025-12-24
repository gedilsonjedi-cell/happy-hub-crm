import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Feriados() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState({
    name: "",
    date: "",
    is_recurring: false,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: holidays, isLoading } = useQuery({
    queryKey: ["holidays", profile?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("holidays")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("date");
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });

  const addMutation = useMutation({
    mutationFn: async (holiday: typeof newHoliday) => {
      const { error } = await supabase.from("holidays").insert({
        organization_id: profile!.organization_id,
        name: holiday.name,
        date: holiday.date,
        is_recurring: holiday.is_recurring,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      setDialogOpen(false);
      setNewHoliday({ name: "", date: "", is_recurring: false });
      toast.success("Feriado adicionado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao adicionar feriado");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Feriado removido com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao remover feriado");
    },
  });

  const handleAdd = () => {
    if (!newHoliday.name || !newHoliday.date) {
      toast.error("Preencha todos os campos");
      return;
    }
    addMutation.mutate(newHoliday);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Feriados</h1>
            <p className="text-muted-foreground">Gerencie os feriados e dias de folga</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Feriado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Feriado</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Nome do Feriado</Label>
                  <Input
                    value={newHoliday.name}
                    onChange={(e) =>
                      setNewHoliday((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Ex: Natal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={newHoliday.date}
                    onChange={(e) =>
                      setNewHoliday((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newHoliday.is_recurring}
                    onCheckedChange={(checked) =>
                      setNewHoliday((prev) => ({ ...prev, is_recurring: checked }))
                    }
                  />
                  <Label>Repetir todo ano</Label>
                </div>
                <Button onClick={handleAdd} disabled={addMutation.isPending} className="w-full">
                  Adicionar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Lista de Feriados
            </CardTitle>
            <CardDescription>
              Feriados configurados para envio de mensagem de ausência
            </CardDescription>
          </CardHeader>
          <CardContent>
            {holidays && holidays.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Recorrente</TableHead>
                    <TableHead className="w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((holiday) => (
                    <TableRow key={holiday.id}>
                      <TableCell className="font-medium">{holiday.name}</TableCell>
                      <TableCell>
                        {format(new Date(holiday.date + "T12:00:00"), "dd 'de' MMMM", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>{holiday.is_recurring ? "Sim" : "Não"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(holiday.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum feriado cadastrado
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
