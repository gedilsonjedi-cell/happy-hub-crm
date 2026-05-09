// Shared client para o banco EXTERNO (DB master) usando service role.
// Usado por edge functions que precisam ler/escrever em conversation_assignments,
// conversation_stats e (na fase 2B) leads no externo.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

let _client: SupabaseClient | null = null;

export function getExternalDb(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('EXTERNAL_SUPABASE_URL');
  const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('EXTERNAL_SUPABASE_URL or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY missing');
  }
  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });
  return _client;
}
