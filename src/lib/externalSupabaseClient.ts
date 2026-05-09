/**
 * External Supabase Client
 *
 * Creates and manages Supabase clients connected directly to the external
 * database via short-lived JWTs from the `external-auth-token` edge function.
 *
 * Now supports Realtime: the client's WebSocket auth is updated on every
 * token refresh so RLS-filtered postgres_changes subscriptions stay valid
 * across the 5-minute JWT TTL without dropping the connection.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface ExternalAuthResponse {
  token: string;
  url: string;
  anonKey: string;
  expiresAt: number; // ms timestamp
}

const authCache = new Map<string, ExternalAuthResponse>();
const clientCache = new Map<string, SupabaseClient>();
const refreshPromises = new Map<string, Promise<ExternalAuthResponse>>();
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Refresh 60s before expiry
const REFRESH_BUFFER_MS = 60_000;
const DEFAULT_SCOPE = "__self__";

function getScopeKey(impersonatedOrgId?: string | null): string {
  return impersonatedOrgId ?? DEFAULT_SCOPE;
}

async function fetchExternalAuth(
  impersonatedOrgId?: string | null
): Promise<ExternalAuthResponse> {
  const body = impersonatedOrgId ? { impersonatedOrgId } : undefined;

  const { data, error } = await supabase.functions.invoke(
    "external-auth-token",
    { body }
  );

  if (error) {
    throw new Error(`Failed to get external auth token: ${error.message}`);
  }

  return data as ExternalAuthResponse;
}

function isTokenValid(scopeKey: string): boolean {
  const cachedAuth = authCache.get(scopeKey);
  if (!cachedAuth) return false;
  return Date.now() < cachedAuth.expiresAt - REFRESH_BUFFER_MS;
}

function scheduleAutoRefresh(scopeKey: string, impersonatedOrgId?: string | null): void {
  const existing = refreshTimers.get(scopeKey);
  if (existing) clearTimeout(existing);

  const auth = authCache.get(scopeKey);
  if (!auth) return;

  const delay = Math.max(5_000, auth.expiresAt - Date.now() - REFRESH_BUFFER_MS);
  const timer = setTimeout(() => {
    refreshTokenInPlace(scopeKey, impersonatedOrgId).catch((err) => {
      console.warn("[externalSupabase] background token refresh failed:", err?.message ?? err);
    });
  }, delay);
  refreshTimers.set(scopeKey, timer);
}

/**
 * Refresh the JWT for a scope without recreating the SupabaseClient.
 * The existing Realtime WebSocket stays open; we just call setAuth(newToken).
 */
async function refreshTokenInPlace(
  scopeKey: string,
  impersonatedOrgId?: string | null
): Promise<void> {
  let refreshPromise = refreshPromises.get(scopeKey);
  if (!refreshPromise) {
    refreshPromise = fetchExternalAuth(impersonatedOrgId).finally(() => {
      refreshPromises.delete(scopeKey);
    });
    refreshPromises.set(scopeKey, refreshPromise);
  }

  const auth = await refreshPromise;
  authCache.set(scopeKey, auth);

  const client = clientCache.get(scopeKey);
  if (client) {
    // Update Authorization header for REST calls
    (client as unknown as { rest: { headers: Record<string, string> } }).rest.headers[
      "Authorization"
    ] = `Bearer ${auth.token}`;
    // Update Realtime WebSocket auth (keeps the connection alive)
    try {
      client.realtime.setAuth(auth.token);
    } catch (err) {
      console.warn("[externalSupabase] realtime.setAuth failed:", err);
    }
  }

  scheduleAutoRefresh(scopeKey, impersonatedOrgId);
}

/**
 * Force a token refresh for a given scope (or all scopes when omitted).
 * Safe no-op when there is no client yet. Used by visibility/online listeners
 * and by Realtime error handlers to recover silently from JWT expiry.
 */
