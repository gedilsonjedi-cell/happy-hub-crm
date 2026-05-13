import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Updated to latest stable Meta API version for better template delivery
const META_API_VERSION = 'v22.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const META_TEMPLATE_SEND_API_BASES = [
  META_API_BASE,
  'https://graph.facebook.com/v21.0',
  'https://graph.facebook.com/v20.0',
  'https://graph.facebook.com/v19.0',
  'https://graph.facebook.com/v18.0',
];

// Retry configuration only for transient infra/provider errors.
const MAX_RETRIES = 2;
const MAX_TEMPLATE_135000_RECOVERY_ATTEMPTS = 6;
const RETRY_DELAY_MS = 1500;
const RETRYABLE_ERROR_CODES = [
  1,      // Internal error
  2,      // Service unavailable
  4,      // Rate limit (but we add exponential backoff)
  100,    // Invalid parameter (sometimes transient)
];

// External DB is the SINGLE SOURCE OF TRUTH for whatsapp_messages
const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
// deno-lint-ignore no-explicit-any
const externalSupabase: any = (extUrl && extKey) ? createClient(extUrl, extKey) : null;
// deno-lint-ignore no-explicit-any
const localMessageDb: any = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
// Internal DB client (alias) used for non-message tables (webhooks, etc.)
// deno-lint-ignore no-explicit-any
const supabase: any = localMessageDb;
/** DB where whatsapp_messages live — external only, NO internal fallback */
// deno-lint-ignore no-explicit-any
const messageDb: any = externalSupabase || localMessageDb;
const webhookDispatcherUrl = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/webhook-dispatcher`;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const headerMediaIdCache = new Map<string, string>();
type MutableTemplatePayload = Record<string, unknown> & {
  template?: { components?: Array<{ type?: string; parameters?: Array<Record<string, unknown>> }> };
};

async function insertMessageRecord(data: Record<string, unknown>) {
  const result = await messageDb
    .from('whatsapp_messages')
    .upsert(data, { onConflict: 'message_id', ignoreDuplicates: true })
    .select('id, message_id')
    .maybeSingle();

  if (result.error) {
    console.error('[Meta-Send] Message write failed:', result.error);
  }

  // Upsert contact in external DB for outbound messages (fire-and-forget)
  if (!result.error && externalSupabase && data.channel_id) {
    const destPhone = (data.metadata as Record<string, unknown>)?.destination as string;
    if (destPhone) {
      externalSupabase
        .from('whatsapp_contacts')
        .upsert(
          {
            channel_id: String(data.channel_id),
            organization_id: data.organization_id ? String(data.organization_id) : null,
            sender_phone: destPhone,
            sender_name: null,
            last_message_at: new Date().toISOString(),
          },
          { onConflict: 'channel_id,sender_phone', ignoreDuplicates: false }
        )
        .then(() => {})
        .catch((e: unknown) => console.warn('[Meta-Send Contact upsert] Error:', e));
    }
  }

  return result;
}

async function markConversationAnswered(params: {
  organizationId: string | null | undefined;
  channelId: string;
  conversationPhone: string;
  userId: string | null;
  resetUnread?: boolean;
}) {
  if (!externalSupabase || !params.organizationId || !params.channelId || !params.conversationPhone) return;
  const humanUserId = params.userId && params.userId !== 'service_role' ? params.userId : null;
  if (!humanUserId) return;
  const norm = params.conversationPhone.replace(/\D/g, '');
  if (!norm) return;
  const now = new Date().toISOString();
  const botPausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: assignments, error: readError } = await externalSupabase
    .from('conversation_assignments')
    .select('id, assigned_to')
    .eq('organization_id', params.organizationId)
    .eq('channel_id', params.channelId)
    .or(`conversation_phone.eq.${norm},conversation_phone.eq.+${norm}`)
    .limit(1);

  if (readError) {
    console.error('[Meta-Send] Assignment lookup before answer failed:', readError.message);
    return;
  }

  let assignmentId = assignments?.[0]?.id ?? null;
  const currentOwner = assignments?.[0]?.assigned_to ?? null;

  if (!assignmentId) {
    const { data: created, error: createError } = await externalSupabase
      .from('conversation_assignments')
      .upsert({
        organization_id: params.organizationId,
        channel_id: params.channelId,
        conversation_phone: norm,
        assigned_to: humanUserId,
        assigned_at: humanUserId ? now : null,
        status: humanUserId ? 'in_progress' : 'pending',
        is_bot_handling: false,
        bot_paused_until: humanUserId ? botPausedUntil : null,
        updated_at: now,
      }, { onConflict: 'channel_id,conversation_phone' })
      .select('id')
      .single();

    if (createError) {
      console.error('[Meta-Send] Assignment upsert before answer failed:', createError.message);
      return;
    }
    assignmentId = created?.id ?? null;
  } else if (humanUserId) {
    const updates: Record<string, unknown> = {
      status: 'in_progress',
      is_bot_handling: false,
      bot_paused_until: botPausedUntil,
      updated_at: now,
    };
    if (!currentOwner) {
      updates.assigned_to = humanUserId;
      updates.assigned_at = now;
    }

    const { error: updateError } = await externalSupabase
      .from('conversation_assignments')
      .update(updates)
      .eq('id', assignmentId)
      .eq('organization_id', params.organizationId);
    if (updateError) {
      console.error('[Meta-Send] Assignment update after answer failed:', updateError.message);
    }
  }

  if (assignmentId && params.resetUnread !== false) {
    const { error: resetError } = await externalSupabase
      .from('conversation_stats')
      .update({ unread_count: 0, updated_at: now })
      .eq('assignment_id', assignmentId)
      .eq('organization_id', params.organizationId);
    if (resetError) {
      console.error('[Meta-Send] Unread reset after answer failed:', resetError.message);
    }
  }
}

interface IntegrationWebhookPayload {
  organization_id: string;
  event: 'message_created' | 'message_updated';
  data: Record<string, unknown>;
}

function runInBackground(promise: Promise<unknown>) {
  if (typeof (globalThis as any).EdgeRuntime?.waitUntil === 'function') {
    (globalThis as any).EdgeRuntime.waitUntil(promise);
  } else {
    promise.catch(() => {});
  }
}

// In-memory cache of orgs that have active webhooks (TTL 5 min)
const orgWebhookCache = new Map<string, { hasWebhooks: boolean; expiry: number }>();

async function orgHasActiveWebhooks(orgId: string): Promise<boolean> {
  const now = Date.now();
  const cached = orgWebhookCache.get(orgId);
  if (cached && cached.expiry > now) return cached.hasWebhooks;

  try {
    const { count, error } = await supabase
      .from('webhooks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1);

    const has = !error && (count ?? 0) > 0;
    orgWebhookCache.set(orgId, { hasWebhooks: has, expiry: now + 300_000 });
    return has;
  } catch {
    return false;
  }
}

async function dispatchIntegrationWebhook(payload: IntegrationWebhookPayload) {
  if (!payload.organization_id || !serviceRoleKey) return;

  const hasWebhooks = await orgHasActiveWebhooks(payload.organization_id);
  if (!hasWebhooks) return;

  try {
    const response = await fetch(webhookDispatcherUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[Meta-Send] Webhook dispatch failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('[Meta-Send] Webhook dispatch error:', error);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface MetaTemplateDefinition {
  languageCode: string | null;
  status?: string | null;
  parameterFormat?: string | null;
  components?: unknown[] | null;
}

interface MetaTemplateComponent {
  type?: string;
  text?: string;
  example?: {
    body_text_named_params?: Array<{ param_name?: string; example?: string }>;
  };
}

async function fetchMetaTemplateDefinition(
  wabaId: string | null | undefined,
  accessToken: string,
  templateName: string,
): Promise<MetaTemplateDefinition | null> {
  if (!wabaId || !templateName) return null;

  const fetchPage = async (pageUrl: string) => {
    const response = await fetch(pageUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.warn('[Meta-Send] Failed to fetch template definition:', response.status, await response.text());
      return null;
    }

    return await response.json() as {
      data?: Array<{ name?: string; language?: string; status?: string; parameter_format?: string; components?: unknown[] }>;
      paging?: { next?: string };
    };
  };

  const initialUrl = new URL(`${META_API_BASE}/${wabaId}/message_templates`);
  initialUrl.searchParams.set('fields', 'name,language,status,parameter_format,components');
  initialUrl.searchParams.set('limit', '100');
  initialUrl.searchParams.set('name', templateName);

  let page = await fetchPage(initialUrl.toString());
  let nextPageUrl = page?.paging?.next;
  let attempts = 0;

  while (page && attempts < 3) {
    const match = page.data?.find((template) => template.name === templateName);
    if (match) {
      return {
        languageCode: match.language ?? null,
        status: match.status ?? null,
        parameterFormat: match.parameter_format ?? null,
        components: match.components ?? null,
      };
    }

    if (!nextPageUrl) break;
    attempts += 1;
    page = await fetchPage(nextPageUrl);
    nextPageUrl = page?.paging?.next;
  }

  return null;
}

function sanitizeTemplateParam(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u00A0\u200B-\u200D\uFEFF]|\uFE0E|\uFE0F|\u20E3/g, ' ')
    .replace(/(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|www\.whatsapp\.com)\S*/gi, '')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1024);
}

function hasUnsupportedTemplateContent(value: string): boolean {
  return /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|www\.whatsapp\.com)\S*/i.test(value)
    || /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu.test(value)
    || /[\u00A0\u200B-\u200D\uFEFF]|\uFE0E|\uFE0F|\u20E3/.test(value);
}

function getExpectedBodyParamCount(components: unknown[] | null | undefined): number | null {
  if (!Array.isArray(components)) return null;

  const bodyComponent = components.find((component) => {
    const typedComponent = component as MetaTemplateComponent;
    return typedComponent?.type?.toUpperCase() === 'BODY';
  }) as MetaTemplateComponent | undefined;

  if (!bodyComponent?.text) return 0;

  const matches = [...bodyComponent.text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)];
  if (matches.length === 0) return 0;

  const placeholders = new Set(matches.map((match) => match[1]));
  return placeholders.size;
}

function getBodyParameterNames(components: unknown[] | null | undefined): string[] {
  if (!Array.isArray(components)) return [];

  const bodyComponent = components.find((component) => {
    const typedComponent = component as MetaTemplateComponent;
    return typedComponent?.type?.toUpperCase() === 'BODY';
  }) as MetaTemplateComponent | undefined;

  const namedParams = bodyComponent?.example?.body_text_named_params;
  if (Array.isArray(namedParams) && namedParams.length > 0) {
    return namedParams
      .map((param) => String(param?.param_name || '').trim())
      .filter(Boolean);
  }

  if (!bodyComponent?.text) return [];
  return [...bodyComponent.text.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi)]
    .map((match) => match[1])
    .filter(Boolean);
}

interface MetaHeaderInfo {
  format: string | null; // TEXT, IMAGE, VIDEO, DOCUMENT
  hasVariable: boolean;
  exampleUrl: string | null;
}

function getHeaderInfo(components: unknown[] | null | undefined): MetaHeaderInfo | null {
  if (!Array.isArray(components)) return null;

  const headerComponent = components.find((component: any) => {
    return component?.type?.toUpperCase() === 'HEADER';
  }) as any | undefined;

  if (!headerComponent) return null;

  const format = headerComponent.format?.toUpperCase() || 'TEXT';
  
  // Check for variable in header text
  const hasTextVariable = format === 'TEXT' && headerComponent.text && /\{\{\s*\d+\s*\}\}/.test(headerComponent.text);
  
  // For media headers (IMAGE, VIDEO, DOCUMENT), check if there's an example
  const isMediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format);
  let exampleUrl: string | null = null;
  
  if (isMediaHeader && headerComponent.example?.header_handle) {
    exampleUrl = Array.isArray(headerComponent.example.header_handle) 
      ? headerComponent.example.header_handle[0] 
      : headerComponent.example.header_handle;
  }

  return {
    format,
    hasVariable: hasTextVariable || isMediaHeader,
    exampleUrl,
  };
}

function getButtonComponents(components: unknown[] | null | undefined): unknown[] {
  if (!Array.isArray(components)) return [];

  const buttonsComponent = components.find((component: any) => {
    return component?.type?.toUpperCase() === 'BUTTONS';
  }) as any | undefined;

  if (!buttonsComponent?.buttons) return [];

  // Check for URL buttons with variables
  const urlButtonsWithVars: unknown[] = [];
  buttonsComponent.buttons.forEach((button: any, index: number) => {
    if (button.type === 'URL' && button.url && /\{\{\s*\d+\s*\}\}/.test(button.url)) {
      // Has dynamic URL variable — needs example or param
      const exampleValue = button.example?.[0] || '';
      urlButtonsWithVars.push({
        type: 'button',
        sub_type: 'url',
        index,
        parameters: [{ type: 'text', text: exampleValue }]
      });
    }
  });

  return urlButtonsWithVars;
}

// Mime type fallback order for audio retries
const AUDIO_MIME_FALLBACKS: { mimeType: string; filename: string }[] = [
  { mimeType: 'audio/ogg', filename: 'audio.ogg' },
  { mimeType: 'audio/opus', filename: 'audio.opus' },
  { mimeType: 'audio/mpeg', filename: 'audio.mp3' },
  { mimeType: 'audio/aac', filename: 'audio.aac' },
];

// Helper function to upload media to Meta and get media ID
async function uploadMediaToMeta(
  phoneNumberId: string,
  accessToken: string,
  mediaUrl: string,
  mimeType: string,
  arrayBuffer?: ArrayBuffer
): Promise<{ mediaId: string | null; usedMimeType: string }> {
  try {
    console.log('Uploading media to Meta:', { mediaUrl, mimeType });
    
    // Download the media from the URL if not provided
    let buffer = arrayBuffer;
    if (!buffer) {
      const mediaResponse = await fetch(mediaUrl);
      if (!mediaResponse.ok) {
        console.error('Failed to download media:', mediaResponse.status);
        return { mediaId: null, usedMimeType: mimeType };
      }
      const mediaBlob = await mediaResponse.blob();
      buffer = await mediaBlob.arrayBuffer();
    }
    
    // Create form data for Meta upload
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    
    // Determine filename based on mime type
    let filename = 'file.bin';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      filename = 'image.jpg';
    } else if (mimeType.includes('png')) {
      filename = 'image.png';
    } else if (mimeType.includes('webp')) {
      filename = 'image.webp';
    } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
      filename = 'audio.m4a';
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      filename = 'audio.mp3';
    } else if (mimeType === 'audio/opus') {
      filename = 'audio.opus';
    } else if (mimeType.includes('aac')) {
      filename = 'audio.aac';
    } else if (mimeType.includes('ogg')) {
      filename = 'audio.ogg';
    }
    
    console.log('Creating blob with:', { mimeType, filename });
    
    // Create a proper File/Blob for upload
    const file = new Blob([buffer], { type: mimeType });
    formData.append('file', file, filename);
    
    // Upload to Meta
    const uploadResponse = await fetch(
      `${META_API_BASE}/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      }
    );
    
    const uploadText = await uploadResponse.text();
    console.log('Meta upload response:', uploadResponse.status, uploadText);
    
    if (!uploadResponse.ok) {
      console.error('Failed to upload media to Meta:', uploadText);
      return { mediaId: null, usedMimeType: mimeType };
    }
    
    const uploadResult = JSON.parse(uploadText);
    console.log('Media uploaded successfully, ID:', uploadResult.id);
    return { mediaId: uploadResult.id, usedMimeType: mimeType };
    
  } catch (error) {
    console.error('Error uploading media to Meta:', error);
    return { mediaId: null, usedMimeType: mimeType };
  }
}

