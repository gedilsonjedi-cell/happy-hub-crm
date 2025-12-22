import { useState } from "react";
import { 
  Send, 
  Plus, 
  Calendar,
  Users,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  MoreVertical,
  Play,
  Pause,
  ArrowLeft,
  Settings2,
  Check,
  Shuffle,
  Timer,
  Smartphone
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Channel {
  id: string;
  name: string;
  phone: string;
  connected: boolean;
}

interface MessageTemplate {
  id: string;
  name: string;
  preview: string;
}

const mockChannels: Channel[] = [
  { id: "ch-1", name: "WhatsApp Principal", phone: "+55 11 99999-0001", connected: true },
  { id: "ch-2", name: "WhatsApp Vendas", phone: "+55 11 99999-0002", connected: true },
  { id: "ch-3", name: "WhatsApp Suporte", phone: "+55 11 99999-0003", connected: true },
  { id: "ch-4", name: "WhatsApp Marketing", phone: "+55 11 99999-0004", connected: true },
  { id: "ch-5", name: "WhatsApp Comercial", phone: "+55 11 99999-0005", connected: true },
];

const mockTemplates: MessageTemplate[] = [
  { id: "template-1", name: "Boas-vindas", preview: "Olá {nome}! Seja bem-vindo à nossa empresa..." },
  { id: "template-2", name: "Promoção", preview: "🔥 Oferta especial para você! Aproveite..." },
  { id: "template-3", name: "Lembrete", preview: "Oi {nome}, passando para lembrar sobre..." },
  { id: "template-4", name: "Aniversário", preview: "🎂 Parabéns {nome}! Desejamos um feliz..." },
  { id: "template-5", name: "Reativação", preview: "Sentimos sua falta! Volte e confira..." },
];

interface Campaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "completed" | "failed";
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  scheduledAt?: string;
  createdAt: string;
}

const mockCampaigns: Campaign[] = [
  { 
    id: "1", 
    name: "Promoção Black Friday", 
    status: "completed", 
    recipients: 500, 
    sent: 500, 
    delivered: 485, 
    failed: 15,
    createdAt: "2024-01-15"
  },
  { 
    id: "2", 
    name: "Novidades de Janeiro", 
    status: "running", 
    recipients: 300, 
    sent: 150, 
    delivered: 148, 
    failed: 2,
    createdAt: "2024-01-14"
  },
];

const statusConfig = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground border-border", icon: MessageSquare },
  scheduled: { label: "Agendada", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  running: { label: "Enviando", className: "bg-blue-500/10 text-blue-400 border-blue-400/30", icon: Play },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle },
  failed: { label: "Falhou", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
};

