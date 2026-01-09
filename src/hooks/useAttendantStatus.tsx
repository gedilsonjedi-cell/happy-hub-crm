import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { toast } from "sonner";

export function useAttendantStatus() {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch current status
  useEffect(() => {
    async function fetchStatus() {
      if (!user?.id || !effectiveOrganizationId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("attendant_availability")
        .select("is_available")
        .eq("user_id", user.id)
        .eq("organization_id", effectiveOrganizationId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching attendant status:", error);
      }

      setIsOnline(data?.is_available ?? false);
      setLoading(false);
    }

    fetchStatus();
  }, [user?.id, effectiveOrganizationId]);

  // Toggle status
  const toggleStatus = useCallback(async () => {
    if (!user?.id || !effectiveOrganizationId) return;

    const newStatus = !isOnline;
    setIsOnline(newStatus); // Optimistic update

    // Check if record exists
    const { data: existing } = await supabase
      .from("attendant_availability")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", effectiveOrganizationId)
      .maybeSingle();

    let error;

    if (existing) {
      // Update existing record
      const result = await supabase
        .from("attendant_availability")
        .update({
          is_available: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      error = result.error;
    } else {
      // Insert new record
      const result = await supabase.from("attendant_availability").insert({
        user_id: user.id,
        organization_id: effectiveOrganizationId,
        is_available: newStatus,
        current_conversations: 0,
        max_conversations: 10,
      });
      error = result.error;
    }

    if (error) {
      console.error("Error updating status:", error);
      setIsOnline(!newStatus); // Revert on error
      toast.error("Erro ao atualizar status");
    } else {
      toast.success(newStatus ? "Você está online" : "Você está offline");
    }
  }, [user?.id, effectiveOrganizationId, isOnline]);

  return { isOnline, loading, toggleStatus };
}
