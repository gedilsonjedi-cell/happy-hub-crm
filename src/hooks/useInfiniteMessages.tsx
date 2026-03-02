import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 20;

export interface MessagePage {
  messages: MessageRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MessageRow {
  id: string;
  channel_id: string | null;
  message_id: string;
  sender_phone: string;
  sender_name: string | null;
  message_type: string;
  content: string | null;
  media_url: string | null;
  direction: string;
  status: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  error_message?: string | null;
  is_read?: boolean;
}

/**
 * Generate phone number variants to handle Brazilian number format differences.
 * Brazilian mobile numbers can have 8 or 9 digits (with/without the leading 9).
 * e.g. 558386640756 vs 5583986640756 (same number, different format)
 */
function getPhoneVariants(phone: string): string[] {
  const normalized = phone.replace(/\D/g, "");
  const variants = new Set<string>();

  variants.add(normalized);
  variants.add(`+${normalized}`);

  // Brazilian numbers: if starts with 55 (country code)
  if (normalized.startsWith("55") && normalized.length >= 10) {
    const withoutCountry = normalized.slice(2); // e.g. "83986640756" or "8386640756"
    const areaCode = withoutCountry.slice(0, 2); // "83"
    const localNumber = withoutCountry.slice(2);  // "986640756" or "86640756"

    if (localNumber.length === 9 && localNumber.startsWith("9")) {
      // Has 9 prefix → also try without it
      const without9 = areaCode + localNumber.slice(1); // "8386640756"
      variants.add(`55${without9}`);
      variants.add(`+55${without9}`);
    } else if (localNumber.length === 8) {
      // Missing 9 prefix → also try with it
      const with9 = areaCode + "9" + localNumber; // "83986640756"
      variants.add(`55${with9}`);
      variants.add(`+55${with9}`);
    }
  }

  return Array.from(variants);
}

async function fetchMessagePage(
  channelId: string,
  conversationPhone: string,
  cursor: string | null
): Promise<MessagePage> {
  const normalizedPhone = conversationPhone.replace(/\D/g, "");
  
  // Generate all phone variants (with/without 9 digit for BR numbers)
  const phoneVariants = getPhoneVariants(normalizedPhone);

  // Cursor = oldest created_at from previous page (we paginate backwards)
  const cursorFilter = cursor ? cursor : new Date().toISOString();

  // Essential fields only — reduces JSON payload significantly
  const essentialSelect =
    "id, channel_id, message_id, sender_phone, sender_name, message_type, content, media_url, direction, status, created_at, metadata, error_message, is_read";

  // Build OR filter for all phone variants
  const inboundPhoneFilter = phoneVariants
    .map(p => `sender_phone.eq.${p}`)
    .join(",");
  const outboundPhoneFilter = phoneVariants
    .map(p => `metadata->>destination.eq.${p}`)
    .join(",");

  const [inboundResult, outboundResult] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select(essentialSelect)
      .eq("channel_id", channelId)
      .eq("direction", "inbound")
      .or(inboundPhoneFilter)
      .lt("created_at", cursorFilter)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),

    supabase
      .from("whatsapp_messages")
      .select(essentialSelect)
      .eq("channel_id", channelId)
      .eq("direction", "outbound")
      .or(outboundPhoneFilter)
      .lt("created_at", cursorFilter)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
  ]);

  const inbound = (inboundResult.data || []) as MessageRow[];
  const outbound = (outboundResult.data || []) as MessageRow[];

  // Merge and sort descending (newest first within this page)
  const merged = [...inbound, ...outbound].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // De-duplicate by id
  const seen = new Set<string>();
  const unique = merged.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Take PAGE_SIZE most recent
  const page = unique.slice(0, PAGE_SIZE);
  const hasMore = unique.length >= PAGE_SIZE;
  const nextCursor = hasMore && page.length > 0
    ? page[page.length - 1].created_at
    : null;

  return { messages: page, nextCursor, hasMore };
}

/**
 * useInfiniteMessages — Paginated message loading for the chat panel.
 *
 * - Fetches ONLY the 40 most recent messages on mount
 * - `fetchNextPage()` loads the previous 40 (scrolling up)
 * - Uses channel_id + conversation_phone as multi-tenant keys
 * - Selects only essential fields to minimize JSON payload
 */
export function useInfiniteMessages(
  channelId: string | null,
  conversationPhone: string | null
) {
  const queryClient = useQueryClient();

  const queryKey = ["messages", channelId, conversationPhone];

  const query = useInfiniteQuery<MessagePage, Error>({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchMessagePage(
        channelId!,
        conversationPhone!,
        pageParam as string | null
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!channelId && !!conversationPhone,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnMount: "always",
  });

  // All pages combined in chronological order (oldest → newest)
  const allMessages: MessageRow[] = query.data
    ? query.data.pages
        .flatMap((p) => p.messages)
        // De-duplicate across pages
        .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
        // Chronological
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
    : [];

  /**
   * Prepend a new message received via Realtime without refetching.
   * Keeps the local state consistent instantly.
   */
  const prependMessage = useCallback(
    (msg: MessageRow) => {
      queryClient.setQueryData(
        queryKey,
        (old: { pages: MessagePage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          const firstPage = old.pages[0];
          // Avoid exact duplicate
          if (firstPage?.messages.some((m) => m.id === msg.id)) return old;

          // Remove optimistic (temp_*) messages that match this real message
          // by checking direction + approximate timestamp (within 30s)
          const msgTime = new Date(msg.created_at).getTime();
          const cleanedMessages = (firstPage?.messages ?? []).filter((m) => {
            if (!m.id.startsWith("temp_")) return true;
            if (m.direction !== msg.direction) return true;
            const timeDiff = Math.abs(new Date(m.created_at).getTime() - msgTime);
            // Same direction, similar time, same content → it's the optimistic twin
            if (timeDiff < 30000 && m.content === msg.content) return false;
            return true;
          });

          return {
            ...old,
            pages: [
              {
                ...firstPage,
                messages: [msg, ...cleanedMessages],
              },
              ...old.pages.slice(1),
            ],
          };
        }
      );
    },
    [queryClient, queryKey.join("|")]
  );

  /**
   * Update a single message status in cache (delivered/read/failed).
   * Used instead of creating a new log record.
   */
  const updateMessageStatus = useCallback(
    (messageId: string, status: string) => {
      queryClient.setQueryData(
        queryKey,
        (old: { pages: MessagePage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === messageId ? { ...m, status } : m
              ),
            })),
          };
        }
      );
    },
    [queryClient, queryKey.join("|")]
  );

  /**
   * Invalidate cache (e.g. after switching conversations).
   */
  const invalidate = useCallback(() => {
    queryClient.removeQueries({ queryKey });
  }, [queryClient, queryKey.join("|")]);

  return {
    messages: allMessages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    prependMessage,
    updateMessageStatus,
    invalidate,
  };
}
