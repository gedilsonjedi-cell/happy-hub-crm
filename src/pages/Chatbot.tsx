import { useState, useEffect } from "react";
import { GitBranch, Plus, Loader2, Search, Bot, Sparkles, Send } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { ChatbotEditorForm } from "@/components/chatbot/ChatbotEditorForm";
import { ChatbotListItem } from "@/components/chatbot/ChatbotListItem";
import { ChatbotChannelAssignment } from "@/components/chatbot/ChatbotChannelAssignment";
import { FlowBotListItem } from "@/components/flowbot/FlowBotListItem";
import { FlowBotEditor } from "@/components/flowbot/FlowBotEditor";
import { FlowBot } from "@/components/flowbot/types";
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
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  
  const [activeTab, setActiveTab] = useState<"ai" | "flow" | "dispatch">("ai");
  const [view, setView] = useState<"list" | "edit">("list");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [selectedFlowBotId, setSelectedFlowBotId] = useState<string | undefined>();
  
  // AI Agents state
  const [agents, setAgents] = useState<ChatbotAgent[]>([]);
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({});
  
  // Flow Bots state
  const [flowBots, setFlowBots] = useState<FlowBot[]>([]);
  const [flowNodeCounts, setFlowNodeCounts] = useState<Record<string, number>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: "ai" | "flow" | "dispatch" } | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  useEffect(() => {
    if (user && effectiveOrganizationId) {
      loadData();
    }
  }, [user, effectiveOrganizationId, activeTab]);

  const loadData = async () => {
    if (!effectiveOrganizationId) return;
    setIsLoading(true);
    
    try {
      if (activeTab === "ai") {
        await loadAgents();
      } else {
        await loadFlowBots();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadAgents = async () => {
    const { data, error } = await supabase
      .from("ai_agents")
      .select("id, name, nickname, agent_profile, is_active, created_at")
      .eq("organization_id", effectiveOrganizationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar chatbots:", error);
      toast.error("Erro ao carregar chatbots");
      return;
    }
    
    setAgents(data || []);

    // Load channel counts
    if (data && data.length > 0) {
      const { data: configData } = await supabase
        .from("chatbot_config")
        .select("agent_id")
        .not("agent_id", "is", null);
      
      const counts: Record<string, number> = {};
      data.forEach(agent => { counts[agent.id] = 0; });
      
      if (configData) {
        configData.forEach((config: { agent_id: string | null }) => {
          if (config.agent_id && counts[config.agent_id] !== undefined) {
            counts[config.agent_id]++;
          }
        });
      }
      
      setChannelCounts(counts);
    }
  };

  const loadFlowBots = async () => {
    const { data, error } = await supabase
      .from("flow_bots")
      .select("*")
      .eq("organization_id", effectiveOrganizationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar fluxos:", error);
      toast.error("Erro ao carregar fluxos");
      return;
    }
    
    setFlowBots((data || []) as FlowBot[]);

    // Load node counts
    if (data && data.length > 0) {
      const { data: nodeData } = await supabase
        .from("flow_nodes")
        .select("flow_bot_id")
        .in("flow_bot_id", data.map(b => b.id));
      
      const counts: Record<string, number> = {};
      data.forEach(bot => { counts[bot.id] = 0; });
      
      if (nodeData) {
        nodeData.forEach((node: { flow_bot_id: string }) => {
          if (counts[node.flow_bot_id] !== undefined) {
            counts[node.flow_bot_id]++;
          }
        });
      }
      
      setFlowNodeCounts(counts);
    }
  };

  const handleCreateNew = () => {
    if (activeTab === "ai") {
      setSelectedAgentId(undefined);
    } else {
      setSelectedFlowBotId(undefined);
    }
    setView("edit");
  };

  const handleEditAgent = (id: string) => {
    setSelectedAgentId(id);
    setView("edit");
  };

  const handleEditFlowBot = (id: string) => {
    setSelectedFlowBotId(id);
    setView("edit");
  };

  const handleBack = () => {
    setView("list");
    setSelectedAgentId(undefined);
    setSelectedFlowBotId(undefined);
  };

  const handleSaved = () => {
    loadData();
    setView("list");
    setSelectedAgentId(undefined);
    setSelectedFlowBotId(undefined);
  };

  const handleDeleteClick = (id: string, type: "ai" | "flow") => {
    setItemToDelete({ id, type });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === "ai") {
        const { error } = await supabase
          .from("ai_agents")
          .delete()
          .eq("id", itemToDelete.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("flow_bots")
          .delete()
          .eq("id", itemToDelete.id);
        if (error) throw error;
      }

      toast.success(itemToDelete.type === "ai" ? "Chatbot excluído" : "Fluxo excluído");
      loadData();
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir");
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const handleToggleActiveAgent = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("ai_agents")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
      toast.success(isActive ? "Chatbot ativado" : "Chatbot desativado");
      loadData();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error("Erro ao atualizar status");
    }
  };

  const handleToggleActiveFlowBot = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("flow_bots")
        .update({ is_active: isActive } as any)
        .eq("id", id);
      if (error) throw error;
      toast.success(isActive ? "Fluxo ativado" : "Fluxo desativado");
      loadData();
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

  const filteredFlowBots = flowBots.filter(
    (bot) =>
      bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bot.description || "").toLowerCase().includes(searchQuery.toLowerCase())
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

  // Edit views
  if (view === "edit") {
    if (activeTab === "ai") {
      return (
        <MainLayout>
          <ChatbotEditorForm
            agentId={selectedAgentId}
            onBack={handleBack}
            onSaved={handleSaved}
          />
        </MainLayout>
      );
    } else {
      return (
        <MainLayout>
          <FlowBotEditor
            flowBotId={selectedFlowBotId}
            onBack={handleBack}
            onSaved={handleSaved}
          />
        </MainLayout>
      );
    }
  }

  const hasItems = activeTab === "ai" ? agents.length > 0 : flowBots.length > 0;
  const filteredItems = activeTab === "ai" ? filteredAgents : filteredFlowBots;

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Chatbots</h1>
            <p className="text-muted-foreground">
              Crie chatbots com IA ou fluxos visuais para automação
            </p>
          </div>
          <div className="flex gap-2">
            {hasItems && activeTab === "ai" && (
              <Button variant="outline" onClick={() => setAssignDialogOpen(true)} className="gap-2">
                Vincular a Canal
              </Button>
            )}
            <Button onClick={handleCreateNew} className="gap-2">
              <Plus className="w-4 h-4" />
              {activeTab === "ai" ? "Novo Chatbot IA" : "Novo Fluxo"}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "ai" | "flow")}>
          <TabsList>
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="w-4 h-4" />
              Chatbots com IA
            </TabsTrigger>
            <TabsTrigger value="flow" className="gap-2">
              <GitBranch className="w-4 h-4" />
              Fluxos Visuais
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        {hasItems && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={activeTab === "ai" ? "Buscar chatbots..." : "Buscar fluxos..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {/* List */}
        {!hasItems ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              {activeTab === "ai" ? (
                <Bot className="w-10 h-10 text-primary" />
              ) : (
                <GitBranch className="w-10 h-10 text-primary" />
              )}
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {activeTab === "ai" ? "Nenhum chatbot IA criado" : "Nenhum fluxo criado"}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              {activeTab === "ai" 
                ? "Crie seu primeiro chatbot com IA para atendimento inteligente"
                : "Crie um fluxo visual com mensagens e botões pré-definidos"}
            </p>
            <Button onClick={handleCreateNew} className="gap-2">
              <Plus className="w-4 h-4" />
              {activeTab === "ai" ? "Criar Chatbot IA" : "Criar Fluxo Visual"}
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum resultado para "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {activeTab === "ai" ? (
              filteredAgents.map((agent) => (
                <ChatbotListItem
                  key={agent.id}
                  id={agent.id}
                  name={agent.name}
                  nickname={agent.nickname || ""}
                  agentProfile={agent.agent_profile || "outro"}
                  isActive={agent.is_active}
                  channelCount={channelCounts[agent.id] || 0}
                  onEdit={handleEditAgent}
                  onDelete={(id) => handleDeleteClick(id, "ai")}
                  onToggleActive={handleToggleActiveAgent}
                />
              ))
            ) : (
              filteredFlowBots.map((bot) => (
                <FlowBotListItem
                  key={bot.id}
                  bot={bot}
                  nodeCount={flowNodeCounts[bot.id] || 0}
                  onEdit={handleEditFlowBot}
                  onDelete={(id) => handleDeleteClick(id, "flow")}
                  onToggleActive={handleToggleActiveFlowBot}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {itemToDelete?.type === "ai" ? "Excluir Chatbot" : "Excluir Fluxo"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir? Esta ação não pode ser desfeita.
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

      {/* Channel Assignment Dialog */}
      <ChatbotChannelAssignment
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        onAssigned={loadData}
      />
    </MainLayout>
  );
};

export default Chatbot;
