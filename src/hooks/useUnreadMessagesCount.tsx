import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserSectors } from "@/hooks/useUserSectors";

export function useUnreadMessagesCount() {
  const [count, setCount] = useState(0);
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const { role } = useUserRole();
  const { sectorIds, canSeeSector, loading: sectorsLoading } = useUserSectors();
  const lastFetchRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if user is admin/supervisor (can see all)
  const isAdminOrSupervisor = role === "super_admin" || role === "admin" || role === "supervisor";

  // Debounced fetch to prevent multiple rapid calls
  const fetchUnreadCount = useCallback(async () => {
    if (!user || !effectiveOrganizationId || sectorsLoading) {
      setCount(0);
      return;
    }

    // Throttle: don't fetch if last fetch was less than 2 seconds ago
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) {
      return;
    }
    lastFetchRef.current = now;

    try {
      // Get channels for this organization first
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", effectiveOrganizationId);

      if (!channels || channels.length === 0) {
        setCount(0);
        return;
      }

      const channelIds = channels.map(c => c.id);

      // For admins/supervisors: count all pending conversations they can see
      // For attendants: only count conversations in their sectors that are pending
      
      // Fetch conversation_assignments to get sector-filtered unread count
      let query = supabase
        .from("conversation_assignments")
        .select("id, conversation_phone, channel_id, sector_id, status, assigned_to")
        .in("channel_id", channelIds)
        .eq("status", "pending"); // Only count PENDING conversations (waiting in queue)

      const { data: assignments, error: assignmentsError } = await query;

      if (assignmentsError || !assignments) {
        setCount(0);
        return;
      }

      // Filter assignments based on sector access
      let filteredAssignments = assignments;

      if (!isAdminOrSupervisor) {
        // Attendants: filter by sector + only unassigned conversations
        filteredAssignments = assignments.filter(a => {
          // Must be unassigned (pending in queue)
          if (a.assigned_to) return false;
          
          // Must be in a sector the attendant can see
          return canSeeSector(a.sector_id);
        });
      } else {
        // Admins/Supervisors: filter only by sector (can see assigned too)
        filteredAssignments = assignments.filter(a => canSeeSector(a.sector_id));
      }

      // Count unique conversations
      setCount(filteredAssignments.length);
    } catch (err) {
      console.error("Error fetching unread count:", err);
      setCount(0);
    }
  }, [user, effectiveOrganizationId, sectorsLoading, isAdminOrSupervisor, canSeeSector, sectorIds]);

  // Debounced version for realtime updates
  const debouncedFetch = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      fetchUnreadCount();
    }, 500);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!user || !effectiveOrganizationId || sectorsLoading) {
      setCount(0);
      return;
    }

    // Initial fetch
    fetchUnreadCount();

    // Subscribe to realtime changes for conversation_assignments
    const channel = supabase
      .channel("unread-messages-count")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_assignments",
        },
        () => {
          debouncedFetch();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
        },
        (payload) => {
          // Only trigger for relevant changes
          if (payload.eventType === "INSERT" && (payload.new as any)?.direction === "inbound") {
            debouncedFetch();
          } else if (payload.eventType === "UPDATE") {
            debouncedFetch();
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [user, effectiveOrganizationId, sectorsLoading, fetchUnreadCount, debouncedFetch]);

  return count;
}