function getTemplateHeaderParameter(payload: MutableTemplatePayload): Record<string, unknown> | null {
  return payload.template?.components?.find((component) => component?.type === 'header')?.parameters?.[0] || null;
}

function removeTemplateHeaderMediaComponent(payload: MutableTemplatePayload): boolean {
  const components = payload.template?.components;
  if (!Array.isArray(components)) return false;

  const nextComponents = components.filter((component) => component?.type !== 'header');
  if (nextComponents.length === components.length) return false;

  payload.template!.components = nextComponents;
  console.log('[Meta-Send] Retrying template without explicit media header component');
  return true;
}

function removeTemplateBodyComponent(payload: MutableTemplatePayload): boolean {
  const components = payload.template?.components;
  if (!Array.isArray(components)) return false;

  const nextComponents = components.filter((component) => component?.type !== 'body');
  if (nextComponents.length === components.length) return false;

  payload.template!.components = nextComponents;
  console.log('[Meta-Send] Retrying template without explicit body variables');
  return true;
}

function replaceTemplateHeaderMediaLink(payload: MutableTemplatePayload, replacementUrl: string): boolean {
  const headerParam = getTemplateHeaderParameter(payload);
  if (!headerParam || !replacementUrl) return false;
  const mediaType = String(headerParam.type || '').toLowerCase();
  const mediaObject = headerParam[mediaType] as { link?: string; id?: string } | undefined;
  if (!mediaType || !mediaObject?.link || mediaObject.link === replacementUrl) return false;
  headerParam[mediaType] = { link: replacementUrl };
  console.log('[Meta-Send] Retrying template header with Meta-approved sample media link');
  return true;
}

