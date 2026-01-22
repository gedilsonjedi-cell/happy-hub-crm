import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "./useEffectiveOrganizationId";

export function useUnreadMessagesCount() {
  const [count, setCount] = useState(0);
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const lastFetchRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced fetch to prevent multiple rapid calls
  const fetchUnreadCount = useCallback(async () => {
    if (!user || !effectiveOrganizationId) {
      setCount(0);
      return;
    }

    // Throttle: don't fetch if last fetch was less than 2 seconds ago
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) {
      return;
    }
    lastFetchRef.current = now;

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

    const { count: unreadCount, error } = await supabase
      .from("whatsapp_messages")
      .select("*", { count: "exact", head: true })
      .in("channel_id", channelIds)
      .eq("direction", "inbound")
      .eq("is_read", false);

    if (!error && unreadCount !== null) {
      setCount(unreadCount);
    }
  }, [user, effectiveOrganizationId]);

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
    if (!user || !effectiveOrganizationId) {
      setCount(0);
      return;
    }

    // Initial fetch
    fetchUnreadCount();

    // Subscribe to realtime changes - single subscription for both events
    const channel = supabase
      .channel("unread-messages-count")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to all events instead of separate INSERT/UPDATE
          schema: "public",
          table: "whatsapp_messages",
        },
        (payload) => {
          // Only trigger debounced fetch for relevant changes
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
  }, [user, effectiveOrganizationId, fetchUnreadCount, debouncedFetch]);

  return count;
}
