import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";

interface Attendant {
  id: string;
  name: string;
}

interface AttendantFilterProps {
  value: string | null;
  onChange: (attendantId: string | null) => void;
  selectedSectorId?: string | null;
}

export function AttendantFilter({ value, onChange, selectedSectorId }: AttendantFilterProps) {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttendants = async () => {
      if (!effectiveOrganizationId) {
        setLoading(false);
        return;
      }

      // If a sector is selected, fetch only users assigned to that sector
      if (selectedSectorId && selectedSectorId !== "none") {
        const { data: sectorUsers, error: sectorError } = await supabase
          .from("user_sectors")
          .select("user_id")
          .eq("sector_id", selectedSectorId);

        if (sectorError || !sectorUsers || sectorUsers.length === 0) {
          setAttendants([]);
          setLoading(false);
          return;
        }

        const userIds = sectorUsers.map(su => su.user_id);

        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .eq("organization_id", effectiveOrganizationId)
          .eq("is_active", true)
          .in("user_id", userIds);

        if (!error && data) {
          const list: Attendant[] = data.map((p) => ({
            id: p.user_id,
            name: p.display_name || p.email || "Usuário",
          }));
          list.sort((a, b) => a.name.localeCompare(b.name));
          setAttendants(list);
        } else {
          setAttendants([]);
        }
      } else {
        // No sector selected - show all attendants
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .eq("organization_id", effectiveOrganizationId)
          .eq("is_active", true);

        if (!error && data) {
          const list: Attendant[] = data.map((p) => ({
            id: p.user_id,
            name: p.display_name || p.email || "Usuário",
          }));
          list.sort((a, b) => a.name.localeCompare(b.name));
          setAttendants(list);
        }
      }
      setLoading(false);
    };

    fetchAttendants();
  }, [effectiveOrganizationId, selectedSectorId]);

  // Reset attendant filter if selected attendant is no longer in the filtered list
  useEffect(() => {
    if (value && attendants.length > 0 && !attendants.find(a => a.id === value)) {
      onChange(null);
    }
  }, [attendants, value, onChange]);

  if (loading) {
    return null;
  }

  if (attendants.length === 0) {
    return null;
  }

  return (
    <Select
      value={value || "all"}
      onValueChange={(v) => onChange(v === "all" ? null : v)}
    >
      <SelectTrigger className="h-9 text-sm bg-muted/30 border-border w-full">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <SelectValue placeholder="Filtrar por atendente" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover">
        <SelectItem value="all">Todos os atendentes</SelectItem>
        {attendants.map((att) => (
          <SelectItem key={att.id} value={att.id}>
            {att.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
