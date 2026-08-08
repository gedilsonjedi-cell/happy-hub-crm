import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GUPSHUP_API_BASE = 'https://api.gupshup.io/wa/api/v1/msg';

function normalizePhoneThreadValue(phone: string): string {
  const normalized = String(phone || '').replace(/\D/g, '');
  if (!normalized) return '';
  if (normalized.length <= 11 && !normalized.startsWith('55')) return `55${normalized}`;
  return normalized;
}

function getPhoneThreadVariants(phone: string): string[] {
  const normalized = normalizePhoneThreadValue(phone);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  if (normalized.startsWith('55') && normalized.length >= 10) {
    const withoutCountry = normalized.slice(2);
    const areaCode = withoutCountry.slice(0, 2);
    const localNumber = withoutCountry.slice(2);
    if (localNumber.length === 9 && localNumber.startsWith('9')) {
      variants.add(`55${areaCode}${localNumber.slice(1)}`);
    } else if (localNumber.length === 8) {
      variants.add(`55${areaCode}9${localNumber}`);
    }
  }

  return Array.from(variants);
}

function getPhoneLookupVariants(phone: string): string[] {
  const variants = new Set<string>();
  for (const variant of getPhoneThreadVariants(phone)) {
    variants.add(variant);
    variants.add(`+${variant}`);
  }
  return Array.from(variants);
}

function buildPhoneMatch(phone: string): { normalized: string; filter: string } {
  const normalized = normalizePhoneThreadValue(phone);
  const exactFilter = getPhoneLookupVariants(normalized).map((value) => `conversation_phone.eq.${value}`);
  const suffix8 = normalized.slice(-8);
  const fallbackFilter = suffix8 ? [`conversation_phone.ilike.%${suffix8}`] : [];
  return { normalized, filter: [...exactFilter, ...fallbackFilter].join(',') };
}