const Disparos = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelTemplates, setChannelTemplates] = useState<Record<string, string>>({});
  const [useUnifiedTemplate, setUseUnifiedTemplate] = useState(true);
  const [formData, setFormData] = useState({
    campaignName: "",
    team: "",
    chatbot: "disabled",
    startTime: "now",
    unifiedTemplate: "",
    dispatchInterval: "60"
  });

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => {
      const newSelected = prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId];
      
      // Remove template do canal se ele for desmarcado
      if (!newSelected.includes(channelId)) {
        setChannelTemplates(current => {
          const updated = { ...current };
          delete updated[channelId];
          return updated;
        });
      }
      
      return newSelected;
    });
  };

  const selectAllChannels = () => {
    if (selectedChannels.length === mockChannels.length) {
      setSelectedChannels([]);
      setChannelTemplates({});
    } else {
      setSelectedChannels(mockChannels.map(c => c.id));
    }
  };

  const setChannelTemplate = (channelId: string, templateId: string) => {
    setChannelTemplates(prev => ({
      ...prev,
      [channelId]: templateId
    }));
  };

  const getSelectedTemplatesPreview = () => {
    if (useUnifiedTemplate && formData.unifiedTemplate) {
      const template = mockTemplates.find(t => t.id === formData.unifiedTemplate);
      return template ? [template] : [];
    }
    
    const templates: MessageTemplate[] = [];
    selectedChannels.forEach(chId => {
      const templateId = channelTemplates[chId];
      if (templateId) {
        const template = mockTemplates.find(t => t.id === templateId);
        if (template && !templates.find(t => t.id === template.id)) {
          templates.push(template);
        }
      }
    });
    return templates;
  };

  if (showCreateForm) {
    return (
      <MainLayout>
        {/* Header */}
        <div className="mb-6 animate-fade-in">
          <Button 
            variant="ghost" 
            className="gap-2 mb-4 text-muted-foreground hover:text-foreground"
            onClick={() => setShowCreateForm(false)}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold text-foreground mb-2">Configuração de campanha</h1>
          <p className="text-muted-foreground text-sm">
            Crie campanhas para engajar seus clientes em uma nova promoção, parabenizar pelo seu aniversário, 
            trazer novos clientes para um ponto de vendas. Use das ferramentas que o CRM te oferece para gerar novas vendas.
          </p>
        </div>

        {/* Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-slide-up">
          {/* Left Column - Form Fields */}
          <div className="space-y-5">
            {/* Nome da campanha */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Nome da campanha <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input 
                  placeholder="Digite o nome da campanha"
                  className="bg-card border-border"
                  value={formData.campaignName}
                  onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                />
                {formData.campaignName && <Check className="w-5 h-5 text-primary" />}
              </div>
            </div>

            {/* Equipe */}
            <div className="space-y-2">
              <Label className="text-foreground">Equipe</Label>
              <div className="flex items-center gap-2">
                <Select 
                  value={formData.team} 
                  onValueChange={(value) => setFormData({ ...formData, team: value })}
                >
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue placeholder="Selecione a equipe" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="geral">Geral</SelectItem>
                    <SelectItem value="vendas">Vendas</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                  </SelectContent>
                </Select>
                {formData.team && <Check className="w-5 h-5 text-primary" />}
              </div>
            </div>

            {/* Canais de disparo - Seleção múltipla */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">
                  Canais de disparo <span className="text-destructive">*</span>
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary hover:text-primary/80"
                  onClick={selectAllChannels}
                >
                  {selectedChannels.length === mockChannels.length ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              </div>
              
              <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2 max-h-48 overflow-y-auto">
                {mockChannels.map((channel) => (
                  <div 
                    key={channel.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      selectedChannels.includes(channel.id) 
                        ? "bg-primary/10 border-primary/50" 
                        : "bg-card border-border hover:border-primary/30"
                    )}
                    onClick={() => toggleChannel(channel.id)}
                  >
                    <Checkbox 
                      checked={selectedChannels.includes(channel.id)}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <Smartphone className="w-4 h-4 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{channel.name}</p>
                      <p className="text-xs text-muted-foreground">{channel.phone}</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  </div>
                ))}
              </div>
              
              {selectedChannels.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Check className="w-4 h-4" />
                  <span>{selectedChannels.length} canal(is) selecionado(s)</span>
                </div>
              )}
            </div>

            {/* Modo de disparo intercalado */}
            {selectedChannels.length > 1 && (
              <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2">
                  <Shuffle className="w-5 h-5 text-primary" />
                  <Label className="text-foreground font-medium">Disparo Intercalado</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  As mensagens serão alternadas entre os {selectedChannels.length} canais selecionados, 
                  distribuindo a carga e evitando bloqueios.
                </p>
                
                {/* Intervalo entre disparos */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Timer className="w-4 h-4" />
                    Intervalo entre disparos
                  </Label>
                  <Select 
                    value={formData.dispatchInterval} 
                    onValueChange={(value) => setFormData({ ...formData, dispatchInterval: value })}
                  >
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="15">15 segundos</SelectItem>
                      <SelectItem value="30">30 segundos</SelectItem>
                      <SelectItem value="60">1 minuto</SelectItem>
                      <SelectItem value="120">2 minutos</SelectItem>
                      <SelectItem value="180">3 minutos</SelectItem>
                      <SelectItem value="300">5 minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Preview da distribuição */}
                <div className="mt-3 p-3 bg-card rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground mb-2">Ordem de disparo:</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedChannels.slice(0, 5).map((chId, idx) => {
                      const channel = mockChannels.find(c => c.id === chId);
                      return (
                        <Badge 
                          key={chId} 
                          variant="outline" 
                          className="text-xs bg-primary/10 border-primary/30 text-primary"
                        >
                          {idx + 1}. {channel?.name.replace("WhatsApp ", "")}
                        </Badge>
                      );
                    })}
                    {selectedChannels.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{selectedChannels.length - 5} mais
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    → Repete a cada {selectedChannels.length} mensagens
                  </p>
                </div>
              </div>
            )}

            {/* Habilitar chatbot */}
            <div className="space-y-2">
              <Label className="text-foreground">Habilitar chatbot</Label>
              <div className="flex items-center gap-2">
                <Select 
                  value={formData.chatbot} 
                  onValueChange={(value) => setFormData({ ...formData, chatbot: value })}
                >
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="disabled">Desabilitado</SelectItem>
                    <SelectItem value="enabled">Habilitado</SelectItem>
                  </SelectContent>
                </Select>
                <Check className="w-5 h-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                Se habilitado, o chatbot de atendimento do canal será acionado quando o contato responder.
              </p>
            </div>

            {/* Início do disparo */}
            <div className="space-y-2">
              <Label className="text-foreground">Início do disparo</Label>
              <div className="flex items-center gap-2">
                <Select 
                  value={formData.startTime} 
                  onValueChange={(value) => setFormData({ ...formData, startTime: value })}
                >
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="now">Iniciar agora</SelectItem>
                    <SelectItem value="scheduled">Agendar</SelectItem>
                  </SelectContent>
                </Select>
                <Check className="w-5 h-5 text-primary" />
              </div>
            </div>

            {/* Configurações de disparo */}
            <div className="space-y-2">
              <Label className="text-foreground">Configurações de disparo</Label>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-between bg-card border-border text-muted-foreground"
                >
                  Configurações personalizadas
                  <Settings2 className="w-4 h-4" />
                </Button>
                {selectedChannels.length > 0 && <Check className="w-5 h-5 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecione os canais para configurar o disparo
              </p>
            </div>

            {/* Público */}
            <div className="space-y-2">
              <Label className="text-foreground">Público</Label>
              <Button 
                variant="outline" 
                className="w-full justify-start bg-card border-border text-primary hover:text-primary"
              >
                Definir público
              </Button>
            </div>

            {/* Summary */}
            <div className="pt-4 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-primary font-medium">Destinatários:</span>
                <span className="text-foreground">0</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-primary font-medium">Canais selecionados:</span>
                <span className="text-foreground">{selectedChannels.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-primary font-medium">Intervalo:</span>
                <span className="text-foreground">
                  {parseInt(formData.dispatchInterval) >= 60 
                    ? `${parseInt(formData.dispatchInterval) / 60} min` 
                    : `${formData.dispatchInterval}s`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-primary font-medium">Modo:</span>
                <span className="text-foreground">
                  {selectedChannels.length > 1 ? "Intercalado" : "Único"}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column - Templates por Canal */}
          <div className="space-y-5">
            {/* Modo de Template */}
            <div className="space-y-3">
              <Label className="text-foreground">
                Templates de Mensagem <span className="text-destructive">*</span>
              </Label>
              
              {/* Toggle entre unificado e por canal */}
              <div className="flex gap-2">
                <Button
                  variant={useUnifiedTemplate ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUseUnifiedTemplate(true)}
                >
                  Mesmo template
                </Button>
                <Button
                  variant={!useUnifiedTemplate ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUseUnifiedTemplate(false)}
                >
                  Template por canal
                </Button>
              </div>
            </div>

            {/* Template Unificado */}
            {useUnifiedTemplate ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Select 
                    value={formData.unifiedTemplate} 
                    onValueChange={(value) => setFormData({ ...formData, unifiedTemplate: value })}
                  >
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue placeholder="Selecione o template" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {mockTemplates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.unifiedTemplate && <Check className="w-5 h-5 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  O mesmo template será usado em todos os {selectedChannels.length} canais selecionados.
                </p>
              </div>
            ) : (
              /* Templates por Canal */
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Selecione um template para cada canal. Templates diferentes serão usados conforme configurado.
                </p>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedChannels.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      Selecione pelo menos um canal
                    </div>
                  ) : (
                    selectedChannels.map(chId => {
                      const channel = mockChannels.find(c => c.id === chId);
                      const selectedTemplate = channelTemplates[chId];
                      const template = mockTemplates.find(t => t.id === selectedTemplate);
                      
                      return (
                        <div 
                          key={chId}
                          className="p-3 bg-card rounded-lg border border-border space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-foreground flex-1">
                              {channel?.name}
                            </span>
                            {selectedTemplate && <Check className="w-4 h-4 text-primary" />}
                          </div>
                          <Select 
                            value={selectedTemplate || ""} 
                            onValueChange={(value) => setChannelTemplate(chId, value)}
                          >
                            <SelectTrigger className="bg-muted/50 border-border h-9">
                              <SelectValue placeholder="Selecione o template" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              {mockTemplates.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {template && (
                            <p className="text-xs text-muted-foreground truncate">
                              {template.preview}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Message Preview */}
            <div 
              className="rounded-lg border border-border overflow-hidden"
              style={{ 
                background: 'linear-gradient(135deg, hsl(160 10% 15%), hsl(160 10% 12%))',
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` 
              }}
            >
              <div className="p-3 border-b border-border/50 bg-card/30">
                <p className="text-xs text-muted-foreground">Prévia das mensagens</p>
              </div>
              <div className="min-h-48 max-h-64 overflow-y-auto p-4 space-y-3">
                {getSelectedTemplatesPreview().length > 0 ? (
                  getSelectedTemplatesPreview().map((template, idx) => (
                    <div key={template.id} className="bg-card rounded-lg p-3 max-w-[85%] shadow-lg">
                      <Badge variant="outline" className="text-xs mb-2 bg-primary/10 border-primary/30 text-primary">
                        {template.name}
                      </Badge>
                      <p className="text-foreground text-sm">
                        {template.preview}
                      </p>
                      <span className="text-xs text-muted-foreground mt-2 block text-right">12:0{idx}</span>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center py-12">
                    <p className="text-muted-foreground/50 text-sm text-center">
                      Selecione template(s) para visualizar
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border">
          <Button variant="outline" onClick={() => setShowCreateForm(false)}>
            Cancelar
          </Button>
          <Button className="gap-2">
            <Send className="w-4 h-4" />
            Criar Campanha
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Disparos</h1>
          <p className="text-muted-foreground">Gerencie suas campanhas de mensagens</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreateForm(true)}>
          <Plus className="w-4 h-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total de Campanhas</p>
              <p className="text-2xl font-bold text-foreground">{mockCampaigns.length}</p>
            </div>
            <Send className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Em Execução</p>
              <p className="text-2xl font-bold text-blue-400">
                {mockCampaigns.filter(c => c.status === "running").length}
              </p>
            </div>
            <Play className="w-6 h-6 text-blue-400" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Mensagens Enviadas</p>
              <p className="text-2xl font-bold text-foreground">
                {mockCampaigns.reduce((acc, c) => acc + c.sent, 0).toLocaleString()}
              </p>
            </div>
            <MessageSquare className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Taxa de Entrega</p>
              <p className="text-2xl font-bold text-primary">97%</p>
            </div>
            <CheckCircle className="w-6 h-6 text-primary" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-slide-up">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-muted/30">
              <TableHead className="text-muted-foreground">Campanha</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Destinatários</TableHead>
              <TableHead className="text-muted-foreground">Enviadas</TableHead>
              <TableHead className="text-muted-foreground">Entregues</TableHead>
              <TableHead className="text-muted-foreground">Falhas</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockCampaigns.map((campaign) => {
              const config = statusConfig[campaign.status];
              const StatusIcon = config.icon;
              
              return (
                <TableRow 
                  key={campaign.id}
                  className="border-border hover:bg-muted/20"
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {campaign.scheduledAt ? `Agendada: ${campaign.scheduledAt}` : `Criada: ${campaign.createdAt}`}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs gap-1", config.className)}>
                      <StatusIcon className="w-3 h-3" />
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground">{campaign.recipients}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground">{campaign.sent}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-primary">{campaign.delivered}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-destructive">{campaign.failed}</span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                        <DropdownMenuItem>Duplicar</DropdownMenuItem>
                        {campaign.status === "running" && (
                          <DropdownMenuItem>Pausar</DropdownMenuItem>
                        )}
                        {campaign.status === "draft" && (
                          <DropdownMenuItem>Enviar agora</DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </MainLayout>
  );
};

export default Disparos;
