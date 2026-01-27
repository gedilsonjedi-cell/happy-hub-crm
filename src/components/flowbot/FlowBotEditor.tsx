import { useState, useRef, useCallback, useEffect } from "react";
import { 
  Plus, 
  Save, 
  ArrowLeft, 
  MessageSquare, 
  LayoutGrid, 
  FormInput, 
  Zap,
  Trash2,
  GripVertical,
  Settings,
  Loader2,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { 
  FlowBot, 
  FlowNode, 
  FlowEdge, 
  CanvasNode, 
  NodeType,
  MessageNodeData,
  ButtonsNodeData,
  CollectDataNodeData,
  ActionNodeData,
  ButtonOption,
  ActionType
} from "./types";
import { StartNode } from "./nodes/StartNode";
import { MessageNode } from "./nodes/MessageNode";
import { ButtonsNode } from "./nodes/ButtonsNode";
import { CollectDataNode } from "./nodes/CollectDataNode";
import { ActionNode } from "./nodes/ActionNode";

interface FlowBotEditorProps {
  flowBotId?: string;
  onBack: () => void;
  onSaved: () => void;
}

const nodeTypes: { type: NodeType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: "message", label: "Mensagem", icon: <MessageSquare className="w-4 h-4" />, color: "text-blue-500" },
  { type: "buttons", label: "Botões", icon: <LayoutGrid className="w-4 h-4" />, color: "text-purple-500" },
  { type: "collect_data", label: "Coletar Dados", icon: <FormInput className="w-4 h-4" />, color: "text-green-500" },
  { type: "action", label: "Ação", icon: <Zap className="w-4 h-4" />, color: "text-orange-500" },
];

