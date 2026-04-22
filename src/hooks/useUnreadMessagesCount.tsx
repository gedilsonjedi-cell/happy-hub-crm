import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadMessagesCount() {
  const [count, setCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch user data directly to avoid hook context issues
  useEffect(() => {
    let mounted = true;
    
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted || !user) {
          setIsReady(true);
          return;
        }
        
        setUserId(user.id);
        
        // Fetch role and organization in parallel
        const [roleResult, profileResult, sectorsResult] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
          supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle(),
          supabase.from("user_sectors").select("sector_id").eq("user_id", user.id)
        ]);
        
        if (!mounted) return;
        
        setRole(roleResult.data?.role || null);
        setOrganizationId(profileResult.data?.organization_id || null);
        setSectorIds(sectorsResult.data?.map(s => s.sector_id) || []);
        setIsReady(true);
      } catch {
        // silently fail
        if (mounted) setIsReady(true);
      }
    };
    
    fetchUserData();
    
    return () => { mounted = false; };
  }, []);

  // Check if user is admin/supervisor (can see all)
  const isAdminOrSupervisor = role === "super_admin" || role === "admin" || role === "supervisor";

  // Check if user can see a sector
  const canSeeSector = useCallback((sectorId: string | null) => {
    if (isAdminOrSupervisor) return true;
    if (!sectorId) return sectorIds.length === 0;
    return sectorIds.includes(sectorId);
  }, [isAdminOrSupervisor, sectorIds]);

  // Debounced fetch to prevent multiple rapid calls
  const fetchUnreadCount = useCallback(async () => {
    if (!userId || !organizationId || !isReady) {
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
      const { data: channels } = await (supabase as any)
        .from("channels_public")
        .select("id")
        .eq("organization_id", organizationId);

      if (!channels || channels.length === 0) {
        setCount(0);
        return;
      }

      const channelIds = channels.map(c => c.id);

      // Fetch conversation_assignments to get sector-filtered unread count
      // Include both 'pending' AND 'in_progress' without assignee (conversations waiting for an attendant)
      const { data: assignments, error: assignmentsError } = await supabase
        .from("conversation_assignments")
        .select("id, conversation_phone, channel_id, sector_id, status, assigned_to")
        .in("channel_id", channelIds)
        .in("status", ["pending", "in_progress"]);

      if (assignmentsError || !assignments) {
        setCount(0);
        return;
      }

      // Filter assignments based on sector access - only count UNASSIGNED conversations
      let filteredAssignments = assignments.filter(a => !a.assigned_to);

      if (!isAdminOrSupervisor) {
        // Attendants: filter by sector
        filteredAssignments = filteredAssignments.filter(a => canSeeSector(a.sector_id));
      } else {
        // Admins/Supervisors: filter only by sector
        filteredAssignments = filteredAssignments.filter(a => canSeeSector(a.sector_id));
      }

      // Count unique conversations
      setCount(filteredAssignments.length);
    } catch {
      // silently fail
      setCount(0);
    }
  }, [userId, organizationId, isReady, isAdminOrSupervisor, canSeeSector]);

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
    if (!userId || !organizationId || !isReady) {
      setCount(0);
      return;
    }

    // Initial fetch
    fetchUnreadCount();

    // Poll unread count every 30 seconds instead of realtime subscription
    // This eliminates 1 realtime connection per user
    const pollInterval = setInterval(fetchUnreadCount, 30000);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      clearInterval(pollInterval);
    };
  }, [userId, organizationId, isReady, fetchUnreadCount, debouncedFetch]);

  return count;
}