function adjustTemplateComponentParamCount(
  payload: MutableTemplatePayload,
  componentType: 'body' | 'header',
  expectedCount: number,
): boolean {
  const components = payload.template?.components;
  if (!Array.isArray(components) || expectedCount < 0) return false;

  const component = components.find((item) => item?.type === componentType);
  if (!component) return false;

  if (expectedCount === 0) {
    payload.template!.components = components.filter((item) => item?.type !== componentType);
    console.log(`[Meta-Send] Retrying template without ${componentType} parameters after Meta #132000`);
    return true;
  }

  const params = Array.isArray(component.parameters) ? component.parameters : [];
  if (params.length === expectedCount) return false;

  component.parameters = params
    .slice(0, expectedCount)
    .concat(
      Array.from({ length: Math.max(expectedCount - params.length, 0) }, () => ({
        type: 'text',
        text: 'Cliente',
      })),
    );
  console.log(`[Meta-Send] Retrying template with ${expectedCount} ${componentType} parameter(s) after Meta #132000`);
  return true;
}

function recoverTemplateParamCountMismatch(
  payload: MutableTemplatePayload,
  error: Record<string, unknown> | undefined,
  usedRecoveries: Set<string>,
): boolean {
  const details = String(
    ((error?.error_data as Record<string, unknown> | undefined)?.details)
      || error?.message
      || '',
  );
  const match = details.match(/\b(body|header)\b[^()]*\((\d+)\)[^()]*\((\d+)\)/i);
  const componentType = (match?.[1]?.toLowerCase() || 'body') as 'body' | 'header';
  const expectedCount = match ? Number(match[3]) : 0;
  const recoveryKey = `${componentType}:${expectedCount}`;

  if (usedRecoveries.has(recoveryKey)) return false;
  usedRecoveries.add(recoveryKey);

  return adjustTemplateComponentParamCount(payload, componentType, expectedCount);
}

