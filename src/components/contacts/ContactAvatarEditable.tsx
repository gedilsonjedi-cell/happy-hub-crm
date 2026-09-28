import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./ContactAvatar";
import { ContactAvatarDialog } from "./ContactAvatarDialog";

export const NO_LEAD_HINT = "Salve o contato como lead para adicionar foto";

interface EditableProps {
  name: string | null;
  phone: string | null;
  organizationId: string | null | undefined;
  leadId: string | null;
  avatarPath: string | null;
  className?: string;
  fallbackClassName?: string;
  iconClassName?: string;
  onChanged?: (path: string | null) => void;
}

/** Avatar com botão "Alterar foto". Sem lead salvo, o botão fica desativado com dica. */
export function ContactAvatarEditable({
  name, phone, organizationId, leadId, avatarPath, className, fallbackClassName, iconClassName, onChanged,
}: EditableProps) {
  const [open, setOpen] = useState(false);
  const canEdit = !!leadId && !!organizationId;
  const label = canEdit ? (avatarPath ? "Alterar foto" : "Adicionar foto") : NO_LEAD_HINT;

  return (
    <>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              aria-label={label}
              disabled={!canEdit}
              onClick={(e) => { e.stopPropagation(); setOpen(true); }}
              className={cn("group relative shrink-0 rounded-full disabled:cursor-not-allowed", className)}
            >
              <ContactAvatar
                name={name}
                avatarPath={avatarPath}
                className="h-full w-full"
                fallbackClassName={fallbackClassName}
                iconClassName={iconClassName}
              />
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 transition-opacity",
                  canEdit && "group-hover:opacity-100 group-focus-visible:opacity-100"
                )}
              >
                <Camera className="h-4 w-4 text-foreground" />
              </span>
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {canEdit && (
        <ContactAvatarDialog
          open={open}
          onOpenChange={setOpen}
          leadId={leadId!}
          organizationId={organizationId!}
          phone={phone}
          name={name}
          currentPath={avatarPath}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

type LeadRow = { id: string; name: string | null; tags: string[] | null; avatar_path: string | null };

/** Resolve o lead da conversa pelo telefone, igual ao painel de detalhes (sufixo 9, 8, 7). */
export async function findLeadForPhone(organizationId: string, phone: string): Promise<LeadRow | null> {
  const digits = phone.replace(/\D/g, "");
  for (const len of [9, 8, 7]) {
    const suffix = digits.slice(-len);
    if (suffix.length < len) continue;
    const { data, error } = await supabase
      .from("leads")
      .select("id, name, tags, avatar_path")
      .eq("organization_id", organizationId)
      .ilike("phone", `%${suffix}`);
    if (error) throw error;
    if (data && data.length > 0) {
      const rows = data as LeadRow[];
      const score = (l: LeadRow) =>
        (l.avatar_path ? 1000 : 0) +
        (l.tags && l.tags.length ? 100 : 0) +
        (l.name && !l.name.startsWith("LeadWhats-") && !l.name.startsWith("WhatsApp ") ? 50 : 0);
      return rows.sort((a, b) => score(b) - score(a))[0];
    }
  }
  return null;
}

export function ChatHeaderContactAvatar({
  name, phone, organizationId,
}: { name: string | null; phone: string; organizationId: string | null | undefined }) {
  const { data: lead, refetch } = useQuery({
    queryKey: ["lead-avatar-by-phone", organizationId, phone],
    enabled: !!organizationId && !!phone,
    queryFn: () => findLeadForPhone(organizationId!, phone),
    staleTime: 60_000,
  });
  return (
    <ContactAvatarEditable
      name={name}
      phone={phone}
      organizationId={organizationId}
      leadId={lead?.id ?? null}
      avatarPath={lead?.avatar_path ?? null}
      className="h-10 w-10"
      fallbackClassName="bg-primary/10 text-primary text-sm"
      onChanged={() => { void refetch(); }}
    />
  );
}
