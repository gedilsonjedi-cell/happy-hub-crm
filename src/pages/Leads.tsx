import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Tag,
  X,
  Check,
  Eye,
  Edit,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AssignTagsDialog } from "@/components/leads/AssignTagsDialog";
import { ImportLeadsDialog } from "@/components/leads/ImportLeadsDialog";
import { AddLeadDialog } from "@/components/leads/AddLeadDialog";
import { EditLeadDialog } from "@/components/leads/EditLeadDialog";
import { DeleteLeadDialog } from "@/components/leads/DeleteLeadDialog";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  status: string;
  tags: string[] | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
}

interface LeadTag {
  id: string;
  name: string;
  color: string;
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
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [showTagFilterPopover, setShowTagFilterPopover] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 100;

  // Debounce search term to avoid too many queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when tag filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTagFilters]);

  // Fetch available tags
  const { data: availableTags = [] } = useQuery({
    queryKey: ["lead-tags", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return [];

      const { data, error } = await supabase
        .from("lead_tags")
        .select("id, name, color")
        .eq("organization_id", effectiveOrganizationId)
        .order("name");

      if (error) throw error;
      return (data || []) as LeadTag[];
    },
    enabled: !!effectiveOrganizationId,
  });

  // Fetch leads with server-side search
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", effectiveOrganizationId, debouncedSearchTerm, selectedTagFilters],
    queryFn: async () => {
      if (!effectiveOrganizationId) return [];

      const term = debouncedSearchTerm.trim().toLowerCase();
      const termDigits = debouncedSearchTerm.replace(/\D/g, '');
      
      // Split search term into individual words for better matching
      const searchWords = term.split(/\s+/).filter(w => w.length >= 2);

      // If searching, use server-side search with OR conditions
      if (term) {
        // Build the query with multiple OR conditions for search
        let query = supabase
          .from("leads")
          .select("*")
          .eq("organization_id", effectiveOrganizationId);

        // Use or() for multiple field search
        const orConditions: string[] = [];
        
        // Name search - if multiple words, each word must be present
        if (searchWords.length > 1) {
          // For multi-word search, we'll search for the whole phrase first
          orConditions.push(`name.ilike.%${term}%`);
          // Also add individual word matching - find records where ALL words appear
          // This is done by searching for each word separately
          searchWords.forEach(word => {
            orConditions.push(`name.ilike.%${word}%`);
          });
        } else {
          // Single word search
          orConditions.push(`name.ilike.%${term}%`);
        }
        
        // Email search
        orConditions.push(`email.ilike.%${term}%`);
        
        // Document search
        orConditions.push(`document.ilike.%${term}%`);
        
        // City search
        orConditions.push(`city.ilike.%${term}%`);
        
        // State search
        orConditions.push(`state.ilike.%${term}%`);
        
        // Notes search
        orConditions.push(`notes.ilike.%${term}%`);

        // Phone search - use digits only for better matching
        if (termDigits.length >= 4) {
          orConditions.push(`phone.ilike.%${termDigits}%`);
        }

        query = query.or(orConditions.join(','));

        // Apply tag filter if selected
        if (selectedTagFilters.length > 0) {
          query = query.contains('tags', selectedTagFilters);
        }

        let { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) throw error;
        
        // If multiple search words, filter client-side to ensure ALL words match the name
        if (searchWords.length > 1 && data) {
          data = data.filter(lead => {
            const leadName = lead.name.toLowerCase();
            return searchWords.every(word => leadName.includes(word));
          });
        }
        
        return (data || []) as Lead[];
      }

      // No search term - fetch with pagination and tag filter
      let query = supabase
        .from("leads")
        .select("*")
        .eq("organization_id", effectiveOrganizationId);

      // Apply tag filter if selected
      if (selectedTagFilters.length > 0) {
        query = query.contains('tags', selectedTagFilters);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return (data || []) as Lead[];
    },
    enabled: !!effectiveOrganizationId,
  });

  const handleAddToBlacklist = async (lead: Lead) => {
    if (!user || !effectiveOrganizationId) {
      toast.error("Erro ao identificar organização");
      return;
    }

    try {
      const { error } = await supabase
        .from("blacklist")
        .insert({
          organization_id: effectiveOrganizationId,
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

  const handleOpenEditDialog = (lead: Lead) => {
    setSelectedLead(lead);
    setShowEditDialog(true);
  };

  const handleOpenDeleteDialog = (lead: Lead) => {
    setSelectedLead(lead);
    setShowDeleteDialog(true);
  };

  const handleViewDetails = (lead: Lead) => {
    navigate(`/leads/${lead.id}`);
  };

  const handleTagsUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["leads", effectiveOrganizationId] });
  };

  const handleImportSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["leads", effectiveOrganizationId] });
  };

  const handleExportCSV = () => {
    if (filteredLeads.length === 0) {
      toast.error("Nenhum lead para exportar");
      return;
    }

    const headers = ["Nome", "Telefone", "Email", "Status", "Tags", "Data de Criação"];
    const rows = filteredLeads.map(lead => [
      lead.name,
      lead.phone,
      lead.email || "",
      statusConfig[lead.status || "new"]?.label || lead.status || "Novo",
      (lead.tags || []).join("; "),
      new Date(lead.created_at).toLocaleDateString("pt-BR")
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(";"))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`${filteredLeads.length} leads exportados`);
  };

  const toggleTagFilter = (tagName: string) => {
    if (selectedTagFilters.includes(tagName)) {
      setSelectedTagFilters(selectedTagFilters.filter(t => t !== tagName));
    } else {
      setSelectedTagFilters([...selectedTagFilters, tagName]);
    }
  };

  const clearTagFilters = () => {
    setSelectedTagFilters([]);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Only select leads on current page
      const currentPageLeads = filteredLeads.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      );
      setSelectedLeads(new Set(currentPageLeads.map(lead => lead.id)));
    } else {
      setSelectedLeads(new Set());
    }
  };

  const handleSelectLead = (leadId: string, checked: boolean) => {
    const newSelected = new Set(selectedLeads);
    if (checked) {
      newSelected.add(leadId);
    } else {
      newSelected.delete(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedLeads.size === 0) return;

    setIsBulkDeleting(true);
    try {
      const { error } = await supabase
        .from("leads")
        .delete()
        .in("id", Array.from(selectedLeads));

      if (error) throw error;

      toast.success(`${selectedLeads.size} contato(s) excluído(s) com sucesso`);
      setSelectedLeads(new Set());
      queryClient.invalidateQueries({ queryKey: ["leads", effectiveOrganizationId] });
    } catch (error) {
      console.error("Erro ao excluir contatos:", error);
      toast.error("Erro ao excluir contatos");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Use leads directly - filtering is done server-side now
  const filteredLeads = leads;

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedLeads = filteredLeads.slice(startIndex, endIndex);

  const isAllSelected = paginatedLeads.length > 0 && paginatedLeads.every(lead => selectedLeads.has(lead.id));
  const isSomeSelected = selectedLeads.size > 0 && !isAllSelected;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedLeads(new Set()); // Clear selection when changing pages
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  // Fetch status counts separately to show accurate total counts
  const { data: statusCounts = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 } } = useQuery({
    queryKey: ["leads-status-counts", effectiveOrganizationId],
    queryFn: async () => {
      if (!effectiveOrganizationId) return { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };

      const { data, error } = await supabase
        .from("leads")
        .select("status")
        .eq("organization_id", effectiveOrganizationId);

      if (error) throw error;

      const counts: Record<string, number> = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
      (data || []).forEach((lead: { status: string }) => {
        const status = lead.status || "new";
        if (counts[status] !== undefined) {
          counts[status]++;
        }
      });
      return counts;
    },
    enabled: !!effectiveOrganizationId,
  });

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Contatos</h1>
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
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={handleExportCSV}
          >
            <Download className="w-4 h-4" />
            Exportar
          </Button>
          <Button 
            size="sm" 
            className="gap-2"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Novo Contato
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
        <Popover open={showTagFilterPopover} onOpenChange={setShowTagFilterPopover}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              className={cn(
                "gap-2",
                selectedTagFilters.length > 0 && "border-primary text-primary"
              )}
            >
              <Tag className="w-4 h-4" />
              Filtrar por Tags
              {selectedTagFilters.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {selectedTagFilters.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Filtrar por tags</span>
                {selectedTagFilters.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 px-2 text-xs"
                    onClick={clearTagFilters}
                  >
                    Limpar
                  </Button>
                )}
              </div>
              {availableTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma tag criada ainda.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => {
                    const isSelected = selectedTagFilters.includes(tag.name);
                    return (
                      <Button
                        key={tag.id}
                        variant="outline"
                        size="sm"
                        onClick={() => toggleTagFilter(tag.name)}
                        className={cn(
                          "h-7 gap-1.5 transition-all",
                          isSelected && "ring-2 ring-primary ring-offset-1"
                        )}
                        style={{
                          backgroundColor: isSelected ? tag.color + "20" : "transparent",
                          borderColor: tag.color,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-xs">{tag.name}</span>
                        {isSelected && <Check className="w-3 h-3 text-primary" />}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Tag Filters */}
      {selectedTagFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Filtrando por:</span>
          {selectedTagFilters.map((tagName) => {
            const tag = availableTags.find(t => t.name === tagName);
            return (
              <Badge
                key={tagName}
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-secondary/80"
                onClick={() => toggleTagFilter(tagName)}
                style={{
                  backgroundColor: tag ? tag.color + "20" : undefined,
                  borderColor: tag?.color,
                }}
              >
                {tag && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                {tagName}
                <X className="w-3 h-3" />
              </Badge>
            );
          })}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={clearTagFilters}
          >
            Limpar todos
          </Button>
        </div>
      )}

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

      {/* Bulk Actions Bar */}
      {selectedLeads.size > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-4 flex items-center justify-between animate-fade-in">
          <span className="text-sm font-medium">
            {selectedLeads.size} contato(s) selecionado(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedLeads(new Set())}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="gap-2"
            >
              {isBulkDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Excluir Selecionados
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-slide-up">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-muted/30">
              <TableHead className="w-12">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Selecionar todos"
                  className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                />
              </TableHead>
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
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : paginatedLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {leads.length === 0 ? "Nenhum lead cadastrado" : "Nenhum lead encontrado"}
                </TableCell>
              </TableRow>
            ) : (
              paginatedLeads.map((lead) => (
                <TableRow 
                  key={lead.id}
                  className={cn(
                    "border-border hover:bg-muted/20",
                    selectedLeads.has(lead.id) && "bg-primary/5"
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedLeads.has(lead.id)}
                      onCheckedChange={(checked) => handleSelectLead(lead.id, !!checked)}
                      aria-label={`Selecionar ${lead.name}`}
                    />
                  </TableCell>
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
                        lead.tags.map((tag) => {
                          const tagInfo = availableTags.find(t => t.name === tag);
                          return (
                            <Badge 
                              key={tag} 
                              variant="outline" 
                              className="text-xs"
                              style={{
                                backgroundColor: tagInfo ? tagInfo.color + "15" : undefined,
                                borderColor: tagInfo?.color,
                              }}
                            >
                              {tagInfo && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full mr-1"
                                  style={{ backgroundColor: tagInfo.color }}
                                />
                              )}
                              {tag}
                            </Badge>
                          );
                        })
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
                        <DropdownMenuItem onClick={() => handleViewDetails(lead)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenEditDialog(lead)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenTagsDialog(lead)}>
                          <Tag className="w-4 h-4 mr-2" />
                          Atribuir Tags
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleAddToBlacklist(lead)}
                          className="text-warning"
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          Adicionar à Lista Negra
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleOpenDeleteDialog(lead)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {startIndex + 1}-{Math.min(endIndex, filteredLeads.length)} de {filteredLeads.length} contatos
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            {getPageNumbers().map((page, index) => (
              typeof page === 'number' ? (
                <Button
                  key={index}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handlePageChange(page)}
                >
                  {page}
                </Button>
              ) : (
                <span key={index} className="px-2 text-muted-foreground">
                  {page}
                </span>
              )
            ))}
            
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ImportLeadsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={handleImportSuccess}
      />

      <AddLeadDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["leads", effectiveOrganizationId] })}
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

      <EditLeadDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        lead={selectedLead}
        onSuccess={handleTagsUpdated}
      />

      <DeleteLeadDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        leadId={selectedLead?.id || null}
        leadName={selectedLead?.name || null}
        onSuccess={handleTagsUpdated}
      />
    </MainLayout>
  );
};

export default Leads;
