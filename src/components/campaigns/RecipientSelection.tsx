import { useState, useEffect } from "react";
import { 
  Users, 
  FileText, 
  Filter, 
  Tag, 
  Calendar, 
  Check, 
  Upload,
  X,
  Search,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllLeads } from "@/lib/fetchAllLeads";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "@/hooks/use-toast";

type RecipientSourceType = "contacts" | "numbers" | null;
type ContactFilterType = "tag" | "upload_date" | "all";
type TagMatchMode = "any" | "exclusive" | "both";

interface Lead {
  id: string;
  name: string;
  phone: string;
  tags: string[] | null;
  created_at: string;
}

interface RecipientSelectionProps {
  onSelectionChange: (recipients: { phones: string[]; source: RecipientSourceType }) => void;
  sectorId?: string;
}

export function RecipientSelection({ onSelectionChange, sectorId }: RecipientSelectionProps) {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [sourceType, setSourceType] = useState<RecipientSourceType>(null);
  const [filterType, setFilterType] = useState<ContactFilterType>("all");
  
  // For contacts/leads
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [secondTag, setSecondTag] = useState<string>("");
  const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>("any");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingLeads, setLoadingLeads] = useState(false);
  
  // For number list
  const [numberList, setNumberList] = useState("");
  const [parsedNumbers, setParsedNumbers] = useState<string[]>([]);

  // Fetch leads when source type is contacts
  useEffect(() => {
    if (sourceType === "contacts" && user && effectiveOrganizationId) {
      fetchLeads();
    }
  }, [sourceType, user, effectiveOrganizationId]);

  // Filter leads based on filter type
  useEffect(() => {
    let filtered = [...leads];
    
    if (filterType === "tag" && selectedTag) {
      filtered = leads.filter(lead => {
        const tags = lead.tags || [];
        if (!tags.includes(selectedTag)) return false;
        if (tagMatchMode === "exclusive") {
          // Apenas com essa tag (e nenhuma outra)
          return tags.length === 1;
        }
        if (tagMatchMode === "both") {
          // Precisa ter selectedTag E secondTag
          return secondTag ? tags.includes(secondTag) : true;
        }
        // any: tem essa tag (com ou sem outras)
        return true;
      });
    } else if (filterType === "upload_date" && selectedDate) {
      filtered = leads.filter(lead => {
        const leadDate = new Date(lead.created_at).toISOString().split('T')[0];
        return leadDate === selectedDate;
      });
    }
    
    if (searchTerm) {
      filtered = filtered.filter(lead => 
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone.includes(searchTerm)
      );
    }
    
    setFilteredLeads(filtered);
  }, [leads, filterType, selectedTag, secondTag, tagMatchMode, selectedDate, searchTerm]);

  // Parse and normalize numbers when text changes
  useEffect(() => {
    const numbers = numberList
      .split(/[\n,;]/)
      .map(n => {
        let digits = n.replace(/\D/g, '');
        
        // Remove leading zero
        if (digits.startsWith('0')) {
          digits = digits.substring(1);
        }
        
        // Remove 55 prefix temporarily for normalization
        if (digits.startsWith('55') && digits.length >= 12) {
          digits = digits.substring(2);
        }
        
        // Now digits should be DDD + number (10 or 11 digits)
        if (digits.length === 10) {
          const ddd = digits.slice(0, 2);
          const firstDigit = digits[2];
          
          // Valid mobile prefixes (6, 7, 8, 9) - need to add the 9
          if (['6', '7', '8', '9'].includes(firstDigit)) {
            digits = ddd + '9' + digits.slice(2);
            console.log(`[RecipientSelection] Added 9 to mobile: ${ddd}9${digits.slice(3)}`);
          }
        }
        
        // Add country code
        digits = '55' + digits;
        
        return digits;
      })
      .filter(n => n.length === 13 && n.startsWith('55'));
    setParsedNumbers([...new Set(numbers)]);
  }, [numberList]);

  // Normalize phone number - add 9 for mobile numbers missing it
  const normalizePhone = (phone: string): string => {
    let digits = phone.replace(/\D/g, '');
    
    // Remove leading zero
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }
    
    // Remove 55 prefix temporarily for normalization
    if (digits.startsWith('55') && digits.length >= 12) {
      digits = digits.substring(2);
    }
    
    // Now digits should be DDD + number (10 or 11 digits)
    if (digits.length === 10) {
      const ddd = digits.slice(0, 2);
      const firstDigit = digits[2];
      
      // Valid mobile prefixes (6, 7, 8, 9) - need to add the 9
      if (['6', '7', '8', '9'].includes(firstDigit)) {
        digits = ddd + '9' + digits.slice(2);
      }
    }
    
    // Add country code
    return '55' + digits;
  };

  // Notify parent of selection changes
  useEffect(() => {
    if (sourceType === "contacts") {
      const selectedPhones = leads
        .filter(lead => selectedLeadIds.includes(lead.id))
        .map(lead => normalizePhone(lead.phone));
      onSelectionChange({ phones: selectedPhones, source: "contacts" });
    } else if (sourceType === "numbers") {
      onSelectionChange({ phones: parsedNumbers, source: "numbers" });
    } else {
      onSelectionChange({ phones: [], source: null });
    }
  }, [sourceType, selectedLeadIds, parsedNumbers, leads]);

  const fetchLeads = async () => {
    if (!effectiveOrganizationId) return;

    setLoadingLeads(true);
    console.log("[RecipientSelection] fetchLeads start", { orgId: effectiveOrganizationId });

    const tryFetch = async (withOrder: boolean) => {
      return await fetchAllLeads<{ id: string; name: string; phone: string; tags: string[] | null; created_at: string }>({
        organizationId: effectiveOrganizationId,
        columns: "id, name, phone, tags, created_at",
        orderBy: withOrder ? { column: "created_at", ascending: false } : null,
        maxRows: 20_000,
      });
    };

    try {
      let data: Array<{ id: string; name: string; phone: string; tags: string[] | null; created_at: string }> = [];
      try {
        data = await tryFetch(true);
      } catch (orderedErr) {
        console.warn("[RecipientSelection] ordered fetch failed, retrying without order", orderedErr);
        data = await tryFetch(false);
      }

      console.log("[RecipientSelection] fetchLeads success", { count: data.length });
      setLeads(data);
      setFilteredLeads(data);

      const tags = new Set<string>();
      data.forEach(lead => {
        lead.tags?.forEach(tag => tags.add(tag));
      });
      setAvailableTags(Array.from(tags));

      if (data.length === 0) {
        toast({
          title: "Nenhum contato encontrado",
          description: "Esta organização ainda não tem leads cadastrados. Importe contatos antes de criar uma campanha.",
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[RecipientSelection] Error fetching leads:", error);
      toast({
        title: "Erro ao carregar contatos",
        description: msg || "Não foi possível buscar os leads. Tente novamente em alguns segundos.",
        variant: "destructive",
      });
    } finally {
      setLoadingLeads(false);
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const selectAllFiltered = () => {
    const allIds = filteredLeads.map(l => l.id);
    const allSelected = allIds.every(id => selectedLeadIds.includes(id));
    
    if (allSelected) {
      setSelectedLeadIds(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedLeadIds(prev => [...new Set([...prev, ...allIds])]);
    }
  };

  const getUniqueDates = () => {
    const dates = new Set<string>();
    leads.forEach(lead => {
      dates.add(new Date(lead.created_at).toISOString().split('T')[0]);
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  };

  // Step 1: Choose source type
  if (!sourceType) {
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-foreground text-base font-semibold">
            Público da campanha <span className="text-destructive">*</span>
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            Defina quem receberá as mensagens desta campanha
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Filter by Contacts Option */}
          <button
            onClick={() => setSourceType("contacts")}
            className={cn(
              "relative flex flex-col items-center justify-center gap-4 p-6 rounded-xl border-2 transition-all",
              "bg-card hover:bg-muted/50 border-border hover:border-primary/50",
              "min-h-[180px] text-center group"
            )}
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">Filtro por contato</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Utilize sua base de leads para disparar esta campanha
              </p>
            </div>
          </button>

          {/* Number List Option */}
          <button
            onClick={() => setSourceType("numbers")}
            className={cn(
              "relative flex flex-col items-center justify-center gap-4 p-6 rounded-xl border-2 transition-all",
              "bg-card hover:bg-muted/50 border-border hover:border-primary/50",
              "min-h-[180px] text-center group"
            )}
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">Lista de números</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Utilize uma lista de números para disparar esta campanha
              </p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Step 2a: Contacts filtering
  if (sourceType === "contacts") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-foreground text-base font-semibold">
              Selecionar contatos
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Filtre e selecione os contatos para esta campanha
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => { setSourceType(null); setSelectedLeadIds([]); }}
            className="text-muted-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Voltar
          </Button>
        </div>

        {/* Filter Options */}
        <div className="bg-muted/30 rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filtrar por:</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filterType === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("all")}
            >
              Todos
            </Button>
            <Button
              variant={filterType === "tag" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("tag")}
              className="gap-2"
            >
              <Tag className="w-4 h-4" />
              Por Tag
            </Button>
            <Button
              variant={filterType === "upload_date" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("upload_date")}
              className="gap-2"
            >
              <Calendar className="w-4 h-4" />
              Por Data de Cadastro
            </Button>
          </div>

          {/* Tag Filter */}
          {filterType === "tag" && (
            <div className="space-y-3">
              <Select value={selectedTag} onValueChange={setSelectedTag}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder="Selecione uma tag" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {availableTags.length === 0 ? (
                    <div className="p-3 text-center text-muted-foreground text-sm">
                      Nenhuma tag encontrada
                    </div>
                  ) : (
                    availableTags.map(tag => (
                      <SelectItem key={tag} value={tag}>
                        <div className="flex items-center gap-2">
                          <Tag className="w-3 h-3" />
                          {tag}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {selectedTag && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Modo de combinação</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={tagMatchMode === "any" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTagMatchMode("any")}
                    >
                      Todos com essa tag
                    </Button>
                    <Button
                      type="button"
                      variant={tagMatchMode === "exclusive" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTagMatchMode("exclusive")}
                    >
                      Apenas com essa tag
                    </Button>
                    <Button
                      type="button"
                      variant={tagMatchMode === "both" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTagMatchMode("both")}
                    >
                      Que tenham as duas tags
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tagMatchMode === "any" && "Inclui contatos que tenham a tag selecionada (com ou sem outras)."}
                    {tagMatchMode === "exclusive" && "Só inclui contatos que tenham SOMENTE essa tag — útil para evitar disparar para quem já recebeu outras campanhas."}
                    {tagMatchMode === "both" && "Inclui contatos que tenham ambas as tags selecionadas."}
                  </p>

                  {tagMatchMode === "both" && (
                    <Select value={secondTag} onValueChange={setSecondTag}>
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue placeholder="Selecione a segunda tag" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {availableTags.filter(t => t !== selectedTag).map(tag => (
                          <SelectItem key={tag} value={tag}>
                            <div className="flex items-center gap-2">
                              <Tag className="w-3 h-3" />
                              {tag}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Date Filter */}
          {filterType === "upload_date" && (
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue placeholder="Selecione a data de upload" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {getUniqueDates().map(date => (
                  <SelectItem key={date} value={date}>
                    {new Date(date).toLocaleDateString("pt-BR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              className="pl-10 bg-card border-border"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Leads List */}
        <div className="bg-card rounded-lg border border-border">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={filteredLeads.length > 0 && filteredLeads.every(l => selectedLeadIds.includes(l.id))}
                onCheckedChange={selectAllFiltered}
              />
              <span className="text-sm text-muted-foreground">
                Selecionar todos ({filteredLeads.length})
              </span>
            </div>
            <Badge variant="secondary">
              {selectedLeadIds.length} selecionados
            </Badge>
          </div>
          
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {loadingLeads ? (
              <div className="p-8 text-center text-muted-foreground">
                Carregando contatos...
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum contato encontrado</p>
              </div>
            ) : (
              filteredLeads.slice(0, 500).map(lead => (
                <div
                  key={lead.id}
                  className={cn(
                    "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                    selectedLeadIds.includes(lead.id) 
                      ? "bg-primary/5" 
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => toggleLeadSelection(lead.id)}
                >
                  <Checkbox
                    checked={selectedLeadIds.includes(lead.id)}
                    className="data-[state=checked]:bg-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{lead.name}</p>
                    <p className="text-sm text-muted-foreground">{lead.phone}</p>
                  </div>
                  {lead.tags && lead.tags.length > 0 && (
                    <div className="flex gap-1">
                      {lead.tags.slice(0, 2).map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {filteredLeads.length > 500 && (
              <div className="p-3 text-center text-xs text-muted-foreground bg-muted/20">
                Mostrando os primeiros 500 de {filteredLeads.length}. Use a busca ou filtros para refinar — "Selecionar todos" inclui todos os {filteredLeads.length}.
              </div>
            )}
          </div>
        </div>

        {selectedLeadIds.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2">
            <Check className="w-5 h-5 text-primary" />
            <span className="text-sm text-foreground">
              <strong>{selectedLeadIds.length}</strong> contatos selecionados para esta campanha
            </span>
          </div>
        )}
      </div>
    );
  }

  // Step 2b: Number list input
  if (sourceType === "numbers") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-foreground text-base font-semibold">
              Lista de números
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Cole ou digite os números de telefone para esta campanha
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => { setSourceType(null); setNumberList(""); }}
            className="text-muted-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Voltar
          </Button>
        </div>

        <div className="bg-muted/30 rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p>Cole os números separados por vírgula, ponto e vírgula ou um por linha.</p>
              <p className="mt-1">Se o contato já existir no CRM, o <strong>nome real</strong> será utilizado. Caso contrário, será salvo como <strong>LeadWhats-00001</strong>, etc. Quando o cliente responder, o nome do WhatsApp será capturado.</p>
            </div>
          </div>
        </div>

        <Textarea
          placeholder={`5511999998888\n5521988887777\n5531977776666\n\nou\n\n5511999998888, 5521988887777, 5531977776666`}
          className="bg-card border-border min-h-[200px] font-mono text-sm"
          value={numberList}
          onChange={(e) => setNumberList(e.target.value)}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {parsedNumbers.length > 0 ? (
              <>
                <Check className="w-5 h-5 text-primary" />
                <span className="text-sm text-foreground">
                  <strong>{parsedNumbers.length}</strong> números válidos detectados
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                Nenhum número detectado ainda
              </span>
            )}
          </div>
          
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" />
            Importar CSV
          </Button>
        </div>

        {parsedNumbers.length > 0 && (
          <div className="bg-card rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground mb-2">Prévia dos números:</p>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {parsedNumbers.slice(0, 20).map((num, idx) => (
                <Badge key={idx} variant="secondary" className="font-mono text-xs">
                  {num}
                </Badge>
              ))}
              {parsedNumbers.length > 20 && (
                <Badge variant="outline" className="text-xs">
                  +{parsedNumbers.length - 20} mais
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
