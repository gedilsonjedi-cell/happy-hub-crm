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
  const { effectiveOrganizationId } = useEffectiveOrganizationId();

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
      if (error) {
        // FunctionsHttpError: o servidor respondeu com status != 2xx mas
        // ainda assim mandou um JSON descritivo. Extrair o motivo real
        // (ex: "(#131047) Janela de 24h expirada...") em vez de mostrar
        // a string genérica "Erro de conexão" que confunde o atendente.
        let serverMessage: string | null = null;
        try {
          const ctx = (error as { context?: { response?: Response } }).context;
          const resp = ctx?.response;
          if (resp) {
            const cloned = resp.clone();
            const parsed = await cloned.json().catch(() => null) as { error?: string } | null;
            if (parsed?.error && typeof parsed.error === "string") {
              serverMessage = parsed.error;
            } else {
              const text = await resp.clone().text().catch(() => "");
              if (text) serverMessage = text.slice(0, 300);
            }
          }
        } catch {
          // ignore — fall back to generic message below
        }
        throw new Error(
          serverMessage
            || (error as Error).message
            || "Não foi possível enviar a mensagem. Verifique sua conexão e tente novamente."
        );
      }
      return data as SendMessageResult;
    },

    onMutate: async (payload) => {
      // CRITICAL: queryKey MUST match exactly the one used by useInfiniteMessages,
      // which is ["messages", effectiveOrganizationId, channelId, conversationThreadKey].
      // Otherwise the optimistic message is written to a different cache slot and
      // the UI shows nothing until realtime arrives (creating the "delay" + duplicate
      // bubbles the user reported).
      const queryKey = [
        "messages",
        effectiveOrganizationId,
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

      toast.error("Falha ao enviar mensagem", {
        description: error.message || "Não foi possível enviar a mensagem. Tente novamente.",
        duration: 7000,
      });

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
        toast.error(data.error || "Falha ao enviar mensagem", {
          description: "A tentativa foi registrada no histórico da conversa como falha. Você pode reenviar.",
          duration: 7000,
        });
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
