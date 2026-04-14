import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// External DB is the SINGLE SOURCE OF TRUTH for whatsapp_messages
const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
const externalSupabase = (extUrl && extKey) ? createClient(extUrl, extKey) : null;

/** DB where whatsapp_messages live — external only, NO internal fallback */
const messageDb = externalSupabase || supabase;

/** Write to whatsapp_messages on external DB (no fallback) + update conversation_stats */
function dualWriteMessage(data: Record<string, unknown>, internalChannelId?: string) {
  return messageDb.from('whatsapp_messages').insert(data).then(async (result) => {
    if (result.error) {
      console.error('[Z-API Webhook] Message write failed:', result.error);
    }
    if (!result.error && data.channel_id && data.direction) {
      const phone = data.direction === 'inbound'
        ? (data.sender_phone as string)
        : ((data.metadata as Record<string, unknown>)?.destination as string);
      if (phone) {
        const statsChannelId = internalChannelId || data.channel_id;
        supabase.rpc('upsert_conversation_stats_manual', {
          _channel_id: statsChannelId,
          _conversation_phone: phone,
          _content: (data.content as string) || null,
          _direction: data.direction as string,
          _is_read: (data.is_read as boolean) ?? null,
          _sender_name: (data.sender_name as string) || null,
          _created_at: new Date().toISOString(),
        }).then(() => {}).catch((e: unknown) => console.error('[Stats] Error:', e));
      }
    }
    return result;
  });
}

/** Dual-write lead to external */
function dualWriteLead(data: Record<string, unknown>) {
  const ops = [supabase.from('leads').insert(data).select('id').single()];
  if (externalSupabase) externalSupabase.from('leads').upsert(data, { onConflict: 'id' }).then(() => {}).catch(() => {});
  return ops[0];
}

// ===========================================
// PHONE NORMALIZATION (Single source of truth)
// ===========================================
function normalizePhone(phone: string): string {
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');
  
  // Ensure it starts with 55 (Brazil)
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }
  
  return digits;
}

// Helper function to check if currently within business hours
async function isWithinBusinessHours(organizationId: string): Promise<{ isOpen: boolean; awayMessage: string | null }> {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = brazilTime.getDay();
  const currentTime = brazilTime.toTimeString().slice(0, 5);

  const { data: businessHour } = await supabase
    .from('business_hours')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('day_of_week', dayOfWeek)
    .single();

  if (!businessHour) {
    return { isOpen: true, awayMessage: null };
  }

  if (!businessHour.is_active) {
    const { data: awayConfig } = await supabase
      .from('away_message_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (awayConfig?.is_enabled && awayConfig?.message) {
      return { isOpen: false, awayMessage: awayConfig.message };
    }
    return { isOpen: false, awayMessage: null };
  }

  const startTime = businessHour.start_time.slice(0, 5);
  const endTime = businessHour.end_time.slice(0, 5);
  
  const isOpen = currentTime >= startTime && currentTime <= endTime;

  if (!isOpen) {
    const { data: awayConfig } = await supabase
      .from('away_message_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (awayConfig?.is_enabled && awayConfig?.message) {
      return { isOpen: false, awayMessage: awayConfig.message };
    }
  }

  return { isOpen, awayMessage: null };
}

// Helper function to check if today is a holiday
async function isHoliday(organizationId: string): Promise<{ isHoliday: boolean; awayMessage: string | null }> {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = brazilTime.toISOString().slice(0, 10);
  const monthDay = today.slice(5);

  const { data: exactHoliday } = await supabase
    .from('holidays')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('date', today)
    .single();

  if (exactHoliday) {
    console.log('Today is a holiday:', exactHoliday.name);
    const { data: awayConfig } = await supabase
      .from('away_message_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (awayConfig?.is_enabled && awayConfig?.message) {
      return { isHoliday: true, awayMessage: awayConfig.message };
    }
    return { isHoliday: true, awayMessage: null };
  }

  const { data: holidays } = await supabase
    .from('holidays')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_recurring', true);

  const recurringMatch = holidays?.find(h => h.date.slice(5) === monthDay);
  
  if (recurringMatch) {
    console.log('Today is a recurring holiday:', recurringMatch.name);
    const { data: awayConfig } = await supabase
      .from('away_message_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (awayConfig?.is_enabled && awayConfig?.message) {
      return { isHoliday: true, awayMessage: awayConfig.message };
    }
    return { isHoliday: true, awayMessage: null };
  }

  return { isHoliday: false, awayMessage: null };
}

