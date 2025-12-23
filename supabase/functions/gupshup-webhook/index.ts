import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting - simple in-memory store (resets on function cold start)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60000; // 1 minute in ms

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);
  
  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

// Input validation for webhook payload
function validateWebhookPayload(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  
  // Basic structure check - Gupshup payloads should have certain fields
  const payload = body as Record<string, unknown>;
  
  // Must have type or eventType
  if (!payload.type && !payload.eventType && !payload.payload) {
    return false;
  }
  
  return true;
}

function sanitizeString(str: unknown, maxLength: number = 1000): string {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).trim();
}

function sanitizePhone(phone: unknown): string {
  if (typeof phone !== 'string') return '';
  // Only allow digits, plus sign, and dashes
  return phone.replace(/[^\d+-]/g, '').slice(0, 20);
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Get client IP for rate limiting
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   req.headers.get('x-real-ip') || 
                   'unknown';

  // Handle GET request for webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = url.searchParams.get('hub.verify_token');
    
    console.log('Webhook verification request:', { challenge, verifyToken });
    
    // Return the challenge for webhook verification
    if (challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }
    
    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  // For POST requests, verify authentication
  if (req.method === 'POST') {
    // Rate limiting
    if (!checkRateLimit(clientIP)) {
      console.warn('Rate limit exceeded for IP:', clientIP);
      return new Response(
        JSON.stringify({ status: 'error', message: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for webhook secret token
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const expectedToken = Deno.env.get('GUPSHUP_WEBHOOK_SECRET');
    
    // If a secret is configured, verify it
    if (expectedToken && token !== expectedToken) {
      console.warn('Invalid webhook token from IP:', clientIP);
      return new Response(
        JSON.stringify({ status: 'error', message: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        console.error('Invalid JSON in webhook request');
        return new Response(
          JSON.stringify({ status: 'error', message: 'Invalid JSON' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate payload structure
      if (!validateWebhookPayload(body)) {
        console.error('Invalid webhook payload structure');
        return new Response(
          JSON.stringify({ status: 'error', message: 'Invalid payload' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const payload = body as Record<string, unknown>;
      console.log('Gupshup webhook received:', JSON.stringify(payload).slice(0, 500));

      // Gupshup sends different payload formats
      // Handle message events
      if (payload.type === 'message' || (payload.payload as Record<string, unknown>)?.type === 'message') {
        const innerPayload = (payload.payload || payload) as Record<string, unknown>;
        const messageData = (innerPayload.payload || innerPayload) as Record<string, unknown>;
        
        const senderPhone = sanitizePhone(
          messageData.source || 
          (messageData.sender as Record<string, unknown>)?.phone || 
          payload.mobile
        );
        
        if (!senderPhone) {
          console.error('Missing sender phone');
          return new Response(
            JSON.stringify({ status: 'error', message: 'Missing sender phone' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const messageContent = sanitizeString(
          messageData.text || 
          (messageData.payload as Record<string, unknown>)?.text || 
          messageData.body,
          5000
        );
        const messageType = sanitizeString(messageData.type, 50) || 'text';
        const messageId = sanitizeString(payload.messageId || payload.id, 100) || `msg_${Date.now()}`;
        const appName = sanitizeString(payload.app || payload.appName, 100);
        const senderName = sanitizeString(
          (messageData.sender as Record<string, unknown>)?.name || 
          messageData.name,
          100
        );

        console.log('Processing incoming message:', {
          senderPhone,
          messageContentLength: messageContent.length,
          messageType,
          messageId,
          appName,
          senderName
        });

        // Find the channel by app_name
        let channel = null;
        if (appName) {
          const { data: channelByApp } = await supabase
            .from('channels')
            .select('id, organization_id')
            .eq('app_name', appName)
            .eq('provider', 'gupshup')
            .eq('connected', true)
            .single();

          channel = channelByApp;
        }

        if (!channel) {
          console.log('Channel not found for app:', appName);
          // Try to find by phone number
          const { data: channelByPhone } = await supabase
            .from('channels')
            .select('id, organization_id')
            .eq('provider', 'gupshup')
            .eq('connected', true)
            .limit(1)
            .single();
          
          channel = channelByPhone;
          
          if (!channel) {
            console.log('No matching channel found');
            return new Response(
              JSON.stringify({ status: 'ok', message: 'No channel configured' }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const channelId = channel.id;
        const organizationId = channel.organization_id;

        // Store the incoming message
        const { error: insertError } = await supabase
          .from('whatsapp_messages')
          .insert({
            channel_id: channelId,
            organization_id: organizationId,
            message_id: messageId,
            sender_phone: senderPhone,
            sender_name: senderName,
            message_type: messageType,
            content: messageContent,
            direction: 'inbound',
            status: 'received',
            metadata: payload
          });

        if (insertError) {
          console.error('Error storing message:', insertError);
        } else {
          console.log('Message stored successfully');
        }

        // Check if sender is a lead, if not create one
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('phone', senderPhone)
          .single();

        if (!existingLead && organizationId) {
          // Get first admin user of the organization to assign the lead
          const { data: adminProfile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('organization_id', organizationId)
            .limit(1)
            .single();

          if (adminProfile) {
            // Get initial stage for chatbot
            const { data: chatbotConfig } = await supabase
              .from('chatbot_config')
              .select('initial_stage_id')
              .eq('channel_id', channelId)
              .single();

            const leadName = senderName || `Lead ${senderPhone.slice(-4)}`;
            const { error: leadError } = await supabase
              .from('leads')
              .insert({
                user_id: adminProfile.user_id,
                organization_id: organizationId,
                name: leadName.slice(0, 100),
                phone: senderPhone,
                status: 'new',
                stage_id: chatbotConfig?.initial_stage_id || null,
                notes: 'Lead criado automaticamente via WhatsApp'
              });

            if (leadError) {
              console.error('Error creating lead:', leadError);
            } else {
              console.log('New lead created for:', senderPhone);
            }
          }
        }

        // Trigger chatbot processing
        const chatbotUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-chatbot`;
        
        try {
          const chatbotResponse = await fetch(chatbotUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              channelId,
              senderPhone,
              senderName,
              messageContent,
              messageId,
              organizationId
            })
          });

          const chatbotResult = await chatbotResponse.json();
          console.log('Chatbot result:', chatbotResult);
        } catch (chatbotError) {
          console.error('Error calling chatbot:', chatbotError);
        }
      }

      // Handle message status updates
      if (payload.type === 'message-event' || payload.eventType) {
        const status = sanitizeString(payload.eventType || payload.type, 50);
        const messageId = sanitizeString(payload.messageId || payload.externalId, 100);
        
        console.log('Message status update:', { status, messageId });

        if (messageId) {
          const { error: updateError } = await supabase
            .from('whatsapp_messages')
            .update({ status: status.toLowerCase() })
            .eq('message_id', messageId);

          if (updateError) {
            console.error('Error updating message status:', updateError);
          }
        }
      }

      return new Response(
        JSON.stringify({ status: 'ok' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('Webhook error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(
        JSON.stringify({ status: 'error', message: errorMessage }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ status: 'error', message: 'Method not allowed' }),
    { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
