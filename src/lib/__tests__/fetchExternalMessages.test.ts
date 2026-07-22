/**
 * Regression test for the "Sem histórico" bug in busy channels.
 *
 * The previous fetchDirectionMessages scanned up to ~1200 rows of the whole
 * channel and only then filtered by phone in memory. In busy channels, older
 * conversations were never reached and the chat wrongly rendered empty.
 *
 * This test simulates a channel with 2000+ recent messages from OTHER contacts
 * and confirms that the target contact's older messages are returned and can
 * be paginated with cursor-based scroll.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Fake external supabase client ──────────────────────────────────
// The query builder collects the filters applied and, when awaited,
// resolves with the pre-built row set filtered to match those filters.

interface FakeRow {
  id: string;
  channel_id: string | null;
  organization_id: string | null;
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
  error_message: string | null;
  is_read: boolean;
}

interface AndGroup {
  channelIdEq?: string;
  senderPhoneLikeSuffix?: string;
  metadataDestLikeSuffix?: { field: string; suffix: string };
}

interface OrClause {
  channelIdEq?: string; // top-level channel_id.eq.<value>
  and?: AndGroup;
}

function parseOr(orString: string): OrClause[] {
  // Split by top-level commas (respecting parentheses)
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of orString) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push(buf);

  return parts.map((raw) => {
    const s = raw.trim();
    if (s.startsWith("and(")) {
      const inner = s.slice(4, -1);
      const group: AndGroup = {};
      // split inner by comma at depth 0
      const innerParts: string[] = [];
      let d = 0;
      let b = "";
      for (const ch of inner) {
        if (ch === "(") d++;
        else if (ch === ")") d--;
        if (ch === "," && d === 0) {
          innerParts.push(b);
          b = "";
        } else {
          b += ch;
        }
      }
      if (b) innerParts.push(b);
      for (const p of innerParts) {
        const t = p.trim();
        const chMatch = /^channel_id\.eq\.(.+)$/.exec(t);
        const senderMatch = /^sender_phone\.like\.%(.+)$/.exec(t);
        const metaMatch = /^metadata->>([a-zA-Z_]+)\.like\.%(.+)$/.exec(t);
        if (chMatch) group.channelIdEq = chMatch[1];
        else if (senderMatch) group.senderPhoneLikeSuffix = senderMatch[1];
        else if (metaMatch)
          group.metadataDestLikeSuffix = { field: metaMatch[1], suffix: metaMatch[2] };
      }
      return { and: group };
    }
    const chMatch = /^channel_id\.eq\.(.+)$/.exec(s);
    if (chMatch) return { channelIdEq: chMatch[1] };
    return {};
  });
}

function rowMatchesClause(row: FakeRow, clause: OrClause): boolean {
  if (clause.channelIdEq !== undefined) {
    return row.channel_id === clause.channelIdEq;
  }
  if (clause.and) {
    const g = clause.and;
    if (g.channelIdEq !== undefined && row.channel_id !== g.channelIdEq) return false;
    if (g.senderPhoneLikeSuffix && !row.sender_phone.endsWith(g.senderPhoneLikeSuffix))
      return false;
    if (g.metadataDestLikeSuffix) {
      const val = row.metadata?.[g.metadataDestLikeSuffix.field];
      if (typeof val !== "string" || !val.endsWith(g.metadataDestLikeSuffix.suffix))
        return false;
    }
    return true;
  }
  return false;
}

function makeFakeExternalClient(rows: FakeRow[]) {
  function createQuery() {
    const filters: {
      direction?: string;
      ltCreatedAt?: string;
      orClauses: OrClause[];
    } = { orClauses: [] };
    let limit = Infinity;

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: string) {
        if (col === "direction") filters.direction = val;
        return builder;
      },
      lt(col: string, val: string) {
        if (col === "created_at") filters.ltCreatedAt = val;
        return builder;
      },
      gte() {
        return builder;
      },
      or(str: string) {
        filters.orClauses = parseOr(str);
        return builder;
      },
      order() {
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      then(resolve: (v: { data: FakeRow[]; error: null }) => void) {
        let filtered = rows.filter((row) => {
          if (filters.direction && row.direction !== filters.direction) return false;
          if (filters.ltCreatedAt && !(row.created_at < filters.ltCreatedAt)) return false;
          return filters.orClauses.some((c) => rowMatchesClause(row, c));
        });
        filtered = filtered
          .slice()
          .sort((a, b) => (b.created_at < a.created_at ? -1 : 1))
          .slice(0, limit);
        resolve({ data: filtered, error: null });
      },
    };
    return builder;
  }

  return {
    from(_table: string) {
      return createQuery();
    },
  };
}

// ── Mocks ──────────────────────────────────────────────────────────

const fakeClientHolder: { rows: FakeRow[] } = { rows: [] };

vi.mock("@/lib/externalSupabaseClient", () => ({
  getExternalClient: vi.fn(async () => makeFakeExternalClient(fakeClientHolder.rows)),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async () => ({ data: null, error: new Error("proxy disabled in test") })),
    },
    from: vi.fn(),
  },
}));

// Import AFTER mocks
import { fetchExternalMessages, resetDirectReadCircuit } from "@/lib/externalDb";

// ── Fixtures ───────────────────────────────────────────────────────

const CHANNEL_ID = "channel-uuid-123";
const TARGET_PHONE = "5514981564414"; // last 8 = "81564414"

function iso(daysAgo: number, extraMs = 0): string {
  return new Date(Date.now() - daysAgo * 86_400_000 + extraMs).toISOString();
}

function makeRow(overrides: Partial<FakeRow>): FakeRow {
  return {
    id: overrides.id ?? Math.random().toString(36),
    channel_id: overrides.channel_id ?? CHANNEL_ID,
    organization_id: "org-1",
    message_id: overrides.message_id ?? `wamid-${Math.random()}`,
    sender_phone: overrides.sender_phone ?? "5511900000000",
    sender_name: null,
    message_type: "text",
    content: overrides.content ?? "hello",
    media_url: null,
    direction: overrides.direction ?? "inbound",
    status: null,
    created_at: overrides.created_at ?? iso(0),
    metadata: overrides.metadata ?? null,
    error_message: null,
    is_read: false,
    ...overrides,
  } as FakeRow;
}

describe("fetchExternalMessages (busy channel regression)", () => {
  beforeEach(() => {
    resetDirectReadCircuit();
    fakeClientHolder.rows = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("finds the target contact's old history even when 2000+ recent messages from other contacts exist", async () => {
    const rows: FakeRow[] = [];

    // 2000 recent inbound noise messages from OTHER contacts (past 20 days).
    for (let i = 0; i < 2000; i++) {
      rows.push(
        makeRow({
          id: `noise-in-${i}`,
          sender_phone: `551199999${(1000 + i).toString().padStart(4, "0")}`,
          direction: "inbound",
          created_at: iso(20 - (i * 20) / 2000),
        })
      );
    }
    // 500 recent outbound noise to other contacts.
    for (let i = 0; i < 500; i++) {
      rows.push(
        makeRow({
          id: `noise-out-${i}`,
          sender_phone: "5514000000000", // channel phone
          direction: "outbound",
          metadata: { destination: `551188888${(1000 + i).toString().padStart(4, "0")}` },
          created_at: iso(20 - (i * 20) / 500),
        })
      );
    }

    // Target contact's OLDER messages (60 days ago), 40 total interleaved.
    for (let i = 0; i < 20; i++) {
      rows.push(
        makeRow({
          id: `target-in-${i}`,
          sender_phone: TARGET_PHONE,
          direction: "inbound",
          content: `inbound msg ${i}`,
          created_at: iso(60, i * 1000),
        })
      );
      rows.push(
        makeRow({
          id: `target-out-${i}`,
          sender_phone: "5514000000000",
          direction: "outbound",
          metadata: { destination: TARGET_PHONE },
          content: `outbound msg ${i}`,
          created_at: iso(60, i * 1000 + 500),
        })
      );
    }

    // Page 1 (latest)
    const page1 = await fetchExternalMessages({
      channelId: CHANNEL_ID,
      phoneVariants: [TARGET_PHONE, `+${TARGET_PHONE}`],
      cursor: null,
      pageSize: 25,
    });

    // eslint-disable-next-line no-console
    console.log("PAGE1", JSON.stringify(page1, null, 2).slice(0, 500));
    expect(page1.messages.length).toBeGreaterThan(0);
    // Every returned message must belong to the target contact.
    for (const msg of page1.messages) {
      const belongsInbound =
        msg.direction === "inbound" && msg.sender_phone === TARGET_PHONE;
      const belongsOutbound =
        msg.direction === "outbound" &&
        (msg.metadata as { destination?: string } | null)?.destination === TARGET_PHONE;
      expect(belongsInbound || belongsOutbound).toBe(true);
    }
    expect(page1.messages.length).toBe(25);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    // Page 2 — cursor pagination pulls the remaining ones.
    const page2 = await fetchExternalMessages({
      channelId: CHANNEL_ID,
      phoneVariants: [TARGET_PHONE, `+${TARGET_PHONE}`],
      cursor: page1.nextCursor,
      pageSize: 25,
    });

    const combinedIds = new Set([
      ...page1.messages.map((m) => m.id),
      ...page2.messages.map((m) => m.id),
    ]);
    // 40 target messages total should be retrievable across pages.
    expect(combinedIds.size).toBe(40);
  });
});