// Helper function to get next available attendant for a department (round-robin)
async function getNextAvailableAttendant(
  organizationId: string, 
  sectorId: string | null
): Promise<{ userId: string; userName: string } | null> {
  if (!sectorId) {
    console.log('No sector specified, conversation goes to Novos');
    return null;
  }

  const { data: sectorUsers } = await supabase
    .from('user_sectors')
    .select('user_id')
    .eq('sector_id', sectorId);

  if (!sectorUsers || sectorUsers.length === 0) {
    console.log('No users in sector:', sectorId);
    return null;
  }

  const userIds = sectorUsers.map(u => u.user_id);

  const { data: availableAttendants } = await supabase
    .from('attendant_availability')
    .select('user_id, last_assignment_at')
    .eq('organization_id', organizationId)
    .eq('is_available', true)
    .in('user_id', userIds)
    .order('last_assignment_at', { ascending: true, nullsFirst: true });

  if (!availableAttendants || availableAttendants.length === 0) {
    console.log('No online attendants in sector:', sectorId);
    return null;
  }

  const nextAttendant = availableAttendants[0];

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('user_id', nextAttendant.user_id)
    .single();

  const userName = profile?.display_name || profile?.email || 'Atendente';

  console.log('Selected attendant:', nextAttendant.user_id, userName);

  await supabase
    .from('attendant_availability')
    .update({ last_assignment_at: new Date().toISOString() })
    .eq('user_id', nextAttendant.user_id)
    .eq('organization_id', organizationId);

  return { userId: nextAttendant.user_id, userName };
}

