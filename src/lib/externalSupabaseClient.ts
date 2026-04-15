/**
 * External Supabase Client
 *
 * Creates and manages a Supabase client that connects directly to the
 * external database using a short-lived JWT (5 min) obtained from the
 * external-auth-token edge function.
 *
 * This eliminates the need for the external-db-proxy edge function,
 * reducing Cloud compute costs significantly.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface ExternalAuthResponse {
  token: string;
  url: string;
  anonKey: string;
  expiresAt: number; // ms timestamp
}

let cachedAuth: ExternalAuthResponse | null = null;
let cachedClient: SupabaseClient | null = null;
let refreshPromise: Promise<ExternalAuthResponse> | null = null;

// Refresh 60s before expiry
const REFRESH_BUFFER_MS = 60_000;

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

function isTokenValid(): boolean {
  if (!cachedAuth) return false;
  return Date.now() < cachedAuth.expiresAt - REFRESH_BUFFER_MS;
}

/**
 * Get a Supabase client connected to the external database.
 * Automatically handles token refresh and caching.
 */
export async function getExternalClient(
  impersonatedOrgId?: string | null
): Promise<SupabaseClient> {
  // If token is still valid and client exists, return cached
  if (isTokenValid() && cachedClient) {
    return cachedClient;
  }

  // Deduplicate concurrent refresh calls
  if (!refreshPromise) {
    refreshPromise = fetchExternalAuth(impersonatedOrgId).finally(() => {
      refreshPromise = null;
    });
  }

  const auth = await refreshPromise;
  cachedAuth = auth;

  // Create a new client with the fresh token
  cachedClient = createClient(auth.url, auth.anonKey, {
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

  return cachedClient;
}

/**
 * Invalidate cached client (e.g., on logout or org switch).
 */
export function clearExternalClient(): void {
  cachedAuth = null;
  cachedClient = null;
  refreshPromise = null;
}
