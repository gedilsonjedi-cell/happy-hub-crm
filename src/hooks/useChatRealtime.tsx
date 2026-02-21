import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RealtimeCallbacks {
  onNewMessage: (payload: {
    channelId: string;
    senderPhone: string;
    content: string;
    direction: string;
    createdAt: string;
    isRead: boolean;
    senderName?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => void;
  onAssignmentChange: (payload: {
    id: string;
    conversationPhone: string;
    channelId: string | null;
    assignedTo: string | null;
    status: string | null;
    sectorId: string | null;
    leadId: string | null;
    updatedAt: string;
  }) => void;
}

/**
 * useChatRealtime — Consolidated Realtime hook
 *
 * Replaces:
 * - Multiple per-channel subscriptions in AtendimentoV2
 * - The separate subscription in useUnreadMessagesCount for whatsapp_messages
 * - The global (unfiltered) subscription in useWhatsAppNotifications
 *
 * Reduces from ~12 subscriptions/user to 2 subscriptions total:
 * 1. whatsapp_messages filtered by channel_id IN (...)
 * 2. conversation_assignments filtered by channel_id IN (...)
 */
export function useChatRealtime(
  channelIds: string[],
  callbacks: RealtimeCallbacks
) {
  const channelIdsRef = useRef<string[]>(channelIds);
  const callbacksRef = useRef<RealtimeCallbacks>(callbacks);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Keep refs up to date without re-subscribing
  useEffect(() => {
    channelIdsRef.current = channelIds;
  }, [channelIds]);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const setupSubscription = useCallback(() => {
    if (channelIdsRef.current.length === 0) return;

    // Clean up previous subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }

    const channelFilter = channelIdsRef.current.join(",");

    const channel = supabase
      .channel(`chat-realtime-${channelFilter.slice(0, 40)}`)
      // 1. Listen for new messages on these channels only
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `channel_id=in.(${channelFilter})`,
        },
        (payload) => {
          const msg = payload.new as {
            channel_id: string;
            sender_phone: string;
            content: string;
            direction: string;
            created_at: string;
            is_read: boolean;
            sender_name?: string | null;
            metadata?: Record<string, unknown> | null;
          };

          callbacksRef.current.onNewMessage({
            channelId: msg.channel_id,
            senderPhone: msg.sender_phone,
            content: msg.content,
            direction: msg.direction,
            createdAt: msg.created_at,
            isRead: msg.is_read,
            senderName: msg.sender_name,
            metadata: msg.metadata,
          });
        }
      )
      // 2. Listen for assignment changes on these channels
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_assignments",
          filter: `channel_id=in.(${channelFilter})`,
        },
        (payload) => {
          const data = (payload.new || payload.old) as {
            id: string;
            conversation_phone: string;
            channel_id: string | null;
            assigned_to: string | null;
            status: string | null;
            sector_id: string | null;
            lead_id: string | null;
            updated_at: string;
          };

          if (!data) return;

          callbacksRef.current.onAssignmentChange({
            id: data.id,
            conversationPhone: data.conversation_phone,
            channelId: data.channel_id,
            assignedTo: data.assigned_to,
            status: data.status,
            sectorId: data.sector_id,
            leadId: data.lead_id,
            updatedAt: data.updated_at,
          });
        }
      )
      .subscribe();

    subscriptionRef.current = channel;
  }, []);

  useEffect(() => {
    if (channelIds.length === 0) return;

    setupSubscription();

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [channelIds, setupSubscription]);
}
