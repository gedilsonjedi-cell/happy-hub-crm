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
  const [recordId, setRecordId] = useState<string | null>(null);

  // Fetch current status - search by user_id first, then narrow by org
  useEffect(() => {
    async function fetchStatus() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      // First try with organization_id filter
      let query = supabase
        .from("attendant_availability")
        .select("id, is_available, organization_id")
        .eq("user_id", user.id);

      if (effectiveOrganizationId) {
        query = query.eq("organization_id", effectiveOrganizationId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error("Error fetching attendant status:", error);
        // Fallback: try without org filter to find any record for this user
        const { data: fallbackData } = await supabase
          .from("attendant_availability")
          .select("id, is_available, organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (fallbackData) {
          setRecordId(fallbackData.id);
          setIsOnline(fallbackData.is_available ?? false);
          // If record has no org, update it
          if (!fallbackData.organization_id && effectiveOrganizationId) {
            await supabase
              .from("attendant_availability")
              .update({ organization_id: effectiveOrganizationId })
              .eq("id", fallbackData.id);
          }
        }
      } else if (data) {
        setRecordId(data.id);
        setIsOnline(data.is_available ?? false);
      } else {
        setRecordId(null);
        setIsOnline(false);
      }

      setLoading(false);
    }

    fetchStatus();
  }, [user?.id, effectiveOrganizationId]);

  // Toggle status
  const toggleStatus = useCallback(async () => {
    if (!user?.id) {
      toast.error("Usuário não autenticado");
      return;
    }

    // Refresh session if JWT is expired
    try {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn("Session refresh failed, attempting toggle anyway:", refreshError.message);
      }
    } catch (e) {
      console.warn("Session refresh exception:", e);
    }

    const newStatus = !isOnline;
    setIsOnline(newStatus); // Optimistic update

    try {
      if (recordId) {
        // Update existing record
        const { error } = await supabase
          .from("attendant_availability")
          .update({
            is_available: newStatus,
            organization_id: effectiveOrganizationId || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq("id", recordId);

        if (error) throw error;
      } else {
        // Insert new record
        const { data: inserted, error } = await supabase
          .from("attendant_availability")
          .insert({
            user_id: user.id,
            organization_id: effectiveOrganizationId,
            is_available: newStatus,
            current_conversations: 0,
            max_conversations: 10,
          })
          .select("id")
          .single();

        if (error) throw error;
        if (inserted) setRecordId(inserted.id);
      }

      toast.success(newStatus ? "Você está online" : "Você está offline");
    } catch (err: any) {
      console.error("Error updating status:", err);
      setIsOnline(!newStatus); // Revert on error
      toast.error(`Erro ao atualizar status: ${err.message || "tente novamente"}`);
    }
  }, [user?.id, effectiveOrganizationId, isOnline, recordId]);

  return { isOnline, loading, toggleStatus };
}
