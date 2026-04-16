/**
 * External Supabase Client
 *
 * Creates and manages Supabase clients that connect directly to the
 * external database using short-lived JWTs obtained from the
 * external-auth-token edge function.
 *
 * Supports separate cache scopes per effective organization so Super Admin
 * impersonation never reuses a token from a different client/org.
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

/**
 * Get a Supabase client connected to the external database.
 * Automatically handles token refresh and caching per effective org scope.
 */
export async function getExternalClient(
  impersonatedOrgId?: string | null
): Promise<SupabaseClient> {
  const scopeKey = getScopeKey(impersonatedOrgId);
  const cachedClient = clientCache.get(scopeKey);

  if (cachedClient && isTokenValid(scopeKey)) {
    return cachedClient;
  }

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
  });

  clientCache.set(scopeKey, client);
  return client;
}

/**
 * Get the external Supabase base URL (e.g. https://<ref>.supabase.co).
 * Reuses the auth cache when possible.
 */
export async function getExternalUrl(
  impersonatedOrgId?: string | null
): Promise<string> {
  const scopeKey = getScopeKey(impersonatedOrgId);
  const cached = authCache.get(scopeKey);
  if (cached && isTokenValid(scopeKey)) {
    return cached.url;
  }
  // Force a refresh to get the URL
  const auth = await fetchExternalAuth(impersonatedOrgId);
  authCache.set(scopeKey, auth);
  return auth.url;
}

/**
 * Invalidate cached client(s) (e.g., on logout or org switch).
 */
export function clearExternalClient(impersonatedOrgId?: string | null): void {
  if (impersonatedOrgId) {
    const scopeKey = getScopeKey(impersonatedOrgId);
    authCache.delete(scopeKey);
    clientCache.delete(scopeKey);
    refreshPromises.delete(scopeKey);
    return;
  }

  authCache.clear();
  clientCache.clear();
  refreshPromises.clear();
}
