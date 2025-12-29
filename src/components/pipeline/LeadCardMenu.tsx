import { useState } from "react";
import { MoreVertical, Edit, Trash2, Eye, Tag, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  stage_id: string | null;
  tags: string[] | null;
  created_at: string;
  notes?: string | null;
}

interface LeadCardMenuProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onViewDetails: (lead: Lead) => void;
  onDeleted: () => void;
}

export const LeadCardMenu = ({ lead, onEdit, onViewDetails, onDeleted }: LeadCardMenuProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("id", lead.id);

      if (error) throw error;

      toast.success("Lead excluído com sucesso");
      onDeleted();
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast.error("Erro ao excluir lead");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border-border z-50">
          <DropdownMenuItem 
            className="gap-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(lead);
            }}
          >
            <Eye className="w-4 h-4" />
            Ver detalhes
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="gap-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(lead);
            }}
          >
            <Edit className="w-4 h-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            className="gap-2 cursor-pointer text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{lead.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
