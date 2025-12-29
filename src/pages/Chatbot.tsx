import { useState, useEffect } from "react";
import { Bot, Plus, Loader2, Search } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ChatbotEditorForm } from "@/components/chatbot/ChatbotEditorForm";
import { ChatbotListItem } from "@/components/chatbot/ChatbotListItem";
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

interface ChatbotAgent {
  id: string;
  name: string;
  nickname: string;
  agent_profile: string;
  is_active: boolean;
  created_at: string;
}

const Chatbot = () => {
  const { user } = useAuth();
  const [view, setView] = useState<"list" | "edit">("list");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [agents, setAgents] = useState<ChatbotAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null);
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (user) {
      loadAgents();
    }
  }, [user]);

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("id, name, nickname, agent_profile, is_active, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAgents(data || []);

      // Load channel counts for each agent
      if (data && data.length > 0) {
        const { data: channelData } = await supabase
          .from("chatbot_config")
          .select("channel_id")
          .not("channel_id", "is", null);
        
        // For now, we'll count channels with chatbot enabled
        // This could be extended to track which agent is assigned to which channel
        const counts: Record<string, number> = {};
        data.forEach(agent => {
          counts[agent.id] = 0; // Will be updated when we implement agent-channel association
        });
        setChannelCounts(counts);
      }
    } catch (error) {
      console.error("Erro ao carregar chatbots:", error);
      toast.error("Erro ao carregar chatbots");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedAgentId(undefined);
    setView("edit");
  };

  const handleEdit = (id: string) => {
    setSelectedAgentId(id);
    setView("edit");
  };

  const handleBack = () => {
    setView("list");
    setSelectedAgentId(undefined);
  };

  const handleSaved = () => {
    loadAgents();
    setView("list");
    setSelectedAgentId(undefined);
  };

  const handleDeleteClick = (id: string) => {
    setAgentToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!agentToDelete) return;

    try {
      const { error } = await supabase
        .from("ai_agents")
        .delete()
        .eq("id", agentToDelete);

      if (error) throw error;

      toast.success("Chatbot excluído com sucesso");
      loadAgents();
    } catch (error) {
      console.error("Erro ao excluir chatbot:", error);
      toast.error("Erro ao excluir chatbot");
    } finally {
      setDeleteDialogOpen(false);
      setAgentToDelete(null);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("ai_agents")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;

      toast.success(isActive ? "Chatbot ativado" : "Chatbot desativado");
      loadAgents();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error("Erro ao atualizar status");
    }
  };

  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (view === "edit") {
    return (
      <MainLayout>
        <ChatbotEditorForm
          agentId={selectedAgentId}
          onBack={handleBack}
          onSaved={handleSaved}
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Chatbots com IA</h1>
            <p className="text-muted-foreground">
              Crie e gerencie seus agentes de atendimento inteligentes
            </p>
          </div>
          <Button onClick={handleCreateNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Chatbot
          </Button>
        </div>

        {/* Search */}
        {agents.length > 0 && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar chatbots..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {/* List */}
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Bot className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Nenhum chatbot criado</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Crie seu primeiro chatbot com IA para automatizar o atendimento no WhatsApp
            </p>
            <Button onClick={handleCreateNew} className="gap-2">
              <Plus className="w-4 h-4" />
              Criar Primeiro Chatbot
            </Button>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum chatbot encontrado para "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredAgents.map((agent) => (
              <ChatbotListItem
                key={agent.id}
                id={agent.id}
                name={agent.name}
                nickname={agent.nickname || ""}
                agentProfile={agent.agent_profile || "outro"}
                isActive={agent.is_active}
                channelCount={channelCounts[agent.id] || 0}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
                onToggleActive={handleToggleActive}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Chatbot</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este chatbot? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Chatbot;