async function convertTemplateHeaderLinkToMediaId(
  payload: MutableTemplatePayload,
  phoneNumberId: string,
  accessToken: string,
): Promise<boolean> {
  const headerParam = getTemplateHeaderParameter(payload);
  if (!headerParam) return false;

  const mediaType = String(headerParam.type || '').toLowerCase();
  const mediaObject = headerParam[mediaType] as { link?: string; id?: string } | undefined;
  const mediaLink = mediaObject?.link;
  if (!mediaType || !mediaLink || mediaObject?.id) return false;

  const cacheKey = `${phoneNumberId}:${mediaLink}`;
  let mediaId = headerMediaIdCache.get(cacheKey) || null;
  if (!mediaId) {
    const mimeType = mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'application/pdf';
    const uploadResult = await uploadMediaToMeta(phoneNumberId, accessToken, mediaLink, mimeType);
    mediaId = uploadResult.mediaId;
    if (mediaId) headerMediaIdCache.set(cacheKey, mediaId);
  }

  if (!mediaId) return false;
  headerParam[mediaType] = { id: mediaId };
  console.log('[Meta-Send] Retrying template header with Meta media_id:', mediaId);
  return true;
}

// Helper function to upload audio with automatic retry using different mime types
async function uploadAudioWithRetry(
  phoneNumberId: string,
  accessToken: string,
  mediaUrl: string,
  initialMimeType: string
): Promise<{ mediaId: string | null; usedMimeType: string }> {
  console.log('Starting audio upload with retry logic:', { mediaUrl, initialMimeType });
  
  // First, download the media once to reuse
  let arrayBuffer: ArrayBuffer;
  try {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      console.error('Failed to download media:', mediaResponse.status);
      return { mediaId: null, usedMimeType: initialMimeType };
    }
    const mediaBlob = await mediaResponse.blob();
    arrayBuffer = await mediaBlob.arrayBuffer();
  } catch (error) {
    console.error('Error downloading media:', error);
    return { mediaId: null, usedMimeType: initialMimeType };
  }
  
  // Try initial mime type first
  let result = await uploadMediaToMeta(phoneNumberId, accessToken, mediaUrl, initialMimeType, arrayBuffer);
  if (result.mediaId) {
    console.log('Upload succeeded with initial mime type:', initialMimeType);
    return result;
  }
  
  // If initial failed, try fallback mime types
  console.log('Initial upload failed, trying fallback mime types...');
  for (const fallback of AUDIO_MIME_FALLBACKS) {
    if (fallback.mimeType === initialMimeType) continue; // Skip already tried
    
    console.log('Trying fallback mime type:', fallback.mimeType);
    result = await uploadMediaToMeta(phoneNumberId, accessToken, mediaUrl, fallback.mimeType, arrayBuffer);
    
    if (result.mediaId) {
      console.log('Upload succeeded with fallback mime type:', fallback.mimeType);
      return result;
    }
  }
  
  console.error('All mime type attempts failed');
  return { mediaId: null, usedMimeType: initialMimeType };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    // Extract the token from the auth header
    const token = authHeader.replace('Bearer ', '');
    
    // Check if it's a service role key:
    // 1) Direct match against current SERVICE_ROLE_KEY env
    // 2) JWT payload with role=service_role (works across key rotations / multiple valid keys)
    let isServiceRole = token === supabaseServiceKey;
    if (!isServiceRole) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          // base64url decode
          const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
          const payload = JSON.parse(atob(padded));
          if (payload?.role === 'service_role') {
            isServiceRole = true;
            console.log('[Meta-Send] Detected service_role via JWT payload claim');
          }
        }
      } catch (e) {
        console.warn('[Meta-Send] Could not parse JWT payload:', e);
      }
    }
    
    let supabase;
    let userId: string | null = null;
    
    if (isServiceRole) {
      // Service role access - create admin client
      console.log('Using service role authentication');
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      userId = 'service_role'; // Mark as service role
    } else {
      // User token access - validate the user using getClaims (recommended approach)
      supabase = createClient(
        supabaseUrl,
        supabaseAnonKey,
        { global: { headers: { Authorization: authHeader } } }
      );

      // Try getClaims first (recommended for signing-keys)
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      
      if (claimsError || !claimsData?.claims) {
        // Fallback to getUser if getClaims fails (for backwards compatibility)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.error('Authentication failed:', claimsError?.message || authError?.message);
          return new Response(
            JSON.stringify({ error: 'Invalid or expired token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        userId = user.id;
        console.log('Authenticated user via getUser:', userId);
      } else {
        userId = claimsData.claims.sub as string;
        console.log('Authenticated user via getClaims:', userId);
      }
    }

    const { 
      channelId, 
      destination, 
      message, 
      templateName, 
      templateParams,
      templateLanguage = 'pt_BR',
      mediaType,
      messageType,
      mediaUrl,
      mediaCaption,
      fileName,
      campaignId
    } = await req.json();

    // Support both mediaType and messageType parameters
    const effectiveMediaType = mediaType || messageType;

    if (!channelId || !destination) {
      return new Response(
        JSON.stringify({ success: false, error: 'Channel ID e destino são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message && !templateName && !mediaUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Mensagem, template ou mídia são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get channel credentials
    // For Meta API: access_token = Meta Access Token, app_name = Phone Number ID
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .single();

    if (channelError || !channel) {
      console.error('Channel not found:', channelError);
      return new Response(
        JSON.stringify({ success: false, error: 'Canal não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!channel.access_token || !channel.app_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal não possui credenciais Meta configuradas (Access Token e Phone Number ID)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for balance operations
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parallelize independent checks: super_admin + pricing + blacklist
    const cleanDest = destination.replace(/\D/g, '');
    
    const [superAdminResult, pricingResult, blacklistResult] = await Promise.all([
      // Super admin check
      (userId && userId !== 'service_role')
        ? serviceRoleClient.rpc('is_super_admin', { _user_id: userId })
        : Promise.resolve({ data: userId === 'service_role' }),
      // Pricing
      serviceRoleClient.from('dispatch_pricing').select('price_per_message').eq('dispatch_type', 'service').single(),
      // Blacklist
      channel.organization_id
        ? serviceRoleClient.rpc('is_phone_blacklisted', { _organization_id: channel.organization_id, _phone: cleanDest })
        : Promise.resolve({ data: false, error: null }),
    ]);

    const isSuperAdmin = !!superAdminResult.data;
    console.log('User/Role:', userId, 'Is SuperAdmin:', isSuperAdmin);

    const pricePerMessage = pricingResult.data?.price_per_message ?? 0.008;

    if (blacklistResult.data) {
      console.log('Destination is blacklisted:', destination);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Este contato está na lista negra e não pode receber mensagens.',
          code: 'BLACKLISTED'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const phoneNumberId = channel.app_name; // Phone Number ID from Meta
    const accessToken = channel.access_token;
    const cleanDestination = destination.replace(/\D/g, '');

    console.log('Sending WhatsApp message via Meta Cloud API:', {
      phoneNumberId,
      destination: cleanDestination,
      hasTemplate: !!templateName,
      hasMedia: !!mediaUrl,
      mediaType: effectiveMediaType,
      pricePerMessage
    });

    // CRITICAL: ensure assignment BEFORE sending, preserving any existing owner.
    if (userId && userId !== 'service_role') {
      await markConversationAnswered({
        organizationId: channel.organization_id,
        channelId,
        conversationPhone: cleanDestination,
        userId,
        resetUnread: false,
      });
    }

    let messagePayload: MutableTemplatePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanDestination
    };

    // Fetch template content and buttons for metadata storage
    let templateContent: string | null = null;
    let templateButtons: unknown[] | null = null;
    let headerInfo: ReturnType<typeof getHeaderInfo> | null = null;
    let customHeaderMediaUrl: string | null = null;
    let template135000RecoveryStep = 0;
    const template132000Recoveries = new Set<string>();
    let activeMetaMessagesApiBase = META_API_BASE;
    let alternateMetaApiBaseIndex = 1;
    const sanitizedTemplateParams = Array.isArray(templateParams)
      ? templateParams.map((param) => sanitizeTemplateParam(String(param ?? '')))
      : [];
    const hadUnsupportedTemplateParams = Array.isArray(templateParams)
      ? templateParams.some((param) => hasUnsupportedTemplateContent(String(param ?? '')))
      : false;
    
    if (templateName) {
      const metaTemplateDefinition = await fetchMetaTemplateDefinition(
        channel.waba_id,
        accessToken,
        templateName,
      );
      const resolvedTemplateLanguage = metaTemplateDefinition?.languageCode || templateLanguage || 'pt_BR';
      const expectedBodyParamCount = getExpectedBodyParamCount(metaTemplateDefinition?.components);
      const bodyParameterNames = getBodyParameterNames(metaTemplateDefinition?.components);
      const usesNamedBodyParams = (metaTemplateDefinition?.parameterFormat || '').toLowerCase() === 'named'
        || bodyParameterNames.length > 0;
      const hasProvidedTemplateParams = Array.isArray(templateParams);

      headerInfo = getHeaderInfo(metaTemplateDefinition?.components);
      const buttonComponents = getButtonComponents(metaTemplateDefinition?.components);

      console.log('[Meta-Send] Resolved template metadata:', {
        templateName,
        requestedLanguage: templateLanguage,
        resolvedLanguage: resolvedTemplateLanguage,
        metaStatus: metaTemplateDefinition?.status ?? null,
        parameterFormat: metaTemplateDefinition?.parameterFormat ?? null,
        expectedBodyParamCount,
        providedTemplateParamCount: sanitizedTemplateParams.length,
        bodyParameterNames,
        headerInfo,
        buttonComponentsCount: buttonComponents.length,
        metaComponents: JSON.stringify(metaTemplateDefinition?.components ?? []),
      });

      // Fetch template from database to store content in metadata
      // Also pulls header_media_url so the user can override the Meta sample image
      // with their own uploaded media (managed in the Templates page).
      const { data: templateData } = await serviceRoleClient
        .from('message_templates')
        .select('content, components, header_media_url')
        .eq('name', templateName)
        .eq('organization_id', channel.organization_id)
        .single();
      
      if (templateData) {
        templateContent = templateData.content;
        // Extract buttons supporting BOTH shapes:
        //  - Legacy: { buttons: [...] }
        //  - Meta raw: array of components, with one of type BUTTONS containing buttons[]
        const rawComps: unknown = templateData.components;
        if (Array.isArray(rawComps)) {
          const btnComp = (rawComps as Array<{ type?: string; buttons?: unknown[] }>).find(
            (c) => String(c?.type || '').toUpperCase() === 'BUTTONS',
          );
          templateButtons = (btnComp?.buttons as unknown[]) || null;
        } else if (rawComps && typeof rawComps === 'object') {
          templateButtons = ((rawComps as { buttons?: unknown[] }).buttons) || null;
        }
        // Fallback: use buttons from live Meta definition if local is empty
        if ((!templateButtons || templateButtons.length === 0) && Array.isArray(metaTemplateDefinition?.components)) {
          const btnComp = (metaTemplateDefinition!.components as Array<{ type?: string; buttons?: unknown[] }>).find(
            (c) => String(c?.type || '').toUpperCase() === 'BUTTONS',
          );
          templateButtons = (btnComp?.buttons as unknown[]) || null;
        }
        const rawHeaderUrl = (templateData as { header_media_url?: string | null }).header_media_url;
        if (typeof rawHeaderUrl === 'string' && rawHeaderUrl.trim().length > 0) {
          customHeaderMediaUrl = rawHeaderUrl.trim();
        }
      }
      
      // Send template message
      const components: unknown[] = [];

      // Add HEADER component if template requires media header
      if (headerInfo && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerInfo.format || '')) {
        const headerMediaType = headerInfo.format!.toLowerCase();
        // Prefer the user-provided override URL; fall back to Meta's example handle.
        const effectiveHeaderUrl = customHeaderMediaUrl || headerInfo.exampleUrl;
        if (effectiveHeaderUrl) {
          components.push({
            type: 'header',
            parameters: [{
              type: headerMediaType,
              [headerMediaType]: { link: effectiveHeaderUrl }
            }]
          });
        }
        // If no URL at all, Meta uses the template default — no header component needed.
      } else if (headerInfo && headerInfo.format === 'TEXT' && headerInfo.hasVariable) {
        // TEXT header with variable — use first template param or empty
        const headerText = sanitizedTemplateParams.length > 0 ? sanitizedTemplateParams[0] : '';
        components.push({
          type: 'header',
          parameters: [{ type: 'text', text: headerText }]
        });
      }

      if ((expectedBodyParamCount ?? 0) > 0 && !hasProvidedTemplateParams) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `O template ${templateName} exige ${expectedBodyParamCount} variável(is), mas nenhuma foi enviada.`
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (hasProvidedTemplateParams && (expectedBodyParamCount ?? sanitizedTemplateParams.length) > 0) {
        if (
          expectedBodyParamCount !== null
          && sanitizedTemplateParams.length !== expectedBodyParamCount
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `O template ${templateName} exige ${expectedBodyParamCount} variável(is), mas recebeu ${sanitizedTemplateParams.length}.`
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Only reject if original params had content that was fully stripped by sanitization
        // (e.g., params that were only emojis/WhatsApp links). Allow legitimately empty params.
        if (hadUnsupportedTemplateParams && sanitizedTemplateParams.some((param) => !param)) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Uma ou mais variáveis do template contêm apenas conteúdo não suportado pela Meta. Remova emojis, links do WhatsApp e caracteres invisíveis.'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        components.push({
          type: 'body',
          parameters: sanitizedTemplateParams.map((param: string, index: number) => ({
            type: 'text',
            ...(usesNamedBodyParams && bodyParameterNames[index]
              ? { parameter_name: bodyParameterNames[index] }
              : {}),
            text: param,
          }))
        });
      }

      if ((expectedBodyParamCount ?? 0) === 0 && sanitizedTemplateParams.length > 0) {
        console.warn('[Meta-Send] Ignoring unexpected template params for template without BODY placeholders', {
          templateName,
          providedTemplateParamCount: sanitizedTemplateParams.length,
        });
      }

      // Add BUTTON components with dynamic URLs
      if (buttonComponents.length > 0) {
        components.push(...buttonComponents);
      }

      messagePayload = {
        ...messagePayload,
        type: 'template',
        template: {
          name: templateName,
          language: { code: resolvedTemplateLanguage },
          ...(components.length > 0 && { components })
        }
      };
    } else if (mediaUrl) {
      // Send media message
      switch (effectiveMediaType) {
        case 'image':
          messagePayload = {
            ...messagePayload,
            type: 'image',
            image: {
              link: mediaUrl,
              ...(mediaCaption && { caption: mediaCaption })
            }
          };
          break;
        case 'video':
          messagePayload = {
            ...messagePayload,
            type: 'video',
            video: {
              link: mediaUrl,
              ...(mediaCaption && { caption: mediaCaption })
            }
          };
          break;
        case 'audio':
        case 'ptt':
        case 'voice':
          // Check if the file is WebM format (not supported by WhatsApp)
          const isWebMFile = mediaUrl.toLowerCase().includes('.webm');
          
          if (isWebMFile) {
            console.error('WebM audio format is not supported by WhatsApp API');
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: 'Formato de áudio WebM não suportado pelo WhatsApp. Por favor, envie um arquivo de áudio no formato OGG, MP3 ou AAC.',
                details: 'Browser recordings in WebM format cannot be sent via WhatsApp API. Use the media upload feature with a supported audio file instead.',
                code: 'WEBM_NOT_SUPPORTED'
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // STRATEGY: Upload audio to Meta first to obtain a media_id.
          // Sending via media_id is far more reliable than via public link
          // for áudios — Meta frequently rejects audios via link with error
          // 131053 (media upload failed) when downloading from external storage.
          // We fall back to link only if the upload truly fails.
          {
            const lowerUrl = mediaUrl.toLowerCase();
            let initialAudioMime = 'audio/mpeg';
            if (lowerUrl.endsWith('.ogg') || lowerUrl.endsWith('.opus')) initialAudioMime = 'audio/ogg';
            else if (lowerUrl.endsWith('.m4a') || lowerUrl.endsWith('.mp4')) initialAudioMime = 'audio/mp4';
            else if (lowerUrl.endsWith('.aac')) initialAudioMime = 'audio/aac';
            else if (lowerUrl.endsWith('.amr')) initialAudioMime = 'audio/amr';

            console.log('Processing audio: trying media_id upload first', { mediaUrl, initialAudioMime });

            const uploadResult = await uploadAudioWithRetry(
              phoneNumberId,
              accessToken,
              mediaUrl,
              initialAudioMime
            );

            if (uploadResult.mediaId) {
              console.log('Audio uploaded to Meta, using media_id:', uploadResult.mediaId);
              messagePayload = {
                ...messagePayload,
                type: 'audio',
                audio: { id: uploadResult.mediaId }
              };
            } else {
              console.warn('Audio media_id upload failed for all mime types — falling back to direct link');
              messagePayload = {
                ...messagePayload,
                type: 'audio',
                audio: { link: mediaUrl }
              };
            }
          }
          break;
        case 'document':
        case 'file':
          messagePayload = {
            ...messagePayload,
            type: 'document',
            document: {
              link: mediaUrl,
              ...(fileName && { filename: fileName }),
              ...(mediaCaption && { caption: mediaCaption })
            }
          };
          break;
        case 'sticker':
          messagePayload = {
            ...messagePayload,
            type: 'sticker',
            sticker: {
              link: mediaUrl
            }
          };
          break;
        default:
          messagePayload = {
            ...messagePayload,
            type: 'document',
            document: {
              link: mediaUrl,
              filename: fileName || 'file'
            }
          };
      }
    } else {
      // Send text message
      messagePayload = {
        ...messagePayload,
        type: 'text',
        text: {
          preview_url: true,
          body: message
        }
      };
    }

    console.log('Meta API payload:', JSON.stringify(messagePayload));

    // Retry logic for transient infra/provider errors only.
    let lastError: unknown = null;
    let lastResponseData: Record<string, unknown> | null = null;
    let metaResponse: Response | null = null;
    
    const maxMetaSendAttempts = templateName ? MAX_TEMPLATE_135000_RECOVERY_ATTEMPTS : MAX_RETRIES;
    for (let attempt = 0; attempt <= maxMetaSendAttempts; attempt++) {
      if (attempt > 0) {
        const delayMs = templateName ? 300 : RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Template recovery should stay fast
        console.log(`[Meta-Send] Retry attempt ${attempt}/${maxMetaSendAttempts} after ${delayMs}ms...`);
        await sleep(delayMs);
      }
      
      try {
        const payloadForAttempt = JSON.stringify(messagePayload);
        metaResponse = await fetch(
          `${activeMetaMessagesApiBase}/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: payloadForAttempt
          }
        );

        const responseData = await metaResponse.json();
        lastResponseData = responseData;
        console.log(`[Meta-Send] Attempt ${attempt + 1} response:`, metaResponse.status, JSON.stringify(responseData));

        if (metaResponse.ok && !responseData.error) {
          // Success! Break out of retry loop
          console.log(`[Meta-Send] Success on attempt ${attempt + 1}`);
          break;
        }
        
        // Check if this error is retryable
        const errorCode = responseData.error?.code;
        if (
          templateName
          && Number(errorCode) === 132000
          && attempt < maxMetaSendAttempts
          && recoverTemplateParamCountMismatch(
            messagePayload,
            responseData.error as Record<string, unknown> | undefined,
            template132000Recoveries,
          )
        ) {
          lastError = responseData.error;
          continue;
        }
        if (
          templateName
          && Number(errorCode) === 135000
          && attempt < MAX_TEMPLATE_135000_RECOVERY_ATTEMPTS
          && template135000RecoveryStep === 0
          && headerInfo?.exampleUrl
          && replaceTemplateHeaderMediaLink(messagePayload, headerInfo.exampleUrl)
        ) {
          template135000RecoveryStep = 1;
          lastError = responseData.error;
          continue;
        }
        if (
          templateName
          && Number(errorCode) === 135000
          && attempt < MAX_TEMPLATE_135000_RECOVERY_ATTEMPTS
          && template135000RecoveryStep <= 1
          && await convertTemplateHeaderLinkToMediaId(messagePayload, phoneNumberId, accessToken)
        ) {
          console.log('[Meta-Send] Generic template error may be header media link related; retrying with uploaded media id...');
          template135000RecoveryStep = 2;
          lastError = responseData.error;
          continue;
        }
        if (templateName && Number(errorCode) === 135000 && attempt < MAX_TEMPLATE_135000_RECOVERY_ATTEMPTS) {
          const nextApiBase = META_TEMPLATE_SEND_API_BASES[alternateMetaApiBaseIndex];
          if (nextApiBase) {
            activeMetaMessagesApiBase = nextApiBase;
            alternateMetaApiBaseIndex += 1;
            template135000RecoveryStep += 1;
            console.log('[Meta-Send] Retrying template with alternate Meta API version:', activeMetaMessagesApiBase);
            lastError = responseData.error;
            continue;
          }
        }
        if (errorCode && RETRYABLE_ERROR_CODES.includes(errorCode) && attempt < MAX_RETRIES) {
          console.log(`[Meta-Send] Retryable error ${errorCode}, will retry...`);
          lastError = responseData.error;
          continue;
        }
        
        // Non-retryable error or max retries reached
        lastError = responseData.error;
        break;
        
      } catch (fetchError) {
        console.error(`[Meta-Send] Fetch error on attempt ${attempt + 1}:`, fetchError);
        lastError = fetchError;
        if (attempt === maxMetaSendAttempts) break;
      }
    }

    // Check final result
    if (!metaResponse || !lastResponseData || !metaResponse.ok || lastResponseData.error) {
      const errorMessage = (lastResponseData?.error as Record<string, string>)?.message || 'Erro ao enviar mensagem via Meta API';
      const errorCode = (lastResponseData?.error as Record<string, number>)?.code || 'UNKNOWN_ERROR';
      console.error('[Meta-Send] Final error after all attempts:', lastResponseData?.error || lastError);
      
      // Translate common Meta error codes to user-friendly messages
      let friendlyError = errorMessage;
      const numericErrorCode = typeof errorCode === 'number' ? errorCode : parseInt(String(errorCode), 10);
      
      // Map of error codes to friendly messages
      const errorMessages: Record<number, string> = {
        135000: '(#135000) Erro genérico do Meta. SOLUÇÃO: Recrie o template no Meta Business ou reconecte o número.',
        131049: '(#131049) Limite de MARKETING atingido para este contato. A Meta limita mensagens de marketing POR USUÁRIO. Use templates UTILITY ou aguarde o contato responder.',
        131026: '(#131026) Número sem WhatsApp ou bloqueado. Verifique se o número está correto e tem WhatsApp ativo.',
        131031: '(#131031) Conta com restrições. O WhatsApp restringiu o envio de mensagens desta conta.',
        131047: '(#131047) Janela de 24h expirada. O contato não responde há mais de 24h — envie um TEMPLATE aprovado (HSM) para reabrir a conversa.',
        131053: '(#131053) Mídia inválida ou não suportada pelo WhatsApp.',
        131051: '(#131051) Formato de template incorreto ou parâmetros inválidos.',
        131000: '(#131000) Erro interno do servidor Meta. Tente novamente.',
        130472: '(#130472) Número de destino inválido ou não registrado no WhatsApp.',
        132000: '(#132000) Variáveis do template não conferem com o template aprovado na Meta. O sistema tentou ajustar automaticamente; se persistir, sincronize/recrie o template.',
        132001: '(#132001) Template não existe ou idioma não disponível. Sincronize os templates.',
        10: '(#10) Sem permissão para enviar mensagens. Configure permissões no Meta Business Suite.',
        3: '(#3) Permissão granular ausente. Configure no Meta Developer Console.',
      };
      
      if (numericErrorCode && errorMessages[numericErrorCode]) {
        friendlyError = errorMessages[numericErrorCode];
      } else if (errorMessage.includes('restricted')) {
        friendlyError = '(#131031) Conta com restrições. O WhatsApp restringiu o envio de mensagens desta conta.';
      } else if (errorMessage.includes('healthy ecosystem')) {
        friendlyError = '(#131049) Limite de MARKETING atingido para este contato. Use templates UTILITY.';
      } else if (errorMessage.includes('permission')) {
        friendlyError = 'Erro de permissão. Verifique as configurações no Meta Business Suite.';
      }
      
      // Store failed message in database with error
      const storedMessageType = templateName ? 'template' : (mediaUrl ? effectiveMediaType : 'text');
      let storedContent = '';
      if (templateName) {
        let renderedBody = templateContent || '';
        if (renderedBody && Array.isArray(templateParams)) {
          templateParams.forEach((param: string, index: number) => {
            const placeholder = `{{${index + 1}}}`;
            while (renderedBody.includes(placeholder)) {
              renderedBody = renderedBody.replace(placeholder, param);
            }
          });
        }
        storedContent = renderedBody ? `📋 ${templateName}\n\n${renderedBody}` : `Template: ${templateName}`;
      } else {
        storedContent = message || (mediaUrl ? `[${effectiveMediaType || 'file'}]` : '');
      }
      
      const failedMessageId = `failed_${Date.now()}`;
      const failedData = {
          channel_id: channelId,
          organization_id: channel.organization_id,
          message_id: failedMessageId,
          sender_phone: channel.phone,
          message_type: storedMessageType || 'text',
          content: storedContent,
          media_url: mediaUrl || null,
          direction: 'outbound',
          status: 'failed',
          error_message: friendlyError,
          metadata: { 
            destination: cleanDestination, 
            templateName, 
            templateParams,
            templateLanguage,
            templateContent,
            templateButtons,
            mediaType: effectiveMediaType,
            fileName,
            provider: 'meta',
            sent_by_human: userId !== 'service_role',
            campaignId: campaignId || null,
            originalError: errorMessage,
            errorCode: errorCode,
            retryAttempts: MAX_RETRIES + 1
          }
        };
      const failedInsert = await insertMessageRecord(failedData);
      if (failedInsert.error) {
        console.error('[Meta-Send] Error storing failed message:', failedInsert.error);
      }
      if (externalSupabase) {
        try {
          await externalSupabase.rpc('upsert_conversation_stats_external', {
            _organization_id: channel.organization_id || null,
            _channel_id: channelId, _conversation_phone: cleanDestination,
            _content: storedContent, _direction: 'outbound', _is_read: null,
            _sender_name: null, _created_at: new Date().toISOString(),
          });
        } catch (_e) { /* ignore */ }
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: friendlyError,
          details: lastResponseData?.error,
          messageId: failedMessageId,
          errorCode: errorCode
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract message ID from successful response
    const messages = (lastResponseData as { messages?: Array<{ id?: string }> }).messages;
    const messageId = messages?.[0]?.id || `out_${Date.now()}`;

    // Balance debit disabled - messages are now free
    // Note: Balance system still exists for subscriptions and store purchases
    console.log('Message sent successfully (no charge):', messageId);

    // Determine content and message type for storage
    let storedContent = message || '';
    let storedMessageType = 'text';
    // For template messages, if the template has a media header (custom override
    // or Meta example), persist the media so it shows up in the chat history.
    let storedMediaUrl: string | null = mediaUrl || null;
    let storedMediaType: string | null = effectiveMediaType || null;

    if (templateName) {
      // Store rendered template body in content for chat history visibility
      // Fall back to "Template: name" if no body text available
      let renderedBody = templateContent || '';
      if (renderedBody && Array.isArray(templateParams) && templateParams.length > 0) {
        templateParams.forEach((param: string, index: number) => {
          const placeholder = `{{${index + 1}}}`;
          while (renderedBody.includes(placeholder)) {
            renderedBody = renderedBody.replace(placeholder, param);
          }
        });
      }
      storedContent = renderedBody ? `📋 ${templateName}\n\n${renderedBody}` : `Template: ${templateName}`;
      storedMessageType = 'template';

      // Attach header media (custom override preferred, Meta example as fallback)
      if (headerInfo && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerInfo.format || '')) {
        const headerUrl = customHeaderMediaUrl || headerInfo.exampleUrl || null;
        if (headerUrl) {
          storedMediaUrl = headerUrl;
          storedMediaType = headerInfo.format!.toLowerCase();
        }
      }
    } else if (mediaUrl) {
      storedContent = mediaCaption || `[${effectiveMediaType || 'file'}]`;
      storedMessageType = effectiveMediaType === 'ptt' || effectiveMediaType === 'voice' ? 'audio' : (effectiveMediaType || 'file');
    }

    // Store outbound message in database — SYNCHRONOUS to guarantee persistence
    const outboundData = {
        channel_id: channelId,
        organization_id: channel.organization_id,
        message_id: messageId,
        sender_phone: channel.phone,
        message_type: storedMessageType,
        content: storedContent,
        media_url: storedMediaUrl,
        direction: 'outbound',
        status: 'sent',
        metadata: { 
          destination: cleanDestination, 
          templateName, 
          templateParams,
          templateLanguage,
          templateContent,
          templateButtons,
          mediaType: storedMediaType,
          fileName,
          cost: pricePerMessage,
          provider: 'meta',
          external_persisted_first: true,
          sent_by_human: userId !== 'service_role',
          campaignId: campaignId || null
        }
      };

    // CRITICAL: Write message BEFORE returning response to guarantee it's persisted
    const outboundInsert = await insertMessageRecord(outboundData);
    if (outboundInsert.error) {
      console.error('[Meta-Send] Error storing outbound message:', outboundInsert.error);
    } else {
      console.log('[Meta-Send] Outbound message persisted:', messageId);
    }

    try {
    } catch (e) {
      console.error('[Meta-Send] Internal stats update error:', e);
    }
    if (externalSupabase) {
      try {
        await externalSupabase.rpc('upsert_conversation_stats_external', {
          _organization_id: channel.organization_id || null,
          _channel_id: channelId, _conversation_phone: cleanDestination,
          _content: storedContent, _direction: 'outbound', _is_read: null,
          _sender_name: null, _created_at: new Date().toISOString(),
        });
        await markConversationAnswered({
          organizationId: channel.organization_id,
          channelId,
          conversationPhone: cleanDestination,
          userId,
        });
      } catch (e) {
        console.error('[Meta-Send] External stats update error:', e);
      }
    }

    // Webhook dispatch can stay in background — non-critical
    if (channel.organization_id) {
      const webhookPromise = dispatchIntegrationWebhook({
        organization_id: channel.organization_id,
        event: 'message_created',
        data: {
          message_id: messageId,
          phone: cleanDestination,
          sender_phone: channel.phone,
          content: storedContent,
          direction: 'outbound',
          status: 'sent',
          channel_id: channelId,
          channel_name: channel.name || null,
          channel_phone: channel.phone || null,
          message_type: storedMessageType,
          media_url: storedMediaUrl,
          template_name: templateName || null,
          campaign_id: campaignId || null,
          provider: 'meta',
        },
      }).catch((e: unknown) => console.error('[Meta-Send] Webhook dispatch error:', e));
      runInBackground(webhookPromise);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId,
        message: 'Mensagem enviada com sucesso!',
        cost: pricePerMessage
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in meta-send:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
