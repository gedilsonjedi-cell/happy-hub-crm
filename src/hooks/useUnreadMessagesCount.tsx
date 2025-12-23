import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUnreadMessagesCount() {
  const [count, setCount] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }

    // Fetch initial count
    const fetchUnreadCount = async () => {
      const { count: unreadCount, error } = await supabase
        .from("whatsapp_messages")
        .select("*", { count: "exact", head: true })
        .eq("direction", "inbound")
        .eq("is_read", false);

      if (!error && unreadCount !== null) {
        setCount(unreadCount);
      }
    };

    fetchUnreadCount();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("unread-messages-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: "direction=eq.inbound",
        },
        () => {
          // Refetch count on new inbound message
          fetchUnreadCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_messages",
        },
        () => {
          // Refetch count when messages are marked as read
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return count;
}
