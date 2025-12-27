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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { User, UserCheck, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface AssignAttendantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationPhone: string;
  channelId: string | null;
  currentAssignedTo: string | null;
  currentAssignedToName: string | null;
  onAssigned: (assignedTo: string | null, assignedToName: string | null) => void;
}

export const AssignAttendantDialog = ({
  open,
  onOpenChange,
  conversationPhone,
  channelId,
  currentAssignedTo,
  currentAssignedToName,
  onAssigned,
}: AssignAttendantDialogProps) => {
  const { user } = useAuth();
  const [attendants, setAttendants] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

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
        const { data } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .eq("organization_id", userProfile.organization_id)
          .eq("is_active", true);

        if (data) {
          setAttendants(data);
        }
      }
      
      setLoading(false);
    };

    fetchAttendants();
  }, [open, user?.id]);

  const handleAssign = async (attendant: Profile | null) => {
    if (!channelId) {
      toast.error("Canal não identificado");
      return;
    }

    setAssigning(attendant?.user_id || "remove");
    
    const normalizedPhone = conversationPhone.replace(/\D/g, '');

    try {
      if (attendant) {
        // Upsert assignment
        const { error } = await supabase
          .from("conversation_assignments")
          .upsert({
            conversation_phone: normalizedPhone,
            channel_id: channelId,
            assigned_to: attendant.user_id,
            assigned_at: new Date().toISOString(),
            status: "active"
          }, {
            onConflict: "conversation_phone,channel_id"
          });

        if (error) {
          // If upsert fails, try update then insert
          const { error: updateError } = await supabase
            .from("conversation_assignments")
            .update({
              assigned_to: attendant.user_id,
              assigned_at: new Date().toISOString()
            })
            .eq("conversation_phone", normalizedPhone)
            .eq("channel_id", channelId);

          if (updateError) {
            // Try insert
            await supabase
              .from("conversation_assignments")
              .insert({
                conversation_phone: normalizedPhone,
                channel_id: channelId,
                assigned_to: attendant.user_id,
                assigned_at: new Date().toISOString(),
                status: "active"
              });
          }
        }

        const attendantName = attendant.display_name || attendant.email || "Atendente";
        toast.success(`Conversa atribuída para ${attendantName}`);
        onAssigned(attendant.user_id, attendantName);
      } else {
        // Remove assignment
        await supabase
          .from("conversation_assignments")
          .update({ assigned_to: null, assigned_at: null })
          .eq("conversation_phone", normalizedPhone)
          .eq("channel_id", channelId);

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
              </div>
            </div>
          )}

          <ScrollArea className="h-[300px]">
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

                  return (
                    <button
                      key={attendant.user_id}
                      onClick={() => !isCurrentAssigned && handleAssign(attendant)}
                      disabled={isCurrentAssigned || assigning !== null}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                        isCurrentAssigned
                          ? "bg-primary/10 border border-primary/30 cursor-default"
                          : "hover:bg-muted/50 border border-transparent"
                      )}
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className={cn(
                          "text-sm font-medium",
                          isCurrentAssigned ? "bg-primary text-primary-foreground" : "bg-muted"
                        )}>
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{displayName}</p>
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
