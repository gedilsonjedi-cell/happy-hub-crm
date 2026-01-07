import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, Loader2 } from "lucide-react";

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface AddToPortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactPhone: string;
  contactName: string | null;
}

export function AddToPortfolioDialog({ 
  open, 
  onOpenChange, 
  contactPhone, 
  contactName 
}: AddToPortfolioDialogProps) {
  const { user } = useAuth();
  const { effectiveOrganizationId: organizationId } = useEffectiveOrganizationId();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  
  const canManageAll = isAdmin || isSuperAdmin;

  // Check if lead exists and get its ID
  const { data: leadData, isLoading: loadingLead } = useQuery({
    queryKey: ['lead-by-phone', contactPhone, organizationId],
    queryFn: async () => {
      if (!organizationId) return null;

      const { data, error } = await supabase
        .from('leads')
        .select('id, name')
        .eq('phone', contactPhone)
        .eq('organization_id', organizationId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: open && !!organizationId,
  });

  // Check if already in portfolio
  const { data: existingPortfolio, isLoading: loadingPortfolio } = useQuery({
    queryKey: ['portfolio-check', leadData?.id],
    queryFn: async () => {
      if (!leadData?.id || !organizationId) return null;

      const { data, error } = await supabase
        .from('client_portfolios')
        .select('id, user_id')
        .eq('lead_id', leadData.id)
        .eq('organization_id', organizationId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: open && !!leadData?.id && !!organizationId,
  });

  // Fetch organization users for assignment
  const { data: orgUsers = [] } = useQuery({
    queryKey: ['org-users-portfolio', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, email')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) throw error;
      return data as Profile[];
    },
    enabled: open && !!organizationId && canManageAll,
  });

  // Create lead if not exists
  const createLead = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user?.id) throw new Error('Missing data');

      const { data, error } = await supabase
        .from('leads')
        .insert({
          phone: contactPhone,
          name: contactName || `WhatsApp ${contactPhone}`,
          user_id: user.id,
          organization_id: organizationId,
          status: 'new',
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Add to portfolio
  const addToPortfolio = useMutation({
    mutationFn: async (leadId: string) => {
      const targetUserId = canManageAll && selectedUserId ? selectedUserId : user?.id;
      
      if (!targetUserId || !organizationId) throw new Error('Missing data');

      const { error } = await supabase
        .from('client_portfolios')
        .insert({
          lead_id: leadId,
          user_id: targetUserId,
          organization_id: organizationId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-check'] });
      toast.success("Cliente adicionado à carteira!");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao adicionar à carteira", {
        description: error.message,
      });
    },
  });

  const handleSubmit = async () => {
    try {
      let leadId = leadData?.id;

      // Create lead if doesn't exist
      if (!leadId) {
        const newLead = await createLead.mutateAsync();
        leadId = newLead.id;
      }

      // Add to portfolio
      await addToPortfolio.mutateAsync(leadId);
    } catch (error: any) {
      toast.error("Erro ao processar", { description: error.message });
    }
  };

  const isLoading = loadingLead || loadingPortfolio || createLead.isPending || addToPortfolio.isPending;
  const alreadyInPortfolio = !!existingPortfolio;

  const getOwnerName = () => {
    if (!existingPortfolio) return '';
    const owner = orgUsers.find(u => u.user_id === existingPortfolio.user_id);
    return owner?.display_name || owner?.email || 'um atendente';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Adicionar à Carteira de Clientes
          </DialogTitle>
          <DialogDescription>
            Adicione este contato à carteira para direcionar automaticamente as conversas.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-medium">{contactName || contactPhone}</p>
            <p className="text-sm text-muted-foreground">{contactPhone}</p>
          </div>

          {alreadyInPortfolio ? (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <p className="text-sm text-warning">
                Este cliente já está na carteira de {getOwnerName()}.
              </p>
            </div>
          ) : (
            <>
              {canManageAll && (
                <div className="space-y-2">
                  <Label>Atribuir para</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um atendente (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgUsers.map((orgUser) => (
                        <SelectItem key={orgUser.user_id} value={orgUser.user_id}>
                          {orgUser.display_name || orgUser.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Se não selecionar, será atribuído a você.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || alreadyInPortfolio}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              "Adicionar à Carteira"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
