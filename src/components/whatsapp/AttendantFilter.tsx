import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Check, ChevronDown, Search, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

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
    if (value && value !== "none" && attendants.length > 0 && !attendants.find(a => a.id === value)) {
      onChange(null);
    }
  }, [attendants, value, onChange]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return attendants;
    return attendants.filter((a) => a.name.toLowerCase().includes(term));
  }, [attendants, search]);

  if (loading) {
    return null;
  }

  if (attendants.length === 0) {
    return null;
  }

  const currentLabel =
    value === "none"
      ? "Sem atendente"
      : value
      ? attendants.find((a) => a.id === value)?.name || "Atendente"
      : "Todos os atendentes";

  const handleSelect = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 text-sm bg-muted/30 border-border w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate">{currentLabel}</span>
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[260px] bg-popover" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar atendente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
              !value && "font-medium"
            )}
          >
            <Check className={cn("w-3.5 h-3.5", !value ? "opacity-100" : "opacity-0")} />
            <span>Todos os atendentes</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelect("none")}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
              value === "none" && "font-medium"
            )}
          >
            <Check className={cn("w-3.5 h-3.5", value === "none" ? "opacity-100" : "opacity-0")} />
            <UserX className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Sem atendente</span>
          </button>
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Nenhum atendente encontrado
            </div>
          )}
          {filtered.map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() => handleSelect(att.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
                value === att.id && "font-medium"
              )}
            >
              <Check className={cn("w-3.5 h-3.5", value === att.id ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{att.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
