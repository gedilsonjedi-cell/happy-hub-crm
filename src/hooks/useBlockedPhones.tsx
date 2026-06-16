import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a Set of blacklisted phones for the given organization.
 * Includes both full normalized phone and 8-digit suffix to match conversation phones
 * regardless of the 9th-digit normalization.
 */
export function useBlockedPhones(organizationId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["blocked-phones", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as string[];
      const { data, error } = await supabase
        .from("blacklist")
        .select("phone")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data || []).map((r: { phone: string }) => r.phone);
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const blockedSet = useMemo(() => {
    const set = new Set<string>();
    for (const raw of query.data || []) {
      const clean = String(raw).replace(/\D/g, "");
      if (!clean) continue;
      set.add(clean);
      // 8-digit suffix for cross-matching with/without 9th digit
      if (clean.length >= 8) set.add(clean.slice(-8));
    }
    return set;
  }, [query.data]);

  const isBlocked = useCallback(
    (phone: string | null | undefined) => {
      if (!phone) return false;
      const clean = phone.replace(/\D/g, "");
      if (!clean) return false;
      if (blockedSet.has(clean)) return true;
      if (clean.length >= 8 && blockedSet.has(clean.slice(-8))) return true;
      return false;
    },
    [blockedSet]
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["blocked-phones", organizationId] });
  }, [queryClient, organizationId]);

  return { blockedSet, isBlocked, invalidate, isLoading: query.isLoading };
}