export function FlowBotEditor({ flowBotId, onBack, onSaved }: FlowBotEditorProps) {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  
  const [isLoading, setIsLoading] = useState(!!flowBotId);
  const [isSaving, setIsSaving] = useState(false);
  
  // Bot config
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiMessage, setAiMessage] = useState("Deixa eu te ajudar com isso!");
  const [transferMessage, setTransferMessage] = useState("Vou transferir você para um de nossos atendentes. Aguarde um momento.");
  
  // Canvas state
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<{ id: string; source: string; target: string; sourceHandle?: string }[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showNodeEditor, setShowNodeEditor] = useState(false);
  
  // Dragging state
  const [draggedNodeType, setDraggedNodeType] = useState<NodeType | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (flowBotId) {
      loadFlowBot();
    } else {
      // Create default start node
      setNodes([{
        id: `node_${Date.now()}`,
        type: "start",
        position: { x: 100, y: 100 },
        data: { label: "Início" }
      }]);
      setIsLoading(false);
    }
  }, [flowBotId]);

  const loadFlowBot = async () => {
    if (!flowBotId) return;
    
    try {
      // Load bot
      const { data: bot, error: botError } = await supabase
        .from("flow_bots")
        .select("*")
        .eq("id", flowBotId)
        .single();
      
      if (botError) throw botError;
      
      setName(bot.name);
      setDescription(bot.description || "");
      setAiEnabled(bot.ai_fallback_enabled);
      setAiMessage(bot.ai_fallback_message);
      setTransferMessage(bot.transfer_message);
      
      // Load nodes
      const { data: dbNodes, error: nodesError } = await supabase
        .from("flow_nodes")
        .select("*")
        .eq("flow_bot_id", flowBotId);
      
      if (nodesError) throw nodesError;
      
      const canvasNodes: CanvasNode[] = (dbNodes || []).map(n => ({
        id: n.id,
        type: n.node_type as NodeType,
        position: { x: Number(n.position_x), y: Number(n.position_y) },
        data: n.data as any
      }));
      
      // Ensure start node exists
      if (!canvasNodes.some(n => n.type === "start")) {
        canvasNodes.unshift({
          id: `node_${Date.now()}`,
          type: "start",
          position: { x: 100, y: 100 },
          data: { label: "Início" }
        });
      }
      
      setNodes(canvasNodes);
      
      // Load edges
      const { data: dbEdges, error: edgesError } = await supabase
        .from("flow_edges")
        .select("*")
        .eq("flow_bot_id", flowBotId);
      
      if (edgesError) throw edgesError;
      
      setEdges((dbEdges || []).map(e => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        sourceHandle: e.source_handle || undefined
      })));
      
    } catch (error) {
      console.error("Error loading flow bot:", error);
      toast.error("Erro ao carregar fluxo");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !effectiveOrganizationId) return;
    if (!name.trim()) {
      toast.error("Nome do fluxo é obrigatório");
      return;
    }
    
    setIsSaving(true);
    
    try {
      let botId = flowBotId;
      
      // Save or create bot
      if (flowBotId) {
        const { error } = await supabase
          .from("flow_bots")
          .update({
            name,
            description,
            ai_fallback_enabled: aiEnabled,
            ai_fallback_message: aiMessage,
            transfer_message: transferMessage
          } as any)
          .eq("id", flowBotId);
        
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("flow_bots")
          .insert({
            organization_id: effectiveOrganizationId,
            user_id: user.id,
            name,
            description,
            ai_fallback_enabled: aiEnabled,
            ai_fallback_message: aiMessage,
            transfer_message: transferMessage
          } as any)
          .select()
          .single();
        
        if (error) throw error;
        botId = data.id;
      }
      
      // Delete existing nodes and edges
      await supabase.from("flow_edges").delete().eq("flow_bot_id", botId);
      await supabase.from("flow_nodes").delete().eq("flow_bot_id", botId);
      
      // Create nodes
      const nodeIdMap: Record<string, string> = {};
      
      for (const node of nodes) {
        const { data, error } = await supabase
          .from("flow_nodes")
          .insert({
            flow_bot_id: botId!,
            node_type: node.type,
            position_x: node.position.x,
            position_y: node.position.y,
            data: node.data as any
          } as any)
          .select()
          .single();
        
        if (error) throw error;
        nodeIdMap[node.id] = data.id;
      }
      
      // Create edges with mapped IDs
      for (const edge of edges) {
        const sourceId = nodeIdMap[edge.source];
        const targetId = nodeIdMap[edge.target];
        
        if (sourceId && targetId) {
          await supabase
            .from("flow_edges")
            .insert({
              flow_bot_id: botId!,
              source_node_id: sourceId,
              target_node_id: targetId,
              source_handle: edge.sourceHandle
            } as any);
        }
      }
      
      toast.success("Fluxo salvo com sucesso!");
      onSaved();
    } catch (error) {
      console.error("Error saving flow bot:", error);
      toast.error("Erro ao salvar fluxo");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedNodeType || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newNode: CanvasNode = {
      id: `node_${Date.now()}`,
      type: draggedNodeType,
      position: { x, y },
      data: getDefaultNodeData(draggedNodeType)
    };
    
    setNodes(prev => [...prev, newNode]);
    setDraggedNodeType(null);
    setSelectedNodeId(newNode.id);
    setShowNodeEditor(true);
  };

  const getDefaultNodeData = (type: NodeType) => {
    switch (type) {
      case "start":
        return { label: "Início" };
      case "message":
        return { label: "Nova Mensagem", message: "" };
      case "buttons":
        return { label: "Botões", message: "", buttons: [] };
      case "collect_data":
        return { label: "Coletar Dados", message: "", variable_name: "", variable_type: "text" };
      case "action":
        return { label: "Ação", action_type: "transfer" as ActionType, transfer_message: transferMessage };
      default:
        return { label: "" };
    }
  };

  const handleNodeClick = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.type !== "start") {
      setSelectedNodeId(nodeId);
      setShowNodeEditor(true);
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
    setShowNodeEditor(false);
    setSelectedNodeId(null);
  };

  const updateNodeData = (nodeId: string, data: any) => {
    setNodes(prev => prev.map(n => 
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    ));
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nome do fluxo"
            className="w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <Label className="text-sm">IA Fallback</Label>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Node Palette */}
        <div className="w-56 border-r border-border bg-muted/30 p-4">
          <h3 className="text-sm font-medium mb-3">Blocos</h3>
          <div className="space-y-2">
            {nodeTypes.map(nt => (
              <div
                key={nt.type}
                draggable
                onDragStart={() => setDraggedNodeType(nt.type)}
                onDragEnd={() => setDraggedNodeType(null)}
                className="flex items-center gap-2 p-3 bg-card border border-border rounded-lg cursor-grab hover:border-primary/50 transition-colors"
              >
                <span className={nt.color}>{nt.icon}</span>
                <span className="text-sm">{nt.label}</span>
              </div>
            ))}
          </div>
          
          <Separator className="my-4" />
          
          <h3 className="text-sm font-medium mb-3">Configurações</h3>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descrição do fluxo..."
                className="text-sm h-20 resize-none"
              />
            </div>
            {aiEnabled && (
              <div className="space-y-2">
                <Label className="text-xs">Mensagem IA</Label>
                <Textarea
                  value={aiMessage}
                  onChange={e => setAiMessage(e.target.value)}
                  placeholder="Mensagem quando IA responder..."
                  className="text-sm h-16 resize-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div 
          ref={canvasRef}
          className="flex-1 bg-muted/10 relative overflow-auto"
          onDragOver={e => e.preventDefault()}
          onDrop={handleCanvasDrop}
          style={{ 
            backgroundImage: 'radial-gradient(circle, hsl(var(--muted)) 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
        >
          {nodes.map(node => (
            <div
              key={node.id}
              className="absolute cursor-pointer"
              style={{ left: node.position.x, top: node.position.y }}
              onClick={() => handleNodeClick(node.id)}
            >
              {node.type === "start" && <StartNode selected={selectedNodeId === node.id} />}
              {node.type === "message" && <MessageNode data={node.data as MessageNodeData} selected={selectedNodeId === node.id} />}
              {node.type === "buttons" && <ButtonsNode data={node.data as ButtonsNodeData} selected={selectedNodeId === node.id} />}
              {node.type === "collect_data" && <CollectDataNode data={node.data as CollectDataNodeData} selected={selectedNodeId === node.id} />}
              {node.type === "action" && <ActionNode data={node.data as ActionNodeData} selected={selectedNodeId === node.id} />}
            </div>
          ))}
          
          {nodes.length === 1 && nodes[0].type === "start" && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-muted-foreground">
              <p className="text-lg font-medium">Arraste os blocos para criar seu fluxo</p>
              <p className="text-sm">Clique nos blocos para configurá-los</p>
            </div>
          )}
        </div>
      </div>

      {/* Node Editor Sheet */}
      <Sheet open={showNodeEditor} onOpenChange={setShowNodeEditor}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Configurar Bloco</SheetTitle>
          </SheetHeader>
          
          {selectedNode && (
            <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
              <div className="space-y-4 pr-4">
                <div className="space-y-2">
                  <Label>Nome do bloco</Label>
                  <Input
                    value={(selectedNode.data as any).label || ""}
                    onChange={e => updateNodeData(selectedNode.id, { label: e.target.value })}
                    placeholder="Nome identificador"
                  />
                </div>

                {/* Message Node */}
                {selectedNode.type === "message" && (
                  <div className="space-y-2">
                    <Label>Mensagem</Label>
                    <Textarea
                      value={(selectedNode.data as MessageNodeData).message || ""}
                      onChange={e => updateNodeData(selectedNode.id, { message: e.target.value })}
                      placeholder="Digite a mensagem..."
                      rows={5}
                    />
                  </div>
                )}

                {/* Buttons Node */}
                {selectedNode.type === "buttons" && (
                  <>
                    <div className="space-y-2">
                      <Label>Mensagem</Label>
                      <Textarea
                        value={(selectedNode.data as ButtonsNodeData).message || ""}
                        onChange={e => updateNodeData(selectedNode.id, { message: e.target.value })}
                        placeholder="Mensagem com opções..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Botões (máx. 3)</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const buttons = (selectedNode.data as ButtonsNodeData).buttons || [];
                            if (buttons.length < 3) {
                              updateNodeData(selectedNode.id, {
                                buttons: [...buttons, { id: `btn_${Date.now()}`, label: "", value: "" }]
                              });
                            }
                          }}
                          disabled={((selectedNode.data as ButtonsNodeData).buttons || []).length >= 3}
                          className="gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Adicionar
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {((selectedNode.data as ButtonsNodeData).buttons || []).map((btn, i) => (
                          <div key={btn.id} className="flex gap-2">
                            <Input
                              value={btn.label}
                              onChange={e => {
                                const buttons = [...(selectedNode.data as ButtonsNodeData).buttons];
                                buttons[i] = { ...buttons[i], label: e.target.value, value: e.target.value };
                                updateNodeData(selectedNode.id, { buttons });
                              }}
                              placeholder={`Opção ${i + 1}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const buttons = (selectedNode.data as ButtonsNodeData).buttons.filter((_, idx) => idx !== i);
                                updateNodeData(selectedNode.id, { buttons });
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Collect Data Node */}
                {selectedNode.type === "collect_data" && (
                  <>
                    <div className="space-y-2">
                      <Label>Pergunta</Label>
                      <Textarea
                        value={(selectedNode.data as CollectDataNodeData).message || ""}
                        onChange={e => updateNodeData(selectedNode.id, { message: e.target.value })}
                        placeholder="Qual seu nome?"
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome da variável</Label>
                        <Input
                          value={(selectedNode.data as CollectDataNodeData).variable_name || ""}
                          onChange={e => updateNodeData(selectedNode.id, { variable_name: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                          placeholder="nome"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                          value={(selectedNode.data as CollectDataNodeData).variable_type || "text"}
                          onValueChange={v => updateNodeData(selectedNode.id, { variable_type: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="email">E-mail</SelectItem>
                            <SelectItem value="phone">Telefone</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Mensagem de erro (opcional)</Label>
                      <Input
                        value={(selectedNode.data as CollectDataNodeData).validation_message || ""}
                        onChange={e => updateNodeData(selectedNode.id, { validation_message: e.target.value })}
                        placeholder="Por favor, informe um valor válido."
                      />
                    </div>
                  </>
                )}

                {/* Action Node */}
                {selectedNode.type === "action" && (
                  <>
                    <div className="space-y-2">
                      <Label>Tipo de ação</Label>
                      <Select
                        value={(selectedNode.data as ActionNodeData).action_type || "transfer"}
                        onValueChange={v => updateNodeData(selectedNode.id, { action_type: v as ActionType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transfer">Transferir para Atendente</SelectItem>
                          <SelectItem value="move_pipeline">Mover no Pipeline</SelectItem>
                          <SelectItem value="webhook">Enviar Webhook</SelectItem>
                          <SelectItem value="end">Encerrar Fluxo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {(selectedNode.data as ActionNodeData).action_type === "transfer" && (
                      <div className="space-y-2">
                        <Label>Mensagem de transferência</Label>
                        <Textarea
                          value={(selectedNode.data as ActionNodeData).transfer_message || transferMessage}
                          onChange={e => updateNodeData(selectedNode.id, { transfer_message: e.target.value })}
                          rows={2}
                        />
                      </div>
                    )}
                    
                    {(selectedNode.data as ActionNodeData).action_type === "webhook" && (
                      <div className="space-y-2">
                        <Label>URL do Webhook</Label>
                        <Input
                          value={(selectedNode.data as ActionNodeData).webhook_url || ""}
                          onChange={e => updateNodeData(selectedNode.id, { webhook_url: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                    )}
                  </>
                )}

                <Separator />
                
                <Button 
                  variant="destructive" 
                  className="w-full gap-2"
                  onClick={() => handleDeleteNode(selectedNode.id)}
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir Bloco
                </Button>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
