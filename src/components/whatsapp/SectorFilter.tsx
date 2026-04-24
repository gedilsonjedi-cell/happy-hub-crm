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
import { Building2, Check, ChevronDown, Search, FolderX } from "lucide-react";
import { cn } from "@/lib/utils";

interface Sector {
  id: string;
  name: string;
}

interface SectorFilterProps {
  value: string | null;
  onChange: (sectorId: string | null) => void;
}

export function SectorFilter({ value, onChange }: SectorFilterProps) {
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchSectors = async () => {
      if (!effectiveOrganizationId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("sectors")
        .select("id, name")
        .eq("organization_id", effectiveOrganizationId)
        .order("name");

      if (!error && data) {
        setSectors(data);
      }
      setLoading(false);
    };

    fetchSectors();
  }, [effectiveOrganizationId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sectors;
    return sectors.filter((s) => s.name.toLowerCase().includes(term));
  }, [sectors, search]);

  if (loading) {
    return null;
  }

  if (sectors.length === 0) {
    return null;
  }

  const currentLabel =
    value === "none"
      ? "Sem departamento"
      : value
      ? sectors.find((s) => s.id === value)?.name || "Departamento"
      : "Departamentos";

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
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
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
              placeholder="Buscar departamento..."
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
            <span>Todos os departamentos</span>
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
            <FolderX className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Sem departamento</span>
          </button>
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Nenhum departamento encontrado
            </div>
          )}
          {filtered.map((sector) => (
            <button
              key={sector.id}
              type="button"
              onClick={() => handleSelect(sector.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
                value === sector.id && "font-medium"
              )}
            >
              <Check className={cn("w-3.5 h-3.5", value === sector.id ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{sector.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
