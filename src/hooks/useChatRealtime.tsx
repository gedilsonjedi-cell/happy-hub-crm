import { useEffect, useRef, useCallback, useMemo } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getExternalClient, refreshExternalToken } from "@/lib/externalSupabaseClient";

interface RealtimeCallbacks {
  onNewMessage: (payload: {
    channelId: string;
    messageId: string;
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
 * useChatRealtime — Realtime hook (External SSoT)
 *
 * All subscriptions now run against the EXTERNAL Supabase database via the
 * custom-JWT client. The internal database no longer participates in Realtime.
 *
 * Subscribed tables (all on external):
 *   1. whatsapp_messages           — INSERT, filtered by channel_id IN (...)
 *   2. conversation_assignments    — *      , filtered by channel_id IN (...)
 *   3. conversation_assignments    — *      , org-wide (catches campaigns w/o channel_id)
 */
export function useChatRealtime(
  channelIds: string[],
  callbacks: RealtimeCallbacks,
  organizationId?: string | null,
  impersonatedOrgId?: string | null
) {
  const channelIdsRef = useRef<string[]>(channelIds);
  const callbacksRef = useRef<RealtimeCallbacks>(callbacks);
  const clientRef = useRef<SupabaseClient | null>(null);
  const messagesChannelRef = useRef<RealtimeChannel | null>(null);
  const assignmentsChannelRef = useRef<RealtimeChannel | null>(null);
  const orgAssignmentsChannelRef = useRef<RealtimeChannel | null>(null);
  const processedAssignmentIdsRef = useRef<Set<string>>(new Set());
  const processedMessageIdsRef = useRef<Set<string>>(new Set());

  // Stable string key — only re-subscribe when the actual set of channel IDs
  // changes, not on every parent re-render that produces a new array reference.
  const channelKey = useMemo(
    () => [...channelIds].sort().join(","),
    [channelIds]
  );

  useEffect(() => {
    channelIdsRef.current = channelIds;
  }, [channelIds]);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Periodic dedup cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      processedAssignmentIdsRef.current.clear();
      processedMessageIdsRef.current.clear();
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleAssignmentPayload = useCallback(
    (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
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
    },
    []
  );

  useEffect(() => {
    if (!channelKey) return;

    let cancelled = false;

    (async () => {
      const client = await getExternalClient(impersonatedOrgId);
      if (cancelled) return;
      clientRef.current = client;

      const channelFilter = channelIdsRef.current.join(",");

      // Cleanup previous
      if (messagesChannelRef.current) {
        client.removeChannel(messagesChannelRef.current);
        messagesChannelRef.current = null;
      }
      if (assignmentsChannelRef.current) {
        client.removeChannel(assignmentsChannelRef.current);
        assignmentsChannelRef.current = null;
      }

      // 1. whatsapp_messages on EXTERNAL
      const messagesChannel = client
        .channel(`ext-msgs-${channelFilter.slice(0, 40)}`)
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
              id?: string;
              message_id?: string;
              channel_id: string;
              sender_phone: string;
              content: string;
              direction: string;
              created_at: string;
              is_read: boolean;
              sender_name?: string | null;
              metadata?: Record<string, unknown> | null;
            };
            const dedupId = msg.message_id || msg.id || `ext_${msg.channel_id}_${msg.created_at}`;
            if (processedMessageIdsRef.current.has(dedupId)) return;
            processedMessageIdsRef.current.add(dedupId);

            callbacksRef.current.onNewMessage({
              channelId: msg.channel_id,
              messageId: dedupId,
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
        .subscribe((status, err) => {
          console.log(`[useChatRealtime] messages channel status: ${status}`, err ?? "");
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            refreshExternalToken(impersonatedOrgId).catch(() => {});
          }
        });
      messagesChannelRef.current = messagesChannel;

      // 2. conversation_assignments on EXTERNAL — by channel
      const assignmentsChannel = client
        .channel(`ext-assign-${channelFilter.slice(0, 40)}`)
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
        .subscribe((status, err) => {
          console.log(`[useChatRealtime] assignments channel status: ${status}`, err ?? "");
        });
      assignmentsChannelRef.current = assignmentsChannel;

      // 3. conversation_assignments on EXTERNAL — org-wide for campaigns w/o channel
      if (organizationId) {
        if (orgAssignmentsChannelRef.current) {
          client.removeChannel(orgAssignmentsChannelRef.current);
          orgAssignmentsChannelRef.current = null;
        }
        const orgChannel = client
          .channel(`ext-assign-org-${organizationId.slice(0, 12)}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "conversation_assignments",
            },
            (payload) => {
              const data = (payload.new || payload.old) as { channel_id: string | null };
              if (data?.channel_id) return; // handled by channel-scoped subscription
              handleAssignmentPayload(payload);
            }
          )
          .subscribe((status, err) => {
            console.log(`[useChatRealtime] org-assignments channel status: ${status}`, err ?? "");
          });
        orgAssignmentsChannelRef.current = orgChannel;
      }
    })().catch((err) => {
      console.warn("[useChatRealtime] failed to set up external realtime:", err?.message ?? err);
    });

    return () => {
      cancelled = true;
      const client = clientRef.current;
      if (!client) return;
      if (messagesChannelRef.current) {
        client.removeChannel(messagesChannelRef.current);
        messagesChannelRef.current = null;
      }
      if (assignmentsChannelRef.current) {
        client.removeChannel(assignmentsChannelRef.current);
        assignmentsChannelRef.current = null;
      }
      if (orgAssignmentsChannelRef.current) {
        client.removeChannel(orgAssignmentsChannelRef.current);
        orgAssignmentsChannelRef.current = null;
      }
    };
  }, [channelKey, organizationId, impersonatedOrgId, handleAssignmentPayload]);
}
