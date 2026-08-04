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
  onStatsChange?: (payload: {
    assignmentId: string | null;
    channelId: string | null;
    conversationPhone: string;
    unreadCount: number;
    lastMessageContent: string | null;
    lastMessageAt: string | null;
    lastInboundAt: string | null;
    senderName: string | null;
  }) => void;
}

/**
 * Stable, collision-free short hash (djb2) for a set of channel IDs.
 * Replaces the old `slice(0, 40)` truncation, which collapsed different
 * channel sets that shared the same first UUID into the same channel name.
 */
function hashChannelSet(ids: string): string {
  let h = 5381;
  for (let i = 0; i < ids.length; i++) {
    h = ((h << 5) + h + ids.charCodeAt(i)) >>> 0;
  }
  return `${h.toString(36)}-${ids.length}`;
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
  const statsChannelRef = useRef<RealtimeChannel | null>(null);

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
    // Set to true when WE tear channels down (unmount / channel-set change).
    // Prevents the CLOSED status callback from resurrecting removed channels.
    let teardown = false;

    (async () => {
      const client = await getExternalClient(impersonatedOrgId);
      if (cancelled) return;
      clientRef.current = client;

      const channelFilter = channelIdsRef.current.join(",");
      const channelHash = hashChannelSet(channelFilter);

      // Reconnect ONLY on real connection failures — never on CLOSED, which is
      // also emitted by removeChannel() during intentional cleanup.
      const handleStatus = (
        label: string,
        ch: RealtimeChannel
      ) => (status: string, err?: Error) => {
        console.log(`[useChatRealtime] ${label} channel status: ${status}`, err ?? "");
        if (teardown || cancelled) return;
        if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
        refreshExternalToken(impersonatedOrgId)
          .then(() => {
            if (teardown || cancelled) return;
            try { ch.subscribe(); } catch { /* noop */ }
          })
          .catch(() => {});
      };


      // Cleanup previous
      if (messagesChannelRef.current) {
        client.removeChannel(messagesChannelRef.current);
        messagesChannelRef.current = null;
      }
      if (assignmentsChannelRef.current) {
        client.removeChannel(assignmentsChannelRef.current);
        assignmentsChannelRef.current = null;
      }
      if (statsChannelRef.current) {
        client.removeChannel(statsChannelRef.current);
        statsChannelRef.current = null;
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
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            refreshExternalToken(impersonatedOrgId)
              .then(() => {
                try { messagesChannel.subscribe(); } catch { /* noop */ }
              })
              .catch(() => {});
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
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            refreshExternalToken(impersonatedOrgId)
              .then(() => {
                try { assignmentsChannel.subscribe(); } catch { /* noop */ }
              })
              .catch(() => {});
          }
        });
      assignmentsChannelRef.current = assignmentsChannel;

      // 2b. conversation_stats on EXTERNAL — SSoT for unread_count.
      // Without this, badges only update from the initial paginated summary or
      // from whatsapp_messages realtime (which was intentionally removed from
      // the publication in migration 2E). Subscribing here guarantees the badge
      // increments on every subsequent inbound message.
      const statsChannel = client
        .channel(`ext-stats-${channelFilter.slice(0, 40)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversation_stats",
            filter: `channel_id=in.(${channelFilter})`,
          },
          (payload) => {
            const row = (payload.new || payload.old) as {
              assignment_id?: string | null;
              channel_id?: string | null;
              conversation_phone?: string;
              unread_count?: number | null;
              last_message_content?: string | null;
              last_message_at?: string | null;
              last_inbound_at?: string | null;
              sender_name?: string | null;
            };
            if (!row?.conversation_phone) return;
            callbacksRef.current.onStatsChange?.({
              assignmentId: row.assignment_id ?? null,
              channelId: row.channel_id ?? null,
              conversationPhone: row.conversation_phone,
              unreadCount: Number(row.unread_count ?? 0),
              lastMessageContent: row.last_message_content ?? null,
              lastMessageAt: row.last_message_at ?? null,
              lastInboundAt: row.last_inbound_at ?? null,
              senderName: row.sender_name ?? null,
            });
          }
        )
        .subscribe((status, err) => {
          console.log(`[useChatRealtime] stats channel status: ${status}`, err ?? "");
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            refreshExternalToken(impersonatedOrgId)
              .then(() => {
                try { statsChannel.subscribe(); } catch { /* noop */ }
              })
              .catch(() => {});
          }
        });
      statsChannelRef.current = statsChannel;


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
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              refreshExternalToken(impersonatedOrgId)
                .then(() => {
                  try { orgChannel.subscribe(); } catch { /* noop */ }
                })
                .catch(() => {});
            }
          });
        orgAssignmentsChannelRef.current = orgChannel;
      }
    })().catch((err) => {
      console.warn("[useChatRealtime] failed to set up external realtime:", err?.message ?? err);
    });

    // Re-subscribe transparente quando a aba volta ao foco ou a rede volta.
    // Cobre o caso "JWT de 5min expirou enquanto eu estava em outra aba".
    const resubscribeAll = () => {
      refreshExternalToken(impersonatedOrgId)
        .then(() => {
          try { messagesChannelRef.current?.subscribe(); } catch { /* noop */ }
          try { assignmentsChannelRef.current?.subscribe(); } catch { /* noop */ }
          try { orgAssignmentsChannelRef.current?.subscribe(); } catch { /* noop */ }
          try { statsChannelRef.current?.subscribe(); } catch { /* noop */ }

        })
        .catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") resubscribeAll();
    };
    window.addEventListener("focus", resubscribeAll);
    window.addEventListener("online", resubscribeAll);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", resubscribeAll);
      window.removeEventListener("online", resubscribeAll);
      document.removeEventListener("visibilitychange", onVisibility);
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
      if (statsChannelRef.current) {
        client.removeChannel(statsChannelRef.current);
        statsChannelRef.current = null;
      }

    };
  }, [channelKey, organizationId, impersonatedOrgId, handleAssignmentPayload]);
}