function pickAssignmentRow(rows: Array<Record<string, any>>, preferredUserId?: string | null) {
  return [...rows].sort((a, b) => {
    if (preferredUserId) {
      if (a.assigned_to === preferredUserId && b.assigned_to !== preferredUserId) return -1;
      if (b.assigned_to === preferredUserId && a.assigned_to !== preferredUserId) return 1;
    }
    if (!!a.assigned_to !== !!b.assigned_to) return a.assigned_to ? -1 : 1;
    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
  })[0] || null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // External DB — messages go here exclusively
    const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    const externalSupabase = (extUrl && extKey) ? createClient(extUrl, extKey) : null;

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    let supabase;
    let userId: string | null = null;

    if (isServiceRole) {
      console.log('Using service role authentication');
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      userId = 'service_role';
    } else {
      supabase = createClient(
        supabaseUrl,
        supabaseAnonKey,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          return new Response(
            JSON.stringify({ error: 'Invalid or expired token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        userId = user.id;
      } else {
        userId = claimsData.claims.sub as string;
      }
      console.log('Authenticated user:', userId);
    }

    const {
      channelId,
      destination,
      message,
      messageType,
      mediaUrl,
      mediaCaption,
      fileName,
      templateName,
      templateParams,
    } = await req.json();

    if (!channelId || !destination) {
      return new Response(
        JSON.stringify({ success: false, error: 'Channel ID e destino são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message && !mediaUrl && messageType !== 'template') {
      return new Response(
        JSON.stringify({ success: false, error: 'Mensagem ou mídia são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get channel credentials
    // For Gupshup: access_token = API Key, app_name = App Name (src.name), phone = source number
    const serviceRoleClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: channel, error: channelError } = await serviceRoleClient
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('provider', 'gupshup')
      .single();

    if (channelError || !channel) {
      console.error('Gupshup channel not found:', channelError);
      return new Response(
        JSON.stringify({ success: false, error: 'Canal Gupshup não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!channel.access_token || !channel.app_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Canal não possui credenciais Gupshup configuradas (API Key e App Name)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check blacklist
    if (channel.organization_id) {
      const { data: isBlacklisted } = await serviceRoleClient.rpc(
        'is_phone_blacklisted',
        {
          _organization_id: channel.organization_id,
          _phone: destination.replace(/\D/g, '')
        }
      );

      if (isBlacklisted) {
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
    }

    const gupshupApiKey = channel.access_token;
    const appName = channel.app_name; // src.name
    const sourcePhone = channel.phone.replace(/\D/g, '');
    const cleanDestination = destination.replace(/\D/g, '');

    const ensureHumanSenderOwnsConversation = async (): Promise<Response | null> => {
      const humanUserId = userId && userId !== 'service_role' ? userId : null;
      if (!humanUserId) return null;
      if (!externalSupabase || !channel.organization_id) {
        return json({ success: false, error: 'Não foi possível validar o dono deste atendimento. Envio bloqueado por segurança.', code: 'OWNERSHIP_UNVERIFIED' }, 403);
      }

      const { normalized, filter } = buildPhoneMatch(cleanDestination);
      if (!normalized || !filter) return json({ success: false, error: 'Telefone inválido para validar o atendimento.', code: 'INVALID_PHONE' }, 400);

      const now = new Date().toISOString();
      const botPausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data: assignmentRows, error } = await externalSupabase
        .from('conversation_assignments')
        .select('id, assigned_to, status, sector_id, lead_id, channel_id, conversation_phone, updated_at, created_at')
        .eq('organization_id', channel.organization_id)
        .eq('channel_id', channelId)
        .or(filter)
        .limit(10);

      if (error) return json({ success: false, error: 'Falha ao validar o dono deste atendimento. Envio bloqueado.', code: 'OWNERSHIP_LOOKUP_FAILED' }, 403);

      const foreignOwner = assignmentRows?.find((row: any) => row.assigned_to && row.assigned_to !== humanUserId);
      if (foreignOwner) {
        return json({ success: false, error: 'Este atendimento pertence a outro atendente. Transfira o atendimento antes de enviar mensagem.', code: 'ASSIGNMENT_OWNER_MISMATCH', assignment: foreignOwner }, 403);
      }

      const assignment = pickAssignmentRow(assignmentRows || [], humanUserId);
      if (assignment?.id) {
        const updates: Record<string, unknown> = { status: 'in_progress', is_bot_handling: false, bot_paused_until: botPausedUntil, updated_at: now };
        if (!assignment.assigned_to) {
          updates.assigned_to = humanUserId;
          updates.assigned_at = now;
        }
        const { error: updateError } = await externalSupabase
          .from('conversation_assignments')
          .update(updates)
          .eq('id', assignment.id)
          .eq('organization_id', channel.organization_id)
          .or(`assigned_to.is.null,assigned_to.eq.${humanUserId}`);
        if (updateError) console.error('[Gupshup-Send] Assignment update failed (send continues):', updateError.message);
        return null;
      }

      const { error: insertError } = await externalSupabase
        .from('conversation_assignments')
        .insert({
          organization_id: channel.organization_id,
          channel_id: channelId,
          conversation_phone: normalized,
          assigned_to: humanUserId,
          assigned_at: now,
          status: 'in_progress',
          is_bot_handling: false,
          bot_paused_until: botPausedUntil,
          updated_at: now,
        });
      if (insertError) {
        const { data: racedRows } = await externalSupabase
          .from('conversation_assignments')
          .select('id, assigned_to, status, sector_id, lead_id, channel_id, conversation_phone, updated_at, created_at')
          .eq('organization_id', channel.organization_id)
          .eq('channel_id', channelId)
          .or(filter)
          .limit(10);
        const racedOwner = racedRows?.find((row: any) => row.assigned_to && row.assigned_to !== humanUserId);
        if (racedOwner) return json({ success: false, error: 'Este atendimento pertence a outro atendente. Transfira o atendimento antes de enviar mensagem.', code: 'ASSIGNMENT_OWNER_MISMATCH', assignment: racedOwner }, 403);
        console.warn('[Gupshup-Send] Proceeding with send despite assignment insert failure:', insertError.message);
        return null;
      }
      return null;
    };

    const markAnswered = async () => {
      const humanUserId = userId && userId !== 'service_role' ? userId : null;
      if (!humanUserId || !externalSupabase || !channel.organization_id || !cleanDestination) return;
      const { filter } = buildPhoneMatch(cleanDestination);
      const { data: assignmentRows } = await externalSupabase
        .from('conversation_assignments')
        .select('id, assigned_to, updated_at, created_at')
        .eq('organization_id', channel.organization_id)
        .eq('channel_id', channelId)
        .or(filter)
        .limit(10);
      const assignment = pickAssignmentRow(assignmentRows || [], humanUserId);
      if (!assignment?.id) return;
      await externalSupabase.from('conversation_stats')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('assignment_id', assignment.id)
        .eq('organization_id', channel.organization_id);
    };

    const ownershipBlock = await ensureHumanSenderOwnsConversation();
    if (ownershipBlock) return ownershipBlock;

    console.log('Sending WhatsApp message via Gupshup:', {
      appName,
      sourcePhone,
      destination: cleanDestination,
      hasMedia: !!mediaUrl,
      messageType: messageType || 'text',
    });

    // Build Gupshup message payload
    let gupshupMessage: Record<string, unknown>;
    let storedContent = message || '';
    let storedMessageType = 'text';

    if (messageType === 'template' && templateName) {
      // Template message
      gupshupMessage = {
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          ...(templateParams && templateParams.length > 0
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: templateParams.map((p: string) => ({ type: 'text', text: p })),
                  },
                ],
              }
            : {}),
        },
      };
      storedContent = `[Template: ${templateName}]`;
      storedMessageType = 'template';
    } else if (mediaUrl) {
      // Media message
      switch (messageType) {
        case 'image':
          gupshupMessage = {
            type: 'image',
            originalUrl: mediaUrl,
            caption: mediaCaption || '',
            previewUrl: mediaUrl,
          };
          storedContent = mediaCaption || '[Imagem]';
          storedMessageType = 'image';
          break;
        case 'video':
          gupshupMessage = {
            type: 'video',
            url: mediaUrl,
            caption: mediaCaption || '',
          };
          storedContent = mediaCaption || '[Vídeo]';
          storedMessageType = 'video';
          break;
        case 'audio':
        case 'ptt':
        case 'voice':
          gupshupMessage = {
            type: 'audio',
            url: mediaUrl,
          };
          storedContent = '[Áudio]';
          storedMessageType = 'audio';
          break;
        case 'document':
        case 'file':
          gupshupMessage = {
            type: 'file',
            url: mediaUrl,
            filename: fileName || 'document',
          };
          storedContent = fileName || '[Documento]';
          storedMessageType = 'document';
          break;
        default:
          gupshupMessage = {
            type: 'file',
            url: mediaUrl,
            filename: fileName || 'file',
          };
          storedContent = fileName || '[Arquivo]';
          storedMessageType = 'file';
      }
    } else {
      // Text message
      gupshupMessage = {
        type: 'text',
        text: message,
      };
      storedContent = message;
      storedMessageType = 'text';
    }

    // Send via Gupshup API (application/x-www-form-urlencoded)
    const formData = new URLSearchParams();
    formData.append('channel', 'whatsapp');
    formData.append('source', sourcePhone);
    formData.append('src.name', appName);
    formData.append('destination', cleanDestination);
    formData.append('message', JSON.stringify(gupshupMessage));

    console.log('Gupshup request:', GUPSHUP_API_BASE, formData.toString());

    const gupshupResponse = await fetch(GUPSHUP_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': gupshupApiKey,
      },
      body: formData.toString(),
    });

    const responseText = await gupshupResponse.text();
    console.log('Gupshup response:', gupshupResponse.status, responseText);

    let responseData: Record<string, unknown>;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!gupshupResponse.ok || responseData.status === 'error') {
      const errorMessage = (responseData.message as string) || responseText || 'Erro ao enviar mensagem via Gupshup';
      console.error('Gupshup error:', errorMessage);

      // Store failed message
      const failedMessageId = `gupshup_failed_${Date.now()}`;
      const failedData = {
          channel_id: channelId,
          organization_id: channel.organization_id,
          message_id: failedMessageId,
          sender_phone: sourcePhone,
          message_type: storedMessageType,
          content: storedContent,
          media_url: mediaUrl || null,
          direction: 'outbound',
          status: 'failed',
          error_message: errorMessage,
          metadata: {
            destination: cleanDestination,
            mediaType: messageType,
            fileName,
            provider: 'gupshup',
            sent_by_human: userId !== 'service_role',
            originalError: responseText,
          },
      };
      const msgDb = externalSupabase!;
      await msgDb.from('whatsapp_messages').upsert(failedData, { onConflict: 'message_id', ignoreDuplicates: true });
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          details: responseData,
          messageId: failedMessageId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messageId = (responseData.messageId as string) || `gupshup_out_${Date.now()}`;
    console.log('Message sent successfully via Gupshup:', messageId);

    // Store outbound message
    const outboundData = {
        channel_id: channelId,
        organization_id: channel.organization_id,
        message_id: messageId,
        sender_phone: sourcePhone,
        message_type: storedMessageType,
        content: storedContent,
        media_url: mediaUrl || null,
        direction: 'outbound',
        status: 'sent',
        metadata: {
          destination: cleanDestination,
          mediaType: messageType,
          fileName,
          provider: 'gupshup',
          external_persisted_first: true,
          sent_by_human: userId !== 'service_role',
        },
    };
    const msgDb2 = externalSupabase!;
    await msgDb2.from('whatsapp_messages').upsert(outboundData, { onConflict: 'message_id', ignoreDuplicates: true });
    await markAnswered();

    return new Response(
      JSON.stringify({
        success: true,
        messageId,
        message: 'Mensagem enviada com sucesso!',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in gupshup-send:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
