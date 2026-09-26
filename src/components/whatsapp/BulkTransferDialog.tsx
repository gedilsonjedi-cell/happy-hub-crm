import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { assignmentsWrite } from "@/lib/externalAssignments";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";
import { User, UserCheck, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  is_online?: boolean;
}

interface SelectedConversation {
  id?: string;
  phone: string;
  channelId: string | null;
  assignedTo: string | null;
  sectorId: string | null;
}

interface BulkTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedConversations: SelectedConversation[];
  onTransferred: () => void;
}

export const BulkTransferDialog = ({
  open,
  onOpenChange,
  selectedConversations,
  onTransferred,
}: BulkTransferDialogProps) => {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [attendants, setAttendants] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [selectedAttendant, setSelectedAttendant] = useState<Profile | null>(null);

  useEffect(() => {
    const fetchAttendants = async () => {
      if (!open || !effectiveOrganizationId) return;
      setLoading(true);
      setSelectedAttendant(null);

      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .eq("organization_id", effectiveOrganizationId)
        .eq("is_active", true);

      let profilesData: Profile[] = data || [];

      if (profilesData.length > 0) {
        const { data: availData } = await supabase
          .from("attendant_availability")
          .select("user_id, is_available")
          .eq("organization_id", effectiveOrganizationId);

        const availMap = new Map<string, boolean>();
        availData?.forEach(a => availMap.set(a.user_id, a.is_available ?? false));

        profilesData = profilesData.map(p => ({
          ...p,
          is_online: availMap.get(p.user_id) ?? false,
        }));

        profilesData.sort((a, b) => {
          if (a.is_online && !b.is_online) return -1;
          if (!a.is_online && b.is_online) return 1;
          const nameA = a.display_name || a.email || "";
          const nameB = b.display_name || b.email || "";
          return nameA.localeCompare(nameB);
        });
      }

      setAttendants(profilesData);
      setLoading(false);
    };

    fetchAttendants();
  }, [open, effectiveOrganizationId]);

  const handleBulkTransfer = async () => {
    if (!selectedAttendant) return;
    setTransferring(true);

    let successCount = 0;
    let errorCount = 0;

    for (const conv of selectedConversations) {
      const normalizedPhone = conv.phone.replace(/\D/g, "");
      const channelId = conv.channelId;

      if (!channelId) {
        errorCount++;
        continue;
      }

      try {
        const { error } = conv.id
          ? await assignmentsWrite("update_by_phone", {
              id: conv.id,
              assigned_to: selectedAttendant.user_id,
              assigned_at: new Date().toISOString(),
              status: "active",
            })
          : await assignmentsWrite("update_by_phone", {
              channel_id: channelId,
              phone: normalizedPhone,
              assigned_to: selectedAttendant.user_id,
              assigned_at: new Date().toISOString(),
              status: "active",
            });
        if (error) errorCount++;
        else successCount++;
      } catch {
        errorCount++;
      }
    }

    const attendantName = selectedAttendant.display_name || selectedAttendant.email || "Atendente";

    if (successCount > 0) {
      toast.success(
        `${successCount} conversa${successCount > 1 ? "s" : ""} transferida${successCount > 1 ? "s" : ""} para ${attendantName}`,
        errorCount > 0
          ? { description: `${errorCount} falha${errorCount > 1 ? "s" : ""}` }
          : undefined
      );
    } else {
      toast.error("Nenhuma conversa foi transferida");
    }

    setTransferring(false);
    onOpenChange(false);
    onTransferred();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Transferir em Lote
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-2">
          {selectedConversations.length} conversa{selectedConversations.length > 1 ? "s" : ""} selecionada{selectedConversations.length > 1 ? "s" : ""}
        </div>

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
                const displayName = attendant.display_name || attendant.email || "Atendente";
                const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                const isSelected = selectedAttendant?.user_id === attendant.user_id;

                return (
                  <button
                    key={attendant.user_id}
                    onClick={() => setSelectedAttendant(isSelected ? null : attendant)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left border",
                      isSelected
                        ? "bg-primary/10 border-primary/30"
                        : "hover:bg-muted/50 border-transparent"
                    )}
                  >
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className={cn(
                          "text-sm font-medium",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
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
                    {isSelected && (
                      <Badge variant="secondary" className="shrink-0">
                        <UserCheck className="w-3 h-3 mr-1" />
                        Selecionado
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={transferring}>
            Cancelar
          </Button>
          <Button
            onClick={handleBulkTransfer}
            disabled={!selectedAttendant || transferring}
            className="gap-2"
          >
            {transferring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Transferindo...
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                Transferir {selectedConversations.length} conversa{selectedConversations.length > 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
