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
import { Building2 } from "lucide-react";

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

  if (loading) {
    return null;
  }

  if (sectors.length === 0) {
    return null;
  }

  return (
    <Select
      value={value || "all"}
      onValueChange={(v) => onChange(v === "all" ? null : v)}
    >
      <SelectTrigger className="h-9 text-sm bg-muted/30 border-border w-full">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <SelectValue placeholder="Filtrar por departamento" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover">
        <SelectItem value="all">Todos os departamentos</SelectItem>
        <SelectItem value="none">Sem departamento</SelectItem>
        {sectors.map((sector) => (
          <SelectItem key={sector.id} value={sector.id}>
            {sector.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
