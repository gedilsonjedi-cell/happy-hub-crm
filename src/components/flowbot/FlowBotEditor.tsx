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
  Copy,
  Check,
  Loader2,
  Sparkles,
  Wand2,
  ZoomIn,
  ZoomOut,
  Maximize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { 
  CanvasNode, 
  NodeType,
  MessageNodeData,
  ButtonsNodeData,
  CollectDataNodeData,
  ActionNodeData,
  ActionType
} from "./types";
import { StartNode } from "./nodes/StartNode";
import { MessageNode } from "./nodes/MessageNode";
import { ButtonsNode } from "./nodes/ButtonsNode";
import { CollectDataNode } from "./nodes/CollectDataNode";
import { ActionNode } from "./nodes/ActionNode";
import { EdgeRenderer } from "./EdgeRenderer";
import { sampleFlows } from "./sampleFlows";

interface FlowBotEditorProps {
  flowBotId?: string;
  onBack: () => void;
  onSaved: () => void;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
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
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showNodeEditor, setShowNodeEditor] = useState(false);
  
  // Dragging state
  const [draggedNodeType, setDraggedNodeType] = useState<NodeType | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Connection state
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; handle?: string } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  // Pan and Zoom state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

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
    // Adjust for pan offset and zoom
    const x = (e.clientX - rect.left - panOffset.x) / zoom;
    const y = (e.clientY - rect.top - panOffset.y) / zoom;
    
    const nodeId = `node_${Date.now()}`;
    const newNode: CanvasNode = {
      id: nodeId,
      type: draggedNodeType,
      position: { x, y },
      data: getDefaultNodeData(draggedNodeType)
    };
    
    // Add node first, then update selection and open editor
    setNodes(prev => {
      const updatedNodes = [...prev, newNode];
      console.log("Node added:", nodeId, "Total nodes:", updatedNodes.length);
      return updatedNodes;
    });
    setDraggedNodeType(null);
    
    // Use setTimeout to ensure state is updated before selecting
    setTimeout(() => {
      setSelectedNodeId(nodeId);
      setShowNodeEditor(true);
    }, 0);
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
    // Don't open editor if we're connecting
    if (connectingFrom) return;
    
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

  const handleDuplicateNode = (nodeId: string) => {
    const nodeToDuplicate = nodes.find(n => n.id === nodeId);
    if (!nodeToDuplicate || nodeToDuplicate.type === "start") return;

    const newNodeId = `node_${Date.now()}`;
    const newNode: CanvasNode = {
      ...nodeToDuplicate,
      id: newNodeId,
      position: {
        x: nodeToDuplicate.position.x + 50,
        y: nodeToDuplicate.position.y + 50
      },
      data: {
        ...nodeToDuplicate.data,
        label: `${(nodeToDuplicate.data as any).label || ""} (cópia)`
      }
    };

    // For buttons node, generate new button IDs
    if (newNode.type === "buttons" && (newNode.data as ButtonsNodeData).buttons) {
      (newNode.data as ButtonsNodeData).buttons = (newNode.data as ButtonsNodeData).buttons.map(btn => ({
        ...btn,
        id: `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }));
    }

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNodeId);
    toast.success("Bloco duplicado!");
  };

  const handleDeleteEdge = (edgeId: string) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  };

  const updateNodeData = (nodeId: string, data: any) => {
    setNodes(prev => prev.map(n => 
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    ));
  };

  // Connection handlers
  const handleStartConnect = (nodeId: string, handle?: string) => {
    setConnectingFrom({ nodeId, handle });
  };

  const handleEndConnect = (targetNodeId: string) => {
    if (!connectingFrom) return;
    
    // Don't allow self-connections
    if (connectingFrom.nodeId === targetNodeId) {
      setConnectingFrom(null);
      setMousePosition(null);
      return;
    }
    
    // Check if edge already exists
    const edgeExists = edges.some(
      e => e.source === connectingFrom.nodeId && 
           e.target === targetNodeId &&
           e.sourceHandle === connectingFrom.handle
    );
    
    if (!edgeExists) {
      const newEdge: Edge = {
        id: `edge_${Date.now()}`,
        source: connectingFrom.nodeId,
        target: targetNodeId,
        sourceHandle: connectingFrom.handle
      };
      setEdges(prev => [...prev, newEdge]);
    }
    
    setConnectingFrom(null);
    setMousePosition(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!connectingFrom || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleCanvasMouseUp = () => {
    if (connectingFrom) {
      setConnectingFrom(null);
      setMousePosition(null);
    }
    setIsPanning(false);
  };

  // Pan and Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.min(2, Math.max(0.25, prev + delta)));
    } else {
      // Pan with scroll
      setPanOffset(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only start panning if clicking on canvas background (not on nodes)
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-content')) {
      if (e.button === 0 && !connectingFrom) { // Left click and not connecting
        setIsPanning(true);
        setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      }
    }
  };

  const handleCanvasPanMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(2, prev + 0.25));
  const handleZoomOut = () => setZoom(prev => Math.max(0.25, prev - 0.25));
  const handleResetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const handleGenerateSampleFlow = (flowId: string) => {
    const sampleFlow = sampleFlows.find(f => f.id === flowId);
    if (!sampleFlow) return;

    const generated = sampleFlow.generate();
    
    setName(generated.name);
    setDescription(generated.description);
    setNodes(generated.nodes);
    setEdges(generated.edges.map((e, i) => ({
      id: `edge_${Date.now()}_${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle
    })));
    
    toast.success(`Fluxo "${generated.name}" gerado com sucesso!`);
  };

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
          {/* Generate Sample Flow Button */}
          {!flowBotId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Wand2 className="w-4 h-4" />
                  Gerar Modelo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {sampleFlows.map(flow => (
                  <DropdownMenuItem
                    key={flow.id}
                    onClick={() => handleGenerateSampleFlow(flow.id)}
                    className="flex flex-col items-start"
                  >
                    <span className="font-medium">{flow.name}</span>
                    <span className="text-xs text-muted-foreground">{flow.description}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
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
          
          <Separator className="my-4" />
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p>💡 Arraste blocos para o canvas</p>
            <p>🔗 Clique nos pontos para conectar</p>
            <p>❌ Clique na linha para deletar</p>
            <p>🖱️ Scroll para mover o canvas</p>
            <p>🔍 Ctrl+Scroll para zoom</p>
          </div>
        </div>

        {/* Canvas */}
        <div 
          ref={canvasRef}
          className={cn(
            "flex-1 bg-muted/10 relative overflow-hidden",
            connectingFrom && "cursor-crosshair",
            isPanning && "cursor-grabbing",
            !connectingFrom && !isPanning && "cursor-grab"
          )}
          onDragOver={e => e.preventDefault()}
          onDrop={handleCanvasDrop}
          onMouseMove={(e) => {
            handleCanvasMouseMove(e);
            handleCanvasPanMove(e);
          }}
          onMouseDown={handleCanvasMouseDown}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}
          style={{ 
            backgroundImage: 'radial-gradient(circle, hsl(var(--muted)) 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${panOffset.x}px ${panOffset.y}px`
          }}
        >
          {/* Zoom Controls */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-1 z-50">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleZoomOut}
              title="Diminuir zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs w-12 text-center font-medium">{Math.round(zoom * 100)}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleZoomIn}
              title="Aumentar zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleResetView}
              title="Resetar visualização"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Canvas Content with transform */}
          <div 
            className="canvas-content absolute"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: '4000px',
              height: '4000px'
            }}
          >
            {/* Edge renderer */}
            <EdgeRenderer 
              edges={edges}
              nodes={nodes}
              connectingFrom={connectingFrom}
              mousePosition={mousePosition ? {
                x: (mousePosition.x - panOffset.x) / zoom,
                y: (mousePosition.y - panOffset.y) / zoom
              } : null}
              onDeleteEdge={handleDeleteEdge}
            />
          
            {nodes.map(node => (
              <div
                key={node.id}
                className="absolute"
                style={{ left: node.position.x, top: node.position.y, zIndex: 1 }}
                onClick={() => handleNodeClick(node.id)}
              >
                {node.type === "start" && (
                  <StartNode 
                    selected={selectedNodeId === node.id} 
                    isConnecting={!!connectingFrom}
                    onStartConnect={() => handleStartConnect(node.id)}
                  />
                )}
                {node.type === "message" && (
                  <MessageNode 
                    data={node.data as MessageNodeData} 
                    selected={selectedNodeId === node.id}
                    isConnecting={!!connectingFrom}
                    onStartConnect={() => handleStartConnect(node.id)}
                    onEndConnect={() => handleEndConnect(node.id)}
                  />
                )}
                {node.type === "buttons" && (
                  <ButtonsNode 
                    data={node.data as ButtonsNodeData} 
                    selected={selectedNodeId === node.id}
                    isConnecting={!!connectingFrom}
                    onStartConnect={(handleId) => handleStartConnect(node.id, handleId)}
                    onEndConnect={() => handleEndConnect(node.id)}
                  />
                )}
                {node.type === "collect_data" && (
                  <CollectDataNode 
                    data={node.data as CollectDataNodeData} 
                    selected={selectedNodeId === node.id}
                    isConnecting={!!connectingFrom}
                    onStartConnect={() => handleStartConnect(node.id)}
                    onEndConnect={() => handleEndConnect(node.id)}
                  />
                )}
                {node.type === "action" && (
                  <ActionNode 
                    data={node.data as ActionNodeData} 
                    selected={selectedNodeId === node.id}
                    isConnecting={!!connectingFrom}
                    onEndConnect={() => handleEndConnect(node.id)}
                  />
                )}
              </div>
            ))}
          
            {nodes.length === 1 && nodes[0].type === "start" && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-muted-foreground pointer-events-none">
                <p className="text-lg font-medium">Arraste os blocos para criar seu fluxo</p>
                <p className="text-sm">Clique nos pontos para conectar os blocos</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Node Editor Sheet */}
      <Sheet 
        open={showNodeEditor} 
        onOpenChange={(open) => {
          setShowNodeEditor(open);
          // Node data is saved in real-time via updateNodeData
          // Just close the sheet, node remains on canvas
        }}
        modal={false}
      >
        <SheetContent className="w-[400px] sm:w-[540px]" onInteractOutside={(e) => e.preventDefault()}>
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

                {/* Confirm button - primary action */}
                <Button 
                  className="w-full gap-2"
                  onClick={() => {
                    setShowNodeEditor(false);
                    toast.success("Bloco salvo!");
                  }}
                >
                  <Check className="w-4 h-4" />
                  Confirmar
                </Button>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-2"
                    onClick={() => handleDuplicateNode(selectedNode.id)}
                  >
                    <Copy className="w-4 h-4" />
                    Duplicar
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="flex-1 gap-2"
                    onClick={() => handleDeleteNode(selectedNode.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
