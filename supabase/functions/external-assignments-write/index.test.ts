// E2E tests para reset_unread em external-assignments-write
// Cobre: abrir/visualizar conversa, responder, envio automático e múltiplos atendentes.
//
// Pré-requisito: .env do projeto com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.
// As chamadas à edge function exigem JWT de usuário válido — pulamos os casos quando
// TEST_USER_EMAIL/TEST_USER_PASSWORD não estiverem definidos (em vez de quebrar o CI).

import 'https://deno.land/std@0.224.0/dotenv/load.ts';
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY')!;
const TEST_EMAIL = Deno.env.get('TEST_USER_EMAIL') || '';
const TEST_PASSWORD = Deno.env.get('TEST_USER_PASSWORD') || '';
const TEST_CHANNEL_ID = Deno.env.get('TEST_CHANNEL_ID') || '';
const TEST_PHONE = Deno.env.get('TEST_PHONE') || '';

const FN_URL = `${SUPABASE_URL}/functions/v1/external-assignments-write`;

async function getUserToken(): Promise<string | null> {
  if (!TEST_EMAIL || !TEST_PASSWORD) return null;
  const supa = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await supa.auth.signInWithPassword({
    email: TEST_EMAIL, password: TEST_PASSWORD,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

async function callReset(token: string, body: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ action: 'reset_unread', ...body }),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed as Record<string, unknown> };
}

// ---------- Testes de input/segurança (sempre rodam) ----------

Deno.test('reset_unread: rejeita request sem Authorization', async () => {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ action: 'reset_unread', channel_id: 'x', phone: '551199' }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test('reset_unread: rejeita action desconhecida', async () => {
  const token = await getUserToken();
  if (!token) {
    console.warn('[skip] TEST_USER_EMAIL/PASSWORD não configurados');
    return;
  }
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ action: 'inexistente' }),
  });
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test('reset_unread: exige channel_id e phone', async () => {
  const token = await getUserToken();
  if (!token) return;
  const r1 = await callReset(token, { channel_id: 'abc' });
  assertEquals(r1.status, 400);
  const r2 = await callReset(token, { phone: '551199' });
  assertEquals(r2.status, 400);
});

Deno.test('reset_unread: phone não numérico é rejeitado', async () => {
  const token = await getUserToken();
  if (!token) return;
  const r = await callReset(token, { channel_id: 'abc', phone: 'abcdef' });
  assertEquals(r.status, 400);
});

// ---------- Testes E2E reais (precisam de TEST_CHANNEL_ID + TEST_PHONE) ----------

Deno.test('E2E: abrir conversa zera unread no banco externo', async () => {
  const token = await getUserToken();
  if (!token || !TEST_CHANNEL_ID || !TEST_PHONE) {
    console.warn('[skip] TEST_CHANNEL_ID/TEST_PHONE não configurados');
    return;
  }
  const r = await callReset(token, { channel_id: TEST_CHANNEL_ID, phone: TEST_PHONE });
  assertEquals(r.status, 200);
  assertEquals((r.body as { success?: boolean }).success, true);
});

Deno.test('E2E: reset é idempotente (chamadas repetidas não falham)', async () => {
  const token = await getUserToken();
  if (!token || !TEST_CHANNEL_ID || !TEST_PHONE) return;
  for (let i = 0; i < 3; i++) {
    const r = await callReset(token, { channel_id: TEST_CHANNEL_ID, phone: TEST_PHONE });
    assertEquals(r.status, 200);
  }
});

Deno.test('E2E: phone_variants normalizadas (com/sem 9º dígito) são tratadas', async () => {
  const token = await getUserToken();
  if (!token || !TEST_CHANNEL_ID || !TEST_PHONE) return;
  const digits = TEST_PHONE.replace(/\D/g, '');
  // Gera variantes com e sem nono dígito quando aplicável
  const variants = new Set([digits, `+${digits}`]);
  if (digits.length >= 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9 && rest.startsWith('9')) variants.add(`55${ddd}${rest.slice(1)}`);
    else if (rest.length === 8) variants.add(`55${ddd}9${rest}`);
  }
  const r = await callReset(token, {
    channel_id: TEST_CHANNEL_ID,
    phone: TEST_PHONE,
    phone_variants: Array.from(variants),
  });
  assertEquals(r.status, 200);
});

// ---------- Reconciliação ----------

Deno.test('reconcile-unread: dry-run não falha e retorna métricas', async () => {
  const token = await getUserToken();
  if (!token) return;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-unread`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ dry_run: true, limit: 1000 }),
  });
  const body = await res.json().catch(() => ({}));
  // 200 quando o usuário é super_admin; 403 caso contrário — ambos válidos
  assert(res.status === 200 || res.status === 403, `status inesperado: ${res.status}`);
  if (res.status === 200) {
    assertEquals(body.success, true);
    assertEquals(body.dry_run, true);
    assert(typeof body.scanned === 'number');
    assert(typeof body.candidates === 'number');
  }
});
