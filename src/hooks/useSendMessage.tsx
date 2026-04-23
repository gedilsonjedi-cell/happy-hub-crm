import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MessageRow, MessagePage } from "@/hooks/useInfiniteMessages";
import { getCanonicalPhoneThreadKey } from "@/lib/phoneThreadKey";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";

export interface SendMessagePayload {
  channelId: string;
  channelPhone: string;
  channelProvider: "meta" | "zapi" | string;
  destination: string;
  message: string;
  messageType?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  fileName?: string;
  templateName?: string;
  templateParams?: string[];
}

interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * useSendMessage — useMutation with full optimistic update lifecycle.
 *
 * onMutate  → Cancels in-flight queries, prepends optimistic message (status: "sending")
 * onError   → Marks message as failed + shows toast; restores input text on text msgs
 * onSettled → Invalidates cache to sync real ID and server timestamp
 */
export function useSendMessage(
  onRestoreInput?: (text: string) => void
) {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    SendMessageResult,
    Error,
    SendMessagePayload,
    { tempId: string; queryKey: unknown[] }
  >({
    mutationFn: async (payload) => {
      const sendFunction = payload.channelProvider === "zapi"
        ? "zapi-send"
        : payload.channelProvider === "gupshup"
          ? "gupshup-send"
          : payload.channelProvider === "infobip"
            ? "infobip-send"
            : "meta-send";

      const body: Record<string, unknown> = {
        channelId: payload.channelId,
        destination: payload.destination,
        messageType: payload.messageType || "text",
      };

      if (payload.messageType === "template") {
        body.templateName = payload.templateName;
        body.templateParams = payload.templateParams;
      } else if (payload.messageType === "text" || !payload.messageType) {
        body.message = payload.message;
      } else {
        body.mediaUrl = payload.mediaUrl;
        body.mediaCaption = payload.mediaCaption;
        body.fileName = payload.fileName;
      }

      const { data, error } = await supabase.functions.invoke(sendFunction, { body });
      if (error) throw new Error("Erro de conexão ao enviar mensagem");
      return data as SendMessageResult;
    },

    onMutate: async (payload) => {
      const queryKey = [
        "messages",
        payload.channelId,
        getCanonicalPhoneThreadKey(payload.destination),
      ];

      // Cancel outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey });

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const optimisticMessage: MessageRow = {
        id: tempId,
        channel_id: payload.channelId,
        message_id: tempId,
        sender_phone: payload.channelPhone,
        sender_name: null,
        message_type: payload.messageType === "ptt" ? "audio" : (payload.messageType || "text"),
        content: payload.message || payload.mediaCaption || `[${payload.messageType}]`,
        media_url: payload.mediaUrl || null,
        direction: "outbound",
        status: "sending",
        created_at: new Date().toISOString(),
        metadata: { destination: payload.destination },
        error_message: null,
        is_read: true,
      };

      // Prepend into the first page of the infinite cache
      queryClient.setQueryData(
        queryKey,
        (old: { pages: MessagePage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          const firstPage = old.pages[0];
          // Guard against duplicates
          if (firstPage?.messages.some((m) => m.id === tempId)) return old;
          return {
            ...old,
            pages: [
              {
                ...firstPage,
                messages: [optimisticMessage, ...(firstPage?.messages ?? [])],
              },
              ...old.pages.slice(1),
            ],
          };
        }
      );

      return { tempId, queryKey };
    },

    onError: (error, payload, context) => {
      if (!context) return;
      const { tempId, queryKey } = context;

      // Mark message as failed (keep it visible so agent can retry)
      queryClient.setQueryData(
        queryKey,
        (old: { pages: MessagePage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === tempId
                  ? {
                      ...m,
                      status: "failed",
                      error_message: error.message || "Falha ao enviar mensagem",
                    }
                  : m
              ),
            })),
          };
        }
      );

      toast.error("Falha ao enviar mensagem");

      // Restore text input for text messages so agent can retry
      if ((payload.messageType === "text" || !payload.messageType) && onRestoreInput) {
        onRestoreInput(payload.message);
      }
    },

    onSuccess: (data, payload, context) => {
      if (!context) return;
      const { tempId, queryKey } = context;

      if (!data.success) {
        // API returned success=false → treat as error
        queryClient.setQueryData(
          queryKey,
          (old: { pages: MessagePage[]; pageParams: unknown[] } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) =>
                  m.id === tempId
                    ? {
                        ...m,
                        status: "failed",
                        error_message: data.error || "Falha ao enviar mensagem",
                      }
                    : m
                ),
              })),
            };
          }
        );
        toast.error(data.error || "Falha ao enviar mensagem");
        if ((payload.messageType === "text" || !payload.messageType) && onRestoreInput) {
          onRestoreInput(payload.message);
        }
        return;
      }

      // Update temp message with the confirmed message_id and status "sent"
      queryClient.setQueryData(
        queryKey,
        (old: { pages: MessagePage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === tempId
                  ? { ...m, message_id: data.messageId || tempId, status: "sent" }
                  : m
              ),
            })),
          };
        }
      );
    },

    onSettled: (_data, _error, _payload, _context) => {
      // Do NOT invalidate the cache here. The optimistic message stays in cache
      // with status "sent" until Realtime brings the real record, which
      // deduplicates via prependMessage. Invalidating can cause messages to
      // disappear if the external DB refetch fails or times out.
    },
  });

  return mutation;
}
