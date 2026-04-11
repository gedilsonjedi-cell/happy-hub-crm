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
 * Subscribes to:
 * 1. whatsapp_messages filtered by channel_id IN (...)
 * 2. conversation_assignments filtered by channel_id IN (...) — catches assignments WITH channels
 * 3. conversation_assignments (org-wide, no filter) — catches assignments WITHOUT channel_id (campaigns)
 *    Deduplication handled via assignment ID tracking.
 */
export function useChatRealtime(
  channelIds: string[],
  callbacks: RealtimeCallbacks,
  organizationId?: string | null
) {
  const channelIdsRef = useRef<string[]>(channelIds);
  const callbacksRef = useRef<RealtimeCallbacks>(callbacks);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const orgSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const processedAssignmentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    channelIdsRef.current = channelIds;
  }, [channelIds]);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Clear dedup set periodically to prevent memory growth
  useEffect(() => {
    const interval = setInterval(() => {
      processedAssignmentIdsRef.current.clear();
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleAssignmentPayload = useCallback((payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
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

    // Deduplicate: same assignment may arrive from both subscriptions
    const dedupKey = `${data.id}_${data.updated_at}`;
    if (processedAssignmentIdsRef.current.has(dedupKey)) return;
    processedAssignmentIdsRef.current.add(dedupKey);

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
  }, []);

  const setupSubscription = useCallback(() => {
    if (channelIdsRef.current.length === 0) return;

    // Clean up previous subscriptions
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
        handleAssignmentPayload
      )
      .subscribe();

    subscriptionRef.current = channel;
  }, [handleAssignmentPayload]);

  // 3. Separate org-wide subscription for assignments WITHOUT channel_id (campaigns)
  const setupOrgSubscription = useCallback(() => {
    if (!organizationId) return;

    if (orgSubscriptionRef.current) {
      supabase.removeChannel(orgSubscriptionRef.current);
      orgSubscriptionRef.current = null;
    }

    // Subscribe to conversation_stats changes which carry organization_id
    // This catches assignments that have no channel_id
    const orgChannel = supabase
      .channel(`assignments-org-${organizationId.slice(0, 12)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_assignments",
        },
        (payload) => {
          const data = (payload.new || payload.old) as {
            channel_id: string | null;
          };
          // Only process assignments WITHOUT channel_id here
          // (ones WITH channel_id are already handled by the filtered subscription)
          if (data?.channel_id) return;
          handleAssignmentPayload(payload);
        }
      )
      .subscribe();

    orgSubscriptionRef.current = orgChannel;
  }, [organizationId, handleAssignmentPayload]);

  useEffect(() => {
    if (channelIds.length === 0) return;

    setupSubscription();
    setupOrgSubscription();

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      if (orgSubscriptionRef.current) {
        supabase.removeChannel(orgSubscriptionRef.current);
        orgSubscriptionRef.current = null;
      }
    };
  }, [channelIds, setupSubscription, setupOrgSubscription]);
}