// ===========================================
// FIND OR CREATE LEAD (ID-centric approach)
// ===========================================
async function findOrCreateLead(
  organizationId: string,
  channelUserId: string,
  rawPhone: string,
  senderName: string | null
): Promise<{ leadId: string; isNew: boolean }> {
  const normalizedPhone = normalizePhone(rawPhone);
  const localNumber = normalizedPhone.slice(2); // Remove 55
  const phoneEnd8 = localNumber.slice(-8);
  
  // Multiple search patterns for robustness
  const phoneSearchPatterns = [
    normalizedPhone,
    `+${normalizedPhone}`,
    `55${localNumber}`,
    `+55${localNumber}`,
    localNumber,
    rawPhone,
  ];
  
  // Search by exact match first
  const { data: exactMatches } = await supabase
    .from('leads')
    .select('id, name, phone, tags, document')
    .eq('organization_id', organizationId)
    .in('phone', phoneSearchPatterns)
    .limit(10);
  
  // Also try suffix match (last 8 digits - most reliable)
  let suffixMatches: typeof exactMatches = [];
  if (phoneEnd8.length === 8) {
    const { data: suffixData } = await supabase
      .from('leads')
      .select('id, name, phone, tags, document')
      .eq('organization_id', organizationId)
      .like('phone', `%${phoneEnd8}`)
      .limit(10);
    suffixMatches = suffixData || [];
  }
  
  // Combine and deduplicate
  const allMatches = [...(exactMatches || []), ...suffixMatches];
  const uniqueMatches = allMatches.filter((lead, index, self) => 
    index === self.findIndex(l => l.id === lead.id)
  );
  
  if (uniqueMatches.length > 0) {
    // Score leads to find the best one
    const scored = uniqueMatches.map(lead => {
      let score = 0;
      const isAutoGenerated = lead.name?.startsWith('LeadWhats-') || lead.name?.startsWith('WhatsApp ');
      
      if (lead.tags && lead.tags.length > 0) score += 100;
      if (lead.name && !isAutoGenerated) score += 50;
      if (lead.document) score += 5;
      // Prefer leads with normalized phone format
      if (lead.phone === normalizedPhone) score += 10;
      
      return { lead, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    const bestLead = scored[0].lead;
    
    console.log(`Found ${uniqueMatches.length} leads for phone ${rawPhone}, selected: ${bestLead.id}`);
    
    // Update lead name if it was auto-generated
    const isAutoGeneratedName = bestLead.name?.startsWith('LeadWhats-') || 
                                 bestLead.name?.startsWith('WhatsApp ');
    if (isAutoGeneratedName && senderName) {
      await supabase
        .from('leads')
        .update({ 
          name: senderName,
          updated_at: new Date().toISOString()
        })
        .eq('id', bestLead.id);
      console.log('Lead name updated to:', senderName);
    }
    
    // Update phone to normalized format if different
    if (bestLead.phone !== normalizedPhone) {
      await supabase
        .from('leads')
        .update({ 
          phone: normalizedPhone,
          updated_at: new Date().toISOString()
        })
        .eq('id', bestLead.id);
      console.log('Lead phone normalized to:', normalizedPhone);
    }
    
    return { leadId: bestLead.id, isNew: false };
  }
  
  // Create new lead with normalized phone
  const { data: newLead, error: leadError } = await supabase
    .from('leads')
    .insert({
      phone: normalizedPhone,
      name: senderName || `WhatsApp ${normalizedPhone}`,
      user_id: channelUserId,
      organization_id: organizationId,
      status: 'new',
      notes: 'Lead criado automaticamente via WhatsApp (Z-API)'
    })
    .select('id')
    .single();

  if (leadError) {
    console.error('Error creating lead:', leadError);
    throw new Error('Failed to create lead');
  }

  console.log('New lead created:', newLead.id, 'phone:', normalizedPhone);
  return { leadId: newLead.id, isNew: true };
}

// ===========================================
// FIND SECTOR FROM CAMPAIGN (uses lead_id AND phone)
// ===========================================
async function findSectorFromCampaign(
  organizationId: string,
  leadId: string
): Promise<string | null> {
  // REGRA FUNDAMENTAL: Lead disparado com departamento PERTENCE a esse departamento PARA SEMPRE
  // Buscamos a PRIMEIRA campanha com sector_id (a original), não a mais recente
  
  // First try to find by lead_id in campaign_recipients
  const { data: recipientByLead } = await supabase
    .from('campaign_recipients')
    .select('campaign_id, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true }); // OLDEST FIRST - original campaign

  // Check all campaigns for this lead, prioritize the one with sector_id
  for (const recipient of recipientByLead || []) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('sector_id, name')
      .eq('id', recipient.campaign_id)
      .eq('organization_id', organizationId)
      .not('sector_id', 'is', null)
      .single();

    if (campaign?.sector_id) {
      console.log(`Found sector_id from campaign "${campaign.name}" via lead_id:`, campaign.sector_id);
      return campaign.sector_id;
    }
  }

  // Get lead phone for phone-based searches
  const { data: lead } = await supabase
    .from('leads')
    .select('phone')
    .eq('id', leadId)
    .single();

  if (!lead?.phone) return null;

  const normalizedPhone = normalizePhone(lead.phone);
  const phoneEnd8 = normalizedPhone.slice(-8);
  const phoneEnd9 = normalizedPhone.slice(-9);

  // CRITICAL: Search campaign_recipients by phone directly
  // Many campaign_recipients have null lead_id, so we must search by phone
  console.log('Searching campaign_recipients by phone suffix:', phoneEnd8);
  
  // Try multiple phone formats for robust matching
  const phonePatterns = [
    `%${phoneEnd8}`,
    `%${phoneEnd9}`,
    normalizedPhone,
    `55${normalizedPhone.slice(-11)}`,
  ];
  
  // Collect ALL campaign_recipients that match this phone
  const allCampaignIds = new Set<string>();
  
  for (const pattern of phonePatterns) {
    const { data: phoneRecipients } = await supabase
      .from('campaign_recipients')
      .select('campaign_id, created_at')
      .like('phone', pattern)
      .order('created_at', { ascending: true }); // OLDEST FIRST

    for (const recipient of phoneRecipients || []) {
      allCampaignIds.add(recipient.campaign_id);
    }
  }

  // Now check each campaign (oldest first will be checked first due to Set order)
  for (const campaignId of allCampaignIds) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('sector_id, name')
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .not('sector_id', 'is', null)
      .single();

    if (campaign?.sector_id) {
      console.log(`Found sector_id from campaign "${campaign.name}" via phone:`, campaign.sector_id);
      return campaign.sector_id;
    }
  }

  console.log('No sector_id found for lead:', leadId);
  return null;
}

// ===========================================
// FIND OR CREATE CONVERSATION ASSIGNMENT (ID-centric)
// ===========================================
async function handleConversationAssignment(
  organizationId: string,
  channelId: string,
  leadId: string,
  normalizedPhone: string
): Promise<{ assignmentId: string; assignedTo: string | null; status: string }> {
  
  // PRIMARY LOOKUP: By lead_id + channel_id (most reliable)
  let { data: existingAssignment } = await supabase
    .from('conversation_assignments')
    .select('id, assigned_to, status, sector_id, conversation_phone, updated_at')
    .eq('lead_id', leadId)
    .eq('channel_id', channelId)
    .single();
  
  // FALLBACK: If no match by lead_id, try by phone (for legacy data)
  if (!existingAssignment) {
    const phoneEnd8 = normalizedPhone.slice(-8);
    const { data: phoneMatch } = await supabase
      .from('conversation_assignments')
      .select('id, assigned_to, status, sector_id, conversation_phone, lead_id, updated_at')
      .eq('channel_id', channelId)
      .like('conversation_phone', `%${phoneEnd8}`)
      .single();
    
    if (phoneMatch) {
      existingAssignment = phoneMatch;
      
      // Update the assignment to include lead_id for future lookups
      if (!phoneMatch.lead_id) {
        await supabase
          .from('conversation_assignments')
          .update({ 
            lead_id: leadId,
            conversation_phone: normalizedPhone, // Normalize the phone too
            updated_at: new Date().toISOString()
          })
          .eq('id', phoneMatch.id);
        console.log('Updated legacy assignment with lead_id:', leadId);
      }
    }
  }
  
  if (existingAssignment) {
    // EXISTING assignment found
    const wasArchived = existingAssignment.status === 'archived';
    const hasAttendant = !!existingAssignment.assigned_to;

    // Grace period: don't reactivate conversations archived less than 2 minutes ago
    // Only applies to MANUALLY archived conversations (has assigned_to), not campaign-created ones
    const wasRecentlyArchived = wasArchived && hasAttendant && existingAssignment.updated_at &&
      (Date.now() - new Date(existingAssignment.updated_at).getTime()) < 2 * 60 * 1000;

    if (wasRecentlyArchived) {
      console.log(`[Z-API Webhook] Skipping reactivation for recently archived conversation: ${normalizedPhone}`);
      return;
    }
    
    // Update conversation_phone to normalized format if different
    if (existingAssignment.conversation_phone !== normalizedPhone) {
      await supabase
        .from('conversation_assignments')
        .update({ 
          conversation_phone: normalizedPhone,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingAssignment.id);
    }
    
    if (wasArchived) {
      // Conversation was ARCHIVED - reactivate
      console.log('Reactivating archived conversation');
      
      // If had previous attendant, return to them
      if (hasAttendant) {
        console.log('Returning to previous attendant:', existingAssignment.assigned_to);
        
        await supabase
          .from('conversation_assignments')
          .update({
            status: 'active',
            is_bot_handling: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAssignment.id);
        
        return {
          assignmentId: existingAssignment.id,
          assignedTo: existingAssignment.assigned_to,
          status: 'active'
        };
      }
      
      // No previous attendant - try auto-distribution
      const sectorId = await findSectorFromCampaign(organizationId, leadId);
      
      if (sectorId) {
        const nextAttendant = await getNextAvailableAttendant(organizationId, sectorId);
        
        if (nextAttendant) {
          await supabase
            .from('conversation_assignments')
            .update({
              assigned_to: nextAttendant.userId,
              assigned_at: new Date().toISOString(),
              status: 'active',
              is_bot_handling: false,
              sector_id: sectorId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAssignment.id);
          
          console.log('Reactivated and auto-assigned to:', nextAttendant.userName);
          return {
            assignmentId: existingAssignment.id,
            assignedTo: nextAttendant.userId,
            status: 'active'
          };
        }
      }
      
      // No attendant available - set to pending
      await supabase
        .from('conversation_assignments')
        .update({
          status: 'pending',
          is_bot_handling: true,
          sector_id: sectorId || existingAssignment.sector_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAssignment.id);
      
      return {
        assignmentId: existingAssignment.id,
        assignedTo: null,
        status: 'pending'
      };
    }
    
    if (!hasAttendant && existingAssignment.status === 'pending') {
      // Still pending - try auto-distribution
      const sectorId = await findSectorFromCampaign(organizationId, leadId);
      
      if (sectorId) {
        const nextAttendant = await getNextAvailableAttendant(organizationId, sectorId);
        
        if (nextAttendant) {
          await supabase
            .from('conversation_assignments')
            .update({
              assigned_to: nextAttendant.userId,
              assigned_at: new Date().toISOString(),
              status: 'active',
              is_bot_handling: false,
              sector_id: sectorId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAssignment.id);
          
          console.log('Pending conversation auto-assigned to:', nextAttendant.userName);
          return {
            assignmentId: existingAssignment.id,
            assignedTo: nextAttendant.userId,
            status: 'active'
          };
        }
      }
    }
    
    // IMPORTANT: If conversation has no sector_id but we can find one from campaign, update it
    // This ensures existing conversations get properly tagged with their department
    if (!existingAssignment.sector_id) {
      const sectorId = await findSectorFromCampaign(organizationId, leadId);
      if (sectorId) {
        console.log('Updating existing conversation with sector_id:', sectorId);
        await supabase
          .from('conversation_assignments')
          .update({
            sector_id: sectorId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAssignment.id);
        
        // Update the local object for return value
        existingAssignment.sector_id = sectorId;
      }
    }
    
    // Has attendant - belongs to them exclusively
    console.log('Conversation belongs to:', existingAssignment.assigned_to);
    return {
      assignmentId: existingAssignment.id,
      assignedTo: existingAssignment.assigned_to,
      status: existingAssignment.status
    };
  }
  
  // NEW conversation - create assignment
  console.log('Creating new conversation assignment');
  
  // Get sector from campaign
  const sectorId = await findSectorFromCampaign(organizationId, leadId);
  console.log('Sector for new conversation:', sectorId);
  
  // Check portfolio first
  const { data: portfolioEntry } = await supabase
    .from('client_portfolios')
    .select('user_id')
    .eq('lead_id', leadId)
    .eq('organization_id', organizationId)
    .single();

  let assignedTo: string | null = null;
  let status = 'pending';

  if (portfolioEntry) {
    // Lead is in portfolio
    console.log('Lead is in portfolio of:', portfolioEntry.user_id);
    
    const { data: ownerAvailability } = await supabase
      .from('attendant_availability')
      .select('is_available')
      .eq('user_id', portfolioEntry.user_id)
      .eq('organization_id', organizationId)
      .single();

    if (ownerAvailability?.is_available === true) {
      assignedTo = portfolioEntry.user_id;
      status = 'active';
    }
  } else if (sectorId) {
    // Not in portfolio but has sector - auto-distribute
    const nextAttendant = await getNextAvailableAttendant(organizationId, sectorId);
    
    if (nextAttendant) {
      assignedTo = nextAttendant.userId;
      status = 'active';
      console.log('Auto-assigned to:', nextAttendant.userName);
    }
  }

  const { data: newAssignment, error: assignError } = await supabase
    .from('conversation_assignments')
    .insert({
      conversation_phone: normalizedPhone,
      channel_id: channelId,
      lead_id: leadId,
      assigned_to: assignedTo,
      assigned_at: assignedTo ? new Date().toISOString() : null,
      status: status,
      is_bot_handling: !assignedTo,
      sector_id: sectorId,
    })
    .select('id')
    .single();

  if (assignError) {
    console.error('Error creating assignment:', assignError);
    throw new Error('Failed to create assignment');
  }

  console.log('Assignment created:', newAssignment.id, 'assigned to:', assignedTo || 'pending');
  return {
    assignmentId: newAssignment.id,
    assignedTo: assignedTo,
    status: status
  };
}

// Helper function to send WhatsApp message via Z-API
async function sendZApiMessage(instanceId: string, token: string, recipientPhone: string, message: string): Promise<boolean> {
  try {
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }
    
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: cleanPhone,
        message: message
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error sending Z-API message:', errorBody);
      return false;
    }

    console.log('Z-API message sent successfully to:', recipientPhone);
    return true;
  } catch (error) {
    console.error('Error sending Z-API message:', error);
    return false;
  }
}

// ===========================================
// MAIN WEBHOOK HANDLER
// ===========================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Z-API webhook received:', JSON.stringify(body, null, 2));

      const phone = body.phone;
      const instanceId = body.instanceId;
      const messageId = body.messageId || body.id?.id || `zapi_${Date.now()}`;
      
      const isStatusUpdateCallback = body.type === 'MessageStatusCallback';
      const isReceivedCallback = body.type === 'ReceivedCallback';
      
      if (isStatusUpdateCallback) {
        console.log('Status update callback, skipping:', body.status);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      const isFromMe = body.isFromMe === true || body.fromMe === true;
      if (isFromMe) {
        console.log('Message sent by us (from device), pausing bot for 24 hours');
        
        let channelForPause = null;
        if (instanceId) {
          const { data } = await supabase
            .from('channels')
            .select('id, organization_id')
            .eq('app_name', instanceId)
            .eq('provider', 'zapi')
            .single();
          channelForPause = data;
        }
        
        if (channelForPause && phone) {
          const normalizedPhone = normalizePhone(phone);
          const botPausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          
          // Find assignment by phone suffix
          const phoneEnd8 = normalizedPhone.slice(-8);
          const { data: existingAssignment } = await supabase
            .from('conversation_assignments')
            .select('id')
            .eq('channel_id', channelForPause.id)
            .like('conversation_phone', `%${phoneEnd8}`)
            .single();
          
          if (existingAssignment) {
            await supabase
              .from('conversation_assignments')
              .update({ 
                bot_paused_until: botPausedUntil,
                is_bot_handling: false,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingAssignment.id);
            console.log('Bot paused for conversation:', normalizedPhone);
          } else {
            await supabase
              .from('conversation_assignments')
              .insert({
                conversation_phone: normalizedPhone,
                channel_id: channelForPause.id,
                bot_paused_until: botPausedUntil,
                is_bot_handling: false,
                status: 'active'
              });
            console.log('Created assignment with bot paused for:', normalizedPhone);
          }
        }
        
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      if (body.isGroup === true) {
        console.log('Group message, skipping');
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      if (!isReceivedCallback) {
        console.log('Not a ReceivedCallback, skipping. Type:', body.type);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      if (!phone) {
        console.log('No phone number in webhook payload');
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Find channel
      let channel = null;
      
      if (instanceId) {
        const { data } = await supabase
          .from('channels')
          .select('*')
          .eq('app_name', instanceId)
          .eq('provider', 'zapi')
          .single();
        channel = data;
      }
      
      if (!channel) {
        const { data: channels } = await supabase
          .from('channels')
          .select('*')
          .eq('provider', 'zapi')
          .eq('connected', true);
        
        if (channels && channels.length > 0) {
          channel = channels[0];
          console.log('Using first available Z-API channel:', channel.id);
        }
      }

      if (!channel) {
        console.error('Z-API channel not found for instanceId:', instanceId);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      console.log('Found Z-API channel:', channel.id, channel.name);

      // Normalize phone immediately
      const normalizedPhone = normalizePhone(phone);
      let senderName = body.senderName || body.pushName || null;

      // Extract message content
      let content = '';
      let messageType = 'text';
      let mediaUrl = '';

      if (body.text?.message) {
        content = body.text.message;
        messageType = 'text';
      } else if (body.image) {
        content = body.image.caption || '[Imagem]';
        mediaUrl = body.image.imageUrl || body.image.url || '';
        messageType = 'image';
      } else if (body.video) {
        content = body.video.caption || '[Vídeo]';
        mediaUrl = body.video.videoUrl || body.video.url || '';
        messageType = 'video';
      } else if (body.audio) {
        content = '[Áudio]';
        mediaUrl = body.audio.audioUrl || body.audio.url || '';
        messageType = 'audio';
      } else if (body.document) {
        content = body.document.fileName || '[Documento]';
        mediaUrl = body.document.documentUrl || body.document.url || '';
        messageType = 'document';
      } else if (body.sticker) {
        content = '[Sticker]';
        mediaUrl = body.sticker.stickerUrl || body.sticker.url || '';
        messageType = 'sticker';
      } else if (body.location) {
        content = `[Localização: ${body.location.latitude}, ${body.location.longitude}]`;
        messageType = 'location';
      } else if (body.contact) {
        content = `[Contato: ${body.contact.displayName || 'Contato'}]`;
        messageType = 'contacts';
      } else if (body.message) {
        content = body.message;
        messageType = 'text';
      } else {
        content = '[Mensagem não suportada]';
      }

      // Check for duplicate message on external DB
      const { data: existingMessage } = await messageDb
        .from('whatsapp_messages')
        .select('id')
        .eq('message_id', messageId)
        .single();

      if (existingMessage) {
        console.log('Message already exists, skipping:', messageId);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Store message with normalized phone
      const { error: insertError } = await dualWriteMessage({
          channel_id: normalizedPhone,
          organization_id: channel.organization_id,
          message_id: messageId,
          sender_phone: normalizedPhone,
          sender_name: senderName,
          message_type: messageType,
          content: content,
          media_url: mediaUrl || null,
          direction: 'inbound',
          status: 'received',
          is_read: false,
          metadata: {
            timestamp: body.momment || body.timestamp || Date.now(),
            raw: body,
            provider: 'zapi',
            original_phone: phone
          }
        }, channel.id);

      if (insertError) {
        console.error('Error storing Z-API message:', insertError);
      } else {
        console.log('Z-API message stored successfully:', messageId);

        // Check business hours and holidays
        if (channel.organization_id && channel.access_token && channel.app_name) {
          const instanceId = channel.app_name;
          const token = channel.access_token;

          const holidayCheck = await isHoliday(channel.organization_id);
          
          if (holidayCheck.isHoliday && holidayCheck.awayMessage) {
            console.log('Sending holiday away message via Z-API');
            await sendZApiMessage(instanceId, token, normalizedPhone, holidayCheck.awayMessage);
          } else if (!holidayCheck.isHoliday) {
            const businessCheck = await isWithinBusinessHours(channel.organization_id);
            
            if (!businessCheck.isOpen && businessCheck.awayMessage) {
              console.log('Sending outside business hours away message via Z-API');
              await sendZApiMessage(instanceId, token, normalizedPhone, businessCheck.awayMessage);
            }
          }
        }
      }

      // Handle lead and assignment (ID-centric approach)
      if (channel.organization_id) {
        try {
          // Step 1: Find or create lead (returns lead_id)
          const { leadId, isNew } = await findOrCreateLead(
            channel.organization_id,
            channel.user_id,
            phone,
            senderName
          );

          // Step 2: Handle conversation assignment using lead_id
          await handleConversationAssignment(
            channel.organization_id,
            channel.id,
            leadId,
            normalizedPhone
          );

        } catch (error) {
          console.error('Error handling lead/assignment:', error);
        }
      }

      // Check chatbot config
      const { data: chatbotConfig } = await supabase
        .from('chatbot_config')
        .select('*')
        .eq('channel_id', channel.id)
        .eq('is_enabled', true)
        .single();

      if (chatbotConfig) {
        console.log('Chatbot enabled for this channel, invoking chatbot...');
        
        try {
          const chatbotResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/zapi-chatbot`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                channelId: channel.id,
                senderPhone: normalizedPhone,
                senderName: senderName,
                messageContent: content,
                messageId: messageId,
                organizationId: channel.organization_id,
                instanceId: channel.app_name,
                token: channel.access_token,
              }),
            }
          );

          const chatbotResult = await chatbotResponse.json();
          console.log('Chatbot response:', chatbotResult);
        } catch (chatbotError) {
          console.error('Error calling chatbot:', chatbotError);
        }
      } else {
        console.log('No chatbot config for this channel or chatbot disabled');
      }

      return new Response('OK', { status: 200, headers: corsHeaders });

    } catch (error) {
      console.error('Error processing Z-API webhook:', error);
      return new Response('Error', { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'Z-API webhook is active' }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});
