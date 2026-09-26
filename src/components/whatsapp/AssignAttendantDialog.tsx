import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { assignmentsWrite } from "@/lib/externalAssignments";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserSectors } from "@/hooks/useUserSectors";
import { toast } from "sonner";
import { User, UserCheck, Loader2, X, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  is_online?: boolean;
}

interface AssignAttendantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationPhone: string;
  channelId: string | null;
  currentAssignedTo: string | null;
  currentAssignedToName: string | null;
  conversationSectorId: string | null;
  onAssigned: (assignedTo: string | null, assignedToName: string | null) => void;
}

export const AssignAttendantDialog = ({
  open,
  onOpenChange,
  conversationPhone,
  channelId,
  currentAssignedTo,
  currentAssignedToName,
  conversationSectorId,
  onAssigned,
}: AssignAttendantDialogProps) => {
  const { user } = useAuth();
  const { isSuperAdmin, isAdmin, isSupervisor, isAtendente } = useUserRole();
  const { canInteractWithSector, sectorIds } = useUserSectors();
  const [attendants, setAttendants] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  
  // Atendentes só podem atribuir a si mesmos ou remover sua própria atribuição
  // Apenas admins e supervisores podem transferir atendimentos de outros
  const canTransferFromOthers = isSuperAdmin || isAdmin || isSupervisor;
  const isAssignedToSomeoneElse = currentAssignedTo && currentAssignedTo !== user?.id;
  const cannotTakeOver = isAtendente && isAssignedToSomeoneElse;
  
  // Verificar se o usuário pode interagir com o setor da conversa
  const canInteract = canInteractWithSector(conversationSectorId);

  useEffect(() => {
    const fetchAttendants = async () => {
      if (!open) return;
      
      setLoading(true);
      
      // Fetch profiles from same organization
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id || "")
        .single();

      if (userProfile?.organization_id) {
        let profilesData: Profile[] = [];
        
        if (conversationSectorId && !isSuperAdmin && !isAdmin) {
          const { data: sectorUsers } = await supabase
            .from("user_sectors")
            .select("user_id")
            .eq("sector_id", conversationSectorId);
          
          const sectorUserIds = sectorUsers?.map(su => su.user_id) || [];
          
          if (sectorUserIds.length > 0) {
            const { data } = await supabase
              .from("profiles")
              .select("user_id, display_name, email")
              .eq("organization_id", userProfile.organization_id)
              .eq("is_active", true)
              .in("user_id", sectorUserIds);
            if (data) profilesData = data;
          }
        } else {
          const { data } = await supabase
            .from("profiles")
            .select("user_id, display_name, email")
            .eq("organization_id", userProfile.organization_id)
            .eq("is_active", true);
          if (data) profilesData = data;
        }

        // Fetch availability status
        if (profilesData.length > 0) {
          const { data: availData } = await supabase
            .from("attendant_availability")
            .select("user_id, is_available")
            .eq("organization_id", userProfile.organization_id);
          
          const availMap = new Map<string, boolean>();
          availData?.forEach(a => availMap.set(a.user_id, a.is_available ?? false));
          
          profilesData = profilesData.map(p => ({
            ...p,
            is_online: availMap.get(p.user_id) ?? false,
          }));
          
          // Sort: online first, then alphabetical
          profilesData.sort((a, b) => {
            if (a.is_online && !b.is_online) return -1;
            if (!a.is_online && b.is_online) return 1;
            const nameA = a.display_name || a.email || "";
            const nameB = b.display_name || b.email || "";
            return nameA.localeCompare(nameB);
          });
        }

        setAttendants(profilesData);
      }
      
      setLoading(false);
    };

    fetchAttendants();
  }, [open, user?.id, conversationSectorId, isSuperAdmin, isAdmin]);

  const handleAssign = async (attendant: Profile | null) => {
    if (!channelId) {
      toast.error("Canal não identificado");
      return;
    }

    setAssigning(attendant?.user_id || "remove");
    
    const normalizedPhone = conversationPhone.replace(/\D/g, '');
    
    // Capture previous assignment for transfer notification
    const previousAssignedTo = currentAssignedTo;
    const previousAssignedToName = currentAssignedToName;

    try {
      if (attendant) {
        const { error } = await assignmentsWrite("upsert_assignment", {
          payload: {
            conversation_phone: normalizedPhone,
            channel_id: channelId,
            assigned_to: attendant.user_id,
            status: "active",
          },
        });
        if (error) throw new Error(error.message);

        const attendantName = attendant.display_name || attendant.email || "Atendente";
        const isTransfer = previousAssignedTo && previousAssignedTo !== attendant.user_id;
        if (isTransfer) {
          toast.success(
            `Atendimento transferido de ${previousAssignedToName} para ${attendantName}`,
            {
              description: "O atendente anterior foi notificado sobre a transferência.",
              duration: 5000,
            }
          );
        } else {
          toast.success(`Conversa atribuída para ${attendantName}`);
        }
        onAssigned(attendant.user_id, attendantName);
      } else {
        await assignmentsWrite("update_by_phone", {
          channel_id: channelId,
          phone: normalizedPhone,
          assigned_to: null,
          assigned_at: null,
        });
        toast.success("Atribuição removida");
        onAssigned(null, null);
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Error assigning attendant:", error);
      toast.error("Erro ao atribuir atendente");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            Atribuir Atendente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Alerta quando usuário não tem acesso ao setor da conversa */}
          {!canInteract && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Você não tem acesso a este departamento. Não é possível atribuir atendentes para conversas fora do seu departamento.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Alerta para atendentes que não podem transferir */}
          {canInteract && cannotTakeOver && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Este atendimento já está atribuído a outro atendente. 
                Apenas administradores e supervisores podem transferir atendimentos.
              </AlertDescription>
            </Alert>
          )}
          
          {currentAssignedTo && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Atendente atual:</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {currentAssignedToName?.charAt(0) || "A"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm">{currentAssignedToName}</span>
                </div>
                {/* Só mostra botão de remover se pode transferir ou é o próprio atendente E tem acesso ao setor */}
                {canInteract && (canTransferFromOthers || currentAssignedTo === user?.id) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAssign(null)}
                    disabled={assigning !== null}
                    className="text-destructive hover:text-destructive"
                  >
                    {assigning === "remove" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          <ScrollArea className="h-[15.25rem]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : attendants.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum atendente encontrado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {attendants.map((attendant) => {
                  const isCurrentAssigned = attendant.user_id === currentAssignedTo;
                  const displayName = attendant.display_name || attendant.email || "Atendente";
                  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                  
                  // Atendente só pode se atribuir, não pode pegar de outros
                  // Também bloquear se não tem acesso ao setor
                  const isBlocked = !canInteract || (cannotTakeOver && attendant.user_id !== currentAssignedTo);

                  return (
                    <button
                      key={attendant.user_id}
                      onClick={() => !isCurrentAssigned && !isBlocked && handleAssign(attendant)}
                      disabled={isCurrentAssigned || assigning !== null || isBlocked || !canInteract}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                        isCurrentAssigned
                          ? "bg-primary/10 border border-primary/30 cursor-default"
                          : isBlocked
                          ? "opacity-50 cursor-not-allowed border border-transparent"
                          : "hover:bg-muted/50 border border-transparent"
                      )}
                    >
                      <div className="relative">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className={cn(
                            "text-sm font-medium",
                            isCurrentAssigned ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}>
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn(
                          "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
                          attendant.is_online ? "bg-success" : "bg-destructive"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm truncate">{displayName}</p>
                          <span className={cn("text-[0.625rem] font-medium", attendant.is_online ? "text-success" : "text-muted-foreground")}>
                            {attendant.is_online ? "Online" : "Offline"}
                          </span>
                        </div>
                        {attendant.email && attendant.display_name && (
                          <p className="text-xs text-muted-foreground truncate">{attendant.email}</p>
                        )}
                      </div>
                      {isCurrentAssigned && (
                        <Badge variant="secondary" className="shrink-0">
                          Atual
                        </Badge>
                      )}
                      {assigning === attendant.user_id && (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
