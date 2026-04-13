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
 * 1. conversation_stats filtered by channel_id IN (...) — catches new messages
 *    (whatsapp_messages are written to EXTERNAL DB only; conversation_stats is
 *     updated locally via upsert_conversation_stats_manual after each external write)
 * 2. whatsapp_messages filtered by channel_id IN (...) — fallback for orgs still
 *    using local DB
 * 3. conversation_assignments filtered by channel_id IN (...) — catches assignments WITH channels
 * 4. conversation_assignments (org-wide, no filter) — catches assignments WITHOUT channel_id (campaigns)
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
  const statsSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const processedAssignmentIdsRef = useRef<Set<string>>(new Set());
  // Track processed stats events to avoid emitting duplicate message events
  const processedStatsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    channelIdsRef.current = channelIds;
  }, [channelIds]);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Clear dedup sets periodically to prevent memory growth
  useEffect(() => {
    const interval = setInterval(() => {
      processedAssignmentIdsRef.current.clear();
      processedStatsRef.current.clear();
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

  /**
   * Handle conversation_stats changes — this is the PRIMARY source of
   * new-message events after the external DB migration.
   *
   * When a message is written to the external DB, the webhook calls
   * upsert_conversation_stats_manual on the LOCAL DB, which triggers
   * this Realtime event.
   */
  const handleStatsPayload = useCallback((payload: { new?: Record<string, unknown>; old?: Record<string, unknown>; eventType?: string }) => {
    const data = payload.new as {
      channel_id: string | null;
      conversation_phone: string;
      last_message_content: string | null;
      last_message_at: string | null;
      last_inbound_at: string | null;
      unread_count: number;
      sender_name: string | null;
      updated_at: string;
    };

    if (!data?.channel_id || !data.conversation_phone) return;

    // Deduplicate by channel + phone + timestamp
    const dedupKey = `stats_${data.channel_id}_${data.conversation_phone}_${data.updated_at}`;
    if (processedStatsRef.current.has(dedupKey)) return;
    processedStatsRef.current.add(dedupKey);

    const oldData = payload.old as {
      last_message_at: string | null;
      last_inbound_at: string | null;
      unread_count: number;
    } | undefined;

    // Determine direction from the change:
    // If last_inbound_at changed, it's an inbound message
    // If only last_message_at changed, it's outbound
    const inboundChanged = data.last_inbound_at !== oldData?.last_inbound_at;
    const direction = inboundChanged ? "inbound" : "outbound";

    // Only emit if last_message_at actually changed (new message arrived)
    if (data.last_message_at === oldData?.last_message_at) return;

    callbacksRef.current.onNewMessage({
      channelId: data.channel_id,
      senderPhone: data.conversation_phone,
      content: data.last_message_content || "",
      direction,
      createdAt: data.last_message_at || data.updated_at,
      isRead: direction === "outbound" || data.unread_count === 0,
      senderName: data.sender_name,
      metadata: direction === "outbound"
        ? { destination: data.conversation_phone }
        : null,
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
      // 1. Listen for new messages on local whatsapp_messages (fallback for non-migrated orgs)
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

  // Subscribe to conversation_stats changes — PRIMARY realtime source for external DB messages
  const setupStatsSubscription = useCallback(() => {
    if (channelIdsRef.current.length === 0) return;

    if (statsSubscriptionRef.current) {
      supabase.removeChannel(statsSubscriptionRef.current);
      statsSubscriptionRef.current = null;
    }

    const channelFilter = channelIdsRef.current.join(",");

    const statsChannel = supabase
      .channel(`stats-realtime-${channelFilter.slice(0, 40)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_stats",
          filter: `channel_id=in.(${channelFilter})`,
        },
        handleStatsPayload
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_stats",
          filter: `channel_id=in.(${channelFilter})`,
        },
        handleStatsPayload
      )
      .subscribe();

    statsSubscriptionRef.current = statsChannel;
  }, [handleStatsPayload]);

  // 3. Separate org-wide subscription for assignments WITHOUT channel_id (campaigns)
  const setupOrgSubscription = useCallback(() => {
    if (!organizationId) return;

    if (orgSubscriptionRef.current) {
      supabase.removeChannel(orgSubscriptionRef.current);
      orgSubscriptionRef.current = null;
    }

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
    setupStatsSubscription();
    setupOrgSubscription();

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      if (statsSubscriptionRef.current) {
        supabase.removeChannel(statsSubscriptionRef.current);
        statsSubscriptionRef.current = null;
      }
      if (orgSubscriptionRef.current) {
        supabase.removeChannel(orgSubscriptionRef.current);
        orgSubscriptionRef.current = null;
      }
    };
  }, [channelIds, setupSubscription, setupStatsSubscription, setupOrgSubscription]);
}