export async function refreshExternalToken(
  impersonatedOrgId?: string | null
): Promise<void> {
  if (impersonatedOrgId !== undefined) {
    const scopeKey = getScopeKey(impersonatedOrgId);
    if (!clientCache.has(scopeKey)) return;
    await refreshTokenInPlace(scopeKey, impersonatedOrgId);
    return;
  }
  const scopes = Array.from(clientCache.keys());
  await Promise.all(
    scopes.map((scopeKey) =>
      refreshTokenInPlace(
        scopeKey,
        scopeKey === DEFAULT_SCOPE ? null : scopeKey
      ).catch((err) =>
        console.warn(
          `[externalSupabase] refresh failed for scope ${scopeKey}:`,
          err?.message ?? err
        )
      )
    )
  );
}

// Silent recovery: when the tab returns to foreground or the network comes
// back, refresh any cached tokens. The WebSocket stays open via setAuth().
if (typeof window !== "undefined") {
  const maybeRefresh = () => {
    refreshExternalToken().catch(() => {
      /* swallow — handled per-scope */
    });
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeRefresh();
  });
  window.addEventListener("online", maybeRefresh);
  window.addEventListener("focus", maybeRefresh);
}

/**
 * Get a Supabase client connected to the external database.
 * - Reuses the same client across the session (Realtime stays connected).
 * - Refreshes the JWT in place when needed.
 */
export async function getExternalClient(
  impersonatedOrgId?: string | null
): Promise<SupabaseClient> {
  const scopeKey = getScopeKey(impersonatedOrgId);
  const cachedClient = clientCache.get(scopeKey);

  if (cachedClient && isTokenValid(scopeKey)) {
    return cachedClient;
  }

  // If we have a client but the token is stale, refresh in place
  if (cachedClient) {
    await refreshTokenInPlace(scopeKey, impersonatedOrgId);
    return cachedClient;
  }

  // First-time creation
  let refreshPromise = refreshPromises.get(scopeKey);
  if (!refreshPromise) {
    refreshPromise = fetchExternalAuth(impersonatedOrgId).finally(() => {
      refreshPromises.delete(scopeKey);
    });
    refreshPromises.set(scopeKey, refreshPromise);
  }

  const auth = await refreshPromise;
  authCache.set(scopeKey, auth);

  const client = createClient(auth.url, auth.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  // Authenticate the Realtime WebSocket with our custom JWT so RLS applies
  try {
    client.realtime.setAuth(auth.token);
  } catch (err) {
    console.warn("[externalSupabase] initial realtime.setAuth failed:", err);
  }

  clientCache.set(scopeKey, client);
  scheduleAutoRefresh(scopeKey, impersonatedOrgId);
  return client;
}

/**
 * Get the external Supabase base URL (e.g. https://<ref>.supabase.co).
 */
export async function getExternalUrl(
  impersonatedOrgId?: string | null
): Promise<string> {
  const scopeKey = getScopeKey(impersonatedOrgId);
  const cached = authCache.get(scopeKey);
  if (cached && isTokenValid(scopeKey)) {
    return cached.url;
  }
  const auth = await fetchExternalAuth(impersonatedOrgId);
  authCache.set(scopeKey, auth);
  return auth.url;
}

/**
 * Invalidate cached client(s) (e.g., on logout or org switch).
 */
export function clearExternalClient(impersonatedOrgId?: string | null): void {
  const purge = (scopeKey: string) => {
    const timer = refreshTimers.get(scopeKey);
    if (timer) clearTimeout(timer);
    refreshTimers.delete(scopeKey);

    const client = clientCache.get(scopeKey);
    if (client) {
      try {
        client.removeAllChannels();
      } catch {
        // ignore
      }
    }
    authCache.delete(scopeKey);
    clientCache.delete(scopeKey);
    refreshPromises.delete(scopeKey);
  };

  if (impersonatedOrgId) {
    purge(getScopeKey(impersonatedOrgId));
    return;
  }

  Array.from(authCache.keys()).forEach(purge);
}
