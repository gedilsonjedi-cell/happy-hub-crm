import { useState } from "react";
import { 
  Users, 
  Search, 
  Plus, 
  Filter, 
  MoreVertical, 
  Phone, 
  Mail,
  Upload,
  Download,
  Ban,
  Tag
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AssignTagsDialog } from "@/components/leads/AssignTagsDialog";
import { ImportLeadsDialog } from "@/components/leads/ImportLeadsDialog";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  tags: string[] | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "Novo", className: "bg-primary/10 text-primary border-primary/30" },
  contacted: { label: "Contatado", className: "bg-warning/10 text-warning border-warning/30" },
  qualified: { label: "Qualificado", className: "bg-blue-500/10 text-blue-400 border-blue-400/30" },
  converted: { label: "Convertido", className: "bg-primary/10 text-primary border-primary/30" },
  lost: { label: "Perdido", className: "bg-muted text-muted-foreground border-border" },
};

const Leads = () => {
  const { user } = useAuth();
  const { organizationId } = useUserRole();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, email, status, tags, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Lead[];
    },
    enabled: !!organizationId,
  });

  const handleAddToBlacklist = async (lead: Lead) => {
    if (!user || !organizationId) {
      toast.error("Erro ao identificar organização");
      return;
    }

    try {
      const { error } = await supabase
        .from("blacklist")
        .insert({
          organization_id: organizationId,
          phone: lead.phone.replace(/\D/g, ''),
          name: lead.name,
          reason: "Adicionado da página de Leads",
          blocked_by: user.id
        });

      if (error) {
        if (error.code === '23505') {
          toast.error("Este contato já está na lista negra");
        } else {
          throw error;
        }
      } else {
        toast.success(`${lead.name} adicionado à lista negra`);
      }
    } catch (error) {
      console.error("Erro ao adicionar à lista negra:", error);
      toast.error("Erro ao adicionar à lista negra");
    }
  };

  const handleOpenTagsDialog = (lead: Lead) => {
    setSelectedLead(lead);
    setShowTagsDialog(true);
  };

  const handleTagsUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["leads", organizationId] });
  };

  const handleImportSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["leads", organizationId] });
  };

  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.phone.includes(searchTerm) ||
    (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusCounts = () => {
    const counts: Record<string, number> = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
    leads.forEach(lead => {
      const status = lead.status || "new";
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Leads</h1>
          <p className="text-muted-foreground">Gerencie seus contatos</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => setShowImportDialog(true)}
          >
            <Upload className="w-4 h-4" />
            Importar
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Exportar
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            className="pl-10 bg-card border-border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="w-4 h-4" />
          Filtros
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(statusConfig).map(([key, config]) => (
          <div 
            key={key}
            className="bg-card rounded-lg p-4 border border-border text-center"
          >
            <p className="text-xl font-bold text-foreground">
              {statusCounts[key] || 0}
            </p>
            <Badge variant="outline" className={cn("text-xs mt-1", config.className)}>
              {config.label}
            </Badge>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-slide-up">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-muted/30">
              <TableHead className="text-muted-foreground">Lead</TableHead>
              <TableHead className="text-muted-foreground">Contato</TableHead>
              <TableHead className="text-muted-foreground">Tags</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {leads.length === 0 ? "Nenhum lead cadastrado" : "Nenhum lead encontrado"}
                </TableCell>
              </TableRow>
            ) : (
              filteredLeads.map((lead) => (
                <TableRow 
                  key={lead.id}
                  className="border-border hover:bg-muted/20"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {lead.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">{lead.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {lead.phone}
                      </div>
                      {lead.email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-48">
                      {lead.tags && lead.tags.length > 0 ? (
                        lead.tags.map((tag) => (
                          <Badge 
                            key={tag} 
                            variant="outline" 
                            className="text-xs bg-muted/50"
                          >
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs", 
                        statusConfig[lead.status || "new"]?.className
                      )}
                    >
                      {statusConfig[lead.status || "new"]?.label || lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                        <DropdownMenuItem>Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenTagsDialog(lead)}>
                          <Tag className="w-4 h-4 mr-2" />
                          Atribuir Tags
                        </DropdownMenuItem>
                        <DropdownMenuItem>Iniciar conversa</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleAddToBlacklist(lead)}
                          className="text-warning"
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          Adicionar à Lista Negra
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      <ImportLeadsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={handleImportSuccess}
      />

      <AssignTagsDialog
        open={showTagsDialog}
        onOpenChange={setShowTagsDialog}
        leadId={selectedLead?.id}
        leadName={selectedLead?.name}
        leadPhone={selectedLead?.phone}
        currentTags={selectedLead?.tags || []}
        onSuccess={handleTagsUpdated}
      />
    </MainLayout>
  );
};

export default Leads;
