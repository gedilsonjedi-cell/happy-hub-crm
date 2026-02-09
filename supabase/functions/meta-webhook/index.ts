import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

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

// Helper function to check if should send welcome message
async function shouldSendWelcomeMessage(
  organizationId: string, 
  channelId: string, 
  contactPhone: string
): Promise<{ shouldSend: boolean; message: string | null }> {
  // Check if welcome message is configured and enabled
  const { data: welcomeConfig } = await supabase
    .from('welcome_message_config')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (!welcomeConfig?.is_enabled || !welcomeConfig?.message) {
    return { shouldSend: false, message: null };
  }

  // Check if we already sent welcome message to this contact on this channel
  const { data: existingSent } = await supabase
    .from('welcome_message_sent')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('channel_id', channelId)
    .eq('contact_phone', contactPhone)
    .single();

  if (existingSent) {
    console.log('Welcome message already sent to:', contactPhone);
    return { shouldSend: false, message: null };
  }

  return { shouldSend: true, message: welcomeConfig.message };
}

// Helper function to mark welcome message as sent
async function markWelcomeMessageSent(
  organizationId: string,
  channelId: string,
  contactPhone: string
): Promise<void> {
  await supabase
    .from('welcome_message_sent')
    .insert({
      organization_id: organizationId,
      channel_id: channelId,
      contact_phone: contactPhone,
    });
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
      notes: 'Lead criado automaticamente via WhatsApp (Meta)'
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
    .select('id, assigned_to, status, sector_id, conversation_phone')
    .eq('lead_id', leadId)
    .eq('channel_id', channelId)
    .single();
  
  // FALLBACK: If no match by lead_id, try by phone (for legacy data)
  if (!existingAssignment) {
    const phoneEnd8 = normalizedPhone.slice(-8);
    const { data: phoneMatch } = await supabase
      .from('conversation_assignments')
      .select('id, assigned_to, status, sector_id, conversation_phone, lead_id')
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
            conversation_phone: normalizedPhone,
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

// Helper function to send WhatsApp message via Meta API
async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, recipientPhone: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error sending away message:', errorBody);
      return false;
    }

    console.log('Away message sent successfully to:', recipientPhone);
    return true;
  } catch (error) {
    console.error('Error sending away message:', error);
    return false;
  }
}

// Helper function to dispatch webhook events
async function dispatchWebhookEvent(
  organizationId: string, 
  event: string, 
  data: Record<string, unknown>
): Promise<void> {
  try {
    const { data: webhooks, error: fetchError } = await supabase
      .from("webhooks")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (fetchError) {
      console.error("Error fetching webhooks:", fetchError);
      return;
    }

    const matchingWebhooks = (webhooks || []).filter(
      (webhook: { events: string[] }) => webhook.events.includes(event)
    );

    if (matchingWebhooks.length === 0) {
      console.log(`No webhooks configured for event: ${event}`);
      return;
    }

    console.log(`Dispatching ${event} to ${matchingWebhooks.length} webhook(s)`);

    for (const webhook of matchingWebhooks) {
      try {
        const webhookPayload = {
          event,
          timestamp: new Date().toISOString(),
          organization_id: organizationId,
          data,
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "Optimus-CRM-Webhook/1.0",
          "X-Webhook-Event": event,
          "X-Webhook-ID": webhook.id,
        };

        if (webhook.headers && typeof webhook.headers === "object") {
          Object.assign(headers, webhook.headers as Record<string, string>);
        }

        console.log(`Dispatching to webhook: ${webhook.name} (${webhook.url})`);

        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: JSON.stringify(webhookPayload),
        });

        if (!response.ok) {
          console.error(`Webhook ${webhook.name} failed with status: ${response.status}`);
        } else {
          console.log(`Webhook ${webhook.name} dispatched successfully`);
        }
      } catch (error) {
        console.error(`Error dispatching to webhook ${webhook.name}:`, error);
      }
    }
  } catch (error) {
    console.error("Error in dispatchWebhookEvent:", error);
  }
}

// Helper function to download media from Meta and upload to Supabase Storage
async function downloadAndStoreMedia(
  mediaId: string, 
  accessToken: string, 
  organizationId: string,
  mimeType?: string
): Promise<string | null> {
  try {
    console.log('Downloading media from Meta, ID:', mediaId);
    
    const mediaInfoResponse = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!mediaInfoResponse.ok) {
      const errorText = await mediaInfoResponse.text();
      console.error('Error getting media info:', errorText);
      return null;
    }
    
    const mediaInfo = await mediaInfoResponse.json();
    const mediaUrl = mediaInfo.url;
    const mediaMimeType = mimeType || mediaInfo.mime_type || 'application/octet-stream';
    
    console.log('Media info:', { url: mediaUrl, mimeType: mediaMimeType });
    
    const mediaDownloadResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!mediaDownloadResponse.ok) {
      console.error('Error downloading media:', await mediaDownloadResponse.text());
      return null;
    }
    
    const mediaBlob = await mediaDownloadResponse.blob();
    const arrayBuffer = await mediaBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    let extension = 'bin';
    if (mediaMimeType.includes('audio/ogg')) {
      extension = 'ogg';
    } else if (mediaMimeType.includes('audio/mpeg') || mediaMimeType.includes('audio/mp3')) {
      extension = 'mp3';
    } else if (mediaMimeType.includes('audio/mp4') || mediaMimeType.includes('audio/m4a')) {
      extension = 'm4a';
    } else if (mediaMimeType.includes('audio')) {
      extension = 'ogg';
    } else if (mediaMimeType.includes('image/jpeg')) {
      extension = 'jpg';
    } else if (mediaMimeType.includes('image/png')) {
      extension = 'png';
    } else if (mediaMimeType.includes('image/webp')) {
      extension = 'webp';
    } else if (mediaMimeType.includes('video/mp4')) {
      extension = 'mp4';
    } else if (mediaMimeType.includes('video')) {
      extension = 'mp4';
    } else if (mediaMimeType.includes('application/pdf')) {
      extension = 'pdf';
    }
    
    const fileName = `${organizationId}/inbound_${Date.now()}_${mediaId.slice(-8)}.${extension}`;
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('whatsapp-media')
      .upload(fileName, uint8Array, {
        contentType: mediaMimeType,
        upsert: false,
      });
    
    if (uploadError) {
      console.error('Error uploading to storage:', uploadError);
      return null;
    }
    
    const { data: publicUrlData } = supabase
      .storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);
    
    console.log('Media stored successfully:', publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
    
  } catch (error) {
    console.error('Error in downloadAndStoreMedia:', error);
    return null;
  }
}

// ===========================================
// MAIN WEBHOOK HANDLER
// ===========================================
Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('Webhook verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token) {
      const { data: channels, error } = await supabase
        .from('channels')
        .select('id, waba_id')
        .eq('webhook_verify_token', token)
        .eq('provider', 'meta')
        .limit(1);
      
      if (channels && channels.length > 0 && !error) {
        console.log('Webhook verified for channel:', channels[0].id, 'WABA:', channels[0].waba_id);
        return new Response(challenge, { status: 200 });
      } else {
        console.error('Invalid verify token, no channel found');
        return new Response('Forbidden', { status: 403 });
      }
    } else {
      console.error('Missing verification parameters');
      return new Response('Forbidden', { status: 403 });
    }
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Meta webhook received:', JSON.stringify(body, null, 2));

      const entry = body.entry?.[0];
      if (!entry) {
        console.log('No entry in webhook payload');
        return new Response('OK', { status: 200 });
      }

      const changes = entry.changes?.[0];
      if (!changes || changes.field !== 'messages') {
        console.log('Not a messages webhook, field:', changes?.field);
        return new Response('OK', { status: 200 });
      }

      const value = changes.value;
      const metadata = value.metadata;
      const phoneNumberId = metadata?.phone_number_id;
      const displayPhoneNumber = metadata?.display_phone_number;

      console.log('Webhook metadata:', { phoneNumberId, displayPhoneNumber });

      // Find channel
      let channel = null;
      
      if (phoneNumberId) {
        const { data } = await supabase
          .from('channels')
          .select('*')
          .eq('app_name', phoneNumberId)
          .eq('provider', 'meta')
          .single();
        channel = data;
      }
      
      if (!channel && displayPhoneNumber) {
        const cleanPhone = displayPhoneNumber.replace(/\D/g, '');
        const { data } = await supabase
          .from('channels')
          .select('*')
          .in('phone', [cleanPhone, `+${cleanPhone}`])
          .eq('provider', 'meta')
          .single();
        channel = data;
      }

      if (!channel) {
        console.error('Channel not found for phoneNumberId:', phoneNumberId, 'or phone:', displayPhoneNumber);
        return new Response('OK', { status: 200 });
      }

      console.log('Found channel:', channel.id, channel.name);

      // Process incoming messages
      const messages = value.messages || [];
      for (const msg of messages) {
        const messageId = msg.id;
        const senderPhone = msg.from;
        const timestamp = msg.timestamp;
        const messageType = msg.type;

        console.log('Processing message:', { messageId, senderPhone, messageType });

        // Normalize phone immediately
        const normalizedPhone = normalizePhone(senderPhone);

        // Check for duplicate
        const { data: existingMessage } = await supabase
          .from('whatsapp_messages')
          .select('id')
          .eq('message_id', messageId)
          .single();

        if (existingMessage) {
          console.log('Message already exists, skipping:', messageId);
          continue;
        }

        // Extract content based on message type
        let content = '';
        let mediaUrl = '';
        let mediaId = '';
        let mediaMimeType = '';

        switch (messageType) {
          case 'text':
            content = msg.text?.body || '';
            break;
          case 'image':
            content = msg.image?.caption || '[Imagem]';
            mediaId = msg.image?.id || '';
            mediaMimeType = msg.image?.mime_type || '';
            break;
          case 'video':
            content = msg.video?.caption || '[Vídeo]';
            mediaId = msg.video?.id || '';
            mediaMimeType = msg.video?.mime_type || '';
            break;
          case 'audio':
            content = '[Áudio]';
            mediaId = msg.audio?.id || '';
            mediaMimeType = msg.audio?.mime_type || '';
            break;
          case 'document':
            content = msg.document?.filename || '[Documento]';
            mediaId = msg.document?.id || '';
            mediaMimeType = msg.document?.mime_type || '';
            break;
          case 'sticker':
            content = '[Sticker]';
            mediaId = msg.sticker?.id || '';
            mediaMimeType = msg.sticker?.mime_type || 'image/webp';
            break;
          case 'location':
            const lat = msg.location?.latitude;
            const lng = msg.location?.longitude;
            content = `[Localização: ${lat}, ${lng}]`;
            break;
          case 'contacts':
            const contactName = msg.contacts?.[0]?.name?.formatted_name || 'Contato';
            content = `[Contato: ${contactName}]`;
            break;
          case 'button':
            content = msg.button?.text || '[Botão]';
            break;
          case 'interactive':
            if (msg.interactive?.type === 'button_reply') {
              content = msg.interactive.button_reply?.title || '[Resposta de botão]';
            } else if (msg.interactive?.type === 'list_reply') {
              content = msg.interactive.list_reply?.title || '[Resposta de lista]';
            } else {
              content = '[Interativo]';
            }
            break;
          default:
            content = `[${messageType}]`;
        }

        // If there's media, download and store it
        if (mediaId && channel.access_token && channel.organization_id) {
          console.log('Processing media:', { mediaId, mediaMimeType, messageType });
          const storedMediaUrl = await downloadAndStoreMedia(
            mediaId, 
            channel.access_token, 
            channel.organization_id,
            mediaMimeType
          );
          
          if (storedMediaUrl) {
            mediaUrl = storedMediaUrl;
          } else {
            mediaUrl = mediaId;
            console.warn('Failed to download media, storing ID only:', mediaId);
          }
        }

        // Get sender name from contacts
        const contact = value.contacts?.find((c: { wa_id: string }) => c.wa_id === senderPhone);
        const senderName = contact?.profile?.name || null;

        // Store message with normalized phone - using upsert to handle duplicates
        const { error: insertError } = await supabase
          .from('whatsapp_messages')
          .upsert({
            channel_id: channel.id,
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
              timestamp,
              raw: msg,
              provider: 'meta',
              original_phone: senderPhone
            }
          }, { 
            onConflict: 'message_id',
            ignoreDuplicates: true 
          });

        if (insertError) {
          console.error('Error storing message:', insertError);
        } else {
          console.log('Message stored successfully:', messageId);

          // Dispatch webhook event
          if (channel.organization_id) {
            await dispatchWebhookEvent(channel.organization_id, 'message_created', {
              message_id: messageId,
              channel_id: channel.id,
              channel_name: channel.name,
              sender_phone: normalizedPhone,
              sender_name: senderName,
              message_type: messageType,
              content: content,
              media_url: mediaUrl || null,
              direction: 'inbound',
              timestamp: new Date().toISOString(),
            });
          }

          // Track button clicks for campaign analytics
          if (channel.organization_id && (messageType === 'button' || messageType === 'interactive')) {
            let buttonText: string | null = null;
            
            if (messageType === 'button') {
              buttonText = msg.button?.text || null;
            } else if (messageType === 'interactive') {
              if (msg.interactive?.type === 'button_reply') {
                buttonText = msg.interactive.button_reply?.title || msg.interactive.button_reply?.id || null;
              } else if (msg.interactive?.type === 'list_reply') {
                buttonText = msg.interactive.list_reply?.title || msg.interactive.list_reply?.id || null;
              }
            }
            
            if (buttonText) {
              console.log('Button click detected:', { buttonText, phone: normalizedPhone });
              
              // Find recent campaign recipients for this phone and update button_clicked
              const phoneEnd8 = normalizedPhone.slice(-8);
              const { data: recentRecipients } = await supabase
                .from('campaign_recipients')
                .select('id, phone, campaign_id, button_clicked')
                .order('created_at', { ascending: false })
                .limit(50);
              
              if (recentRecipients) {
                // Find matching recipient by phone suffix
                const matchingRecipient = recentRecipients.find(r => {
                  const rPhone = r.phone.replace(/\D/g, '');
                  return rPhone.endsWith(phoneEnd8) || normalizedPhone.endsWith(rPhone.slice(-8));
                });
                
                if (matchingRecipient && !matchingRecipient.button_clicked) {
                  const { error: updateError } = await supabase
                    .from('campaign_recipients')
                    .update({
                      button_clicked: buttonText,
                      button_clicked_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', matchingRecipient.id);
                  
                  if (updateError) {
                    console.error('Error updating button click:', updateError);
                  } else {
                    console.log('Button click recorded for recipient:', matchingRecipient.id, buttonText);
                  }
                }
              }
            }
          }
        }

        // Check business hours, holidays, and welcome message
        if (channel.organization_id && channel.access_token && channel.app_name) {
          const holidayCheck = await isHoliday(channel.organization_id);
          
          if (holidayCheck.isHoliday && holidayCheck.awayMessage) {
            console.log('Sending holiday away message');
            await sendWhatsAppMessage(
              channel.app_name,
              channel.access_token,
              normalizedPhone,
              holidayCheck.awayMessage
            );
          } else if (!holidayCheck.isHoliday) {
            const businessCheck = await isWithinBusinessHours(channel.organization_id);
            
            if (!businessCheck.isOpen && businessCheck.awayMessage) {
              console.log('Sending outside business hours away message');
              await sendWhatsAppMessage(
                channel.app_name,
                channel.access_token,
                normalizedPhone,
                businessCheck.awayMessage
              );
            } else if (businessCheck.isOpen) {
              // Only send welcome message during business hours
              const welcomeCheck = await shouldSendWelcomeMessage(
                channel.organization_id,
                channel.id,
                normalizedPhone
              );
              
              if (welcomeCheck.shouldSend && welcomeCheck.message) {
                console.log('Sending welcome message to:', normalizedPhone);
                const welcomeSent = await sendWhatsAppMessage(
                  channel.app_name,
                  channel.access_token,
                  normalizedPhone,
                  welcomeCheck.message
                );
                
                if (welcomeSent) {
                  await markWelcomeMessageSent(
                    channel.organization_id,
                    channel.id,
                    normalizedPhone
                  );
                  
                  // Save welcome message to history
                  const welcomeMessageId = `welcome_${normalizedPhone}_${Date.now()}`;
                  await supabase.from('whatsapp_messages').insert({
                    channel_id: channel.id,
                    message_id: welcomeMessageId,
                    sender_phone: channel.phone,
                    sender_name: 'Sistema',
                    message_type: 'text',
                    content: welcomeCheck.message,
                    direction: 'outbound',
                    status: 'sent',
                    organization_id: channel.organization_id,
                    metadata: {
                      provider: 'meta',
                      welcome_message: true,
                      destination: normalizedPhone
                    }
                  });
                  
                  console.log('Welcome message sent and recorded');
                }
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
              senderPhone,
              senderName
            );

            // Dispatch contact_created webhook if new
            if (isNew) {
              await dispatchWebhookEvent(channel.organization_id, 'contact_created', {
                lead_id: leadId,
                phone: normalizedPhone,
                name: senderName || `WhatsApp ${normalizedPhone}`,
                channel_id: channel.id,
                channel_name: channel.name,
                source: 'whatsapp_meta',
                timestamp: new Date().toISOString(),
              });
            }

            // Step 2: Handle conversation assignment using lead_id
            const assignment = await handleConversationAssignment(
              channel.organization_id,
              channel.id,
              leadId,
              normalizedPhone
            );

            // Dispatch conversation_created webhook if needed
            if (isNew) {
              await dispatchWebhookEvent(channel.organization_id, 'conversation_created', {
                conversation_phone: normalizedPhone,
                channel_id: channel.id,
                channel_name: channel.name,
                lead_id: leadId,
                assigned_to: assignment.assignedTo,
                status: assignment.status,
                timestamp: new Date().toISOString(),
              });
            }

          } catch (error) {
            console.error('Error handling lead/assignment:', error);
          }

          // Check chatbot config and invoke appropriate bot (AI or Flow)
          const { data: chatbotConfig } = await supabase
            .from('chatbot_config')
            .select('*, bot_type, agent_id, flow_bot_id')
            .eq('channel_id', channel.id)
            .eq('is_enabled', true)
            .single();

          if (chatbotConfig) {
            const botType = chatbotConfig.bot_type || 'ai';
            
            if (botType === 'flow' && chatbotConfig.flow_bot_id) {
              // Use Flow Bot processor
              console.log('Flow Bot enabled for this channel, invoking flow-bot-processor...');
              
              try {
                const flowBotResponse = await fetch(
                  `${Deno.env.get('SUPABASE_URL')}/functions/v1/flow-bot-processor`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                    },
                    body: JSON.stringify({
                      flow_bot_id: chatbotConfig.flow_bot_id,
                      channel_id: channel.id,
                      contact_phone: normalizedPhone,
                      message_text: content,
                      organization_id: channel.organization_id,
                    }),
                  }
                );

                const flowBotResult = await flowBotResponse.json();
                console.log('Flow bot response:', flowBotResult);
                
                // NEW: Handle multiple messages from flow bot
                const messagesToSend = flowBotResult.messages || [];
                
                // Also handle legacy single-message format for backwards compatibility
                if (!messagesToSend.length && flowBotResult.message) {
                  messagesToSend.push({
                    message: flowBotResult.message,
                    buttons: flowBotResult.buttons || []
                  });
                }
                
                console.log(`Flow bot returned ${messagesToSend.length} message(s) to send`);
                
                // Send all messages in sequence
                for (let i = 0; i < messagesToSend.length; i++) {
                  const msg = messagesToSend[i];
                  if (!msg.message || !channel.access_token || !channel.app_name) continue;
                  
                  // Build full message with buttons if present
                  let fullMessage = msg.message;
                  if (msg.buttons && msg.buttons.length > 0) {
                    const buttonOptions = msg.buttons.map((btn: { label: string }, idx: number) => `${idx + 1}. ${btn.label}`).join('\n');
                    fullMessage += `\n\n${buttonOptions}`;
                  }
                  
                  // Add small delay between messages (except first)
                  if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                  }
                  
                  // Send the message via WhatsApp
                  await sendWhatsAppMessage(
                    channel.app_name,
                    channel.access_token,
                    normalizedPhone,
                    fullMessage
                  );
                  
                  // Save bot response to whatsapp_messages table - use unique ID with phone and timestamp
                  const botMessageId = `flow_bot_${normalizedPhone}_${Date.now()}_${i}`;
                  await supabase.from('whatsapp_messages').upsert({
                    channel_id: channel.id,
                    message_id: botMessageId,
                    sender_phone: channel.phone,
                    sender_name: 'Flow Bot',
                    message_type: 'text',
                    content: fullMessage,
                    direction: 'outbound',
                    status: 'sent',
                    organization_id: channel.organization_id,
                    metadata: {
                      provider: 'meta',
                      flow_bot: true,
                      flow_response_type: flowBotResult.response_type,
                      message_index: i,
                      destination: normalizedPhone
                    }
                  }, { 
                    onConflict: 'message_id',
                    ignoreDuplicates: true 
                  });
                  
                  console.log(`Flow bot message ${i + 1}/${messagesToSend.length} saved to database`);
                }
                
                // Handle transfer action
                if (flowBotResult.transfer) {
                  console.log('Flow bot requested transfer to attendant');
                  // Update conversation to remove bot handling
                  await supabase
                    .from('conversation_assignments')
                    .update({ 
                      is_bot_handling: false, 
                      status: 'pending',
                      updated_at: new Date().toISOString() 
                    })
                    .eq('channel_id', channel.id)
                    .like('conversation_phone', `%${normalizedPhone.slice(-8)}`);
                }
              } catch (flowBotError) {
                console.error('Error calling flow bot:', flowBotError);
              }
            } else {
              // Use AI Chatbot
              console.log('AI Chatbot enabled for this channel, invoking whatsapp-chatbot...');
              
              try {
                const chatbotResponse = await fetch(
                  `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-chatbot`,
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
                    }),
                  }
                );

                const chatbotResult = await chatbotResponse.json();
                console.log('Chatbot response:', chatbotResult);
              } catch (chatbotError) {
                console.error('Error calling chatbot:', chatbotError);
              }
            }
          } else {
            console.log('No chatbot config for this channel or chatbot disabled');
          }
        }
      }

      // Process status updates
      const statuses = value.statuses || [];
      for (const status of statuses) {
        const messageId = status.id;
        const statusValue = status.status;
        const recipientPhone = status.recipient_id;
        
        // Extract error details if present (for failed messages)
        const statusErrors = status.errors || [];
        const firstError = statusErrors[0];
        const metaErrorCode = firstError?.code;
        const metaErrorMessage = firstError?.message || firstError?.title;

        console.log('Processing status update:', { messageId, status: statusValue, recipientPhone, errorCode: metaErrorCode });

        const { data: messageData } = await supabase
          .from('whatsapp_messages')
          .select('id, status, metadata, error_message')
          .eq('message_id', messageId)
          .single();

        const previousStatus = messageData?.status;
        
        // Build update object - include error info if status is failed
        const updateData: Record<string, unknown> = { 
          status: statusValue,
          updated_at: new Date().toISOString()
        };
        
        // If failed, store the error message from Meta webhook (more accurate than API response)
        if (statusValue === 'failed' && metaErrorCode) {
          // Map of error codes to friendly messages in Portuguese
          const errorMessages: Record<number, string> = {
            131049: '(#131049) Limite de MARKETING atingido para este contato. A Meta limita mensagens de marketing por usuário. Use templates UTILITY.',
            131026: '(#131026) Número sem WhatsApp ativo ou bloqueou mensagens comerciais.',
            135000: '(#135000) Erro genérico do Meta. Recrie o template ou reconecte o número.',
            131031: '(#131031) Conta restrita. O WhatsApp restringiu esta conta.',
            131047: '(#131047) Limite de mensagens atingido. Aguarde.',
            132001: '(#132001) Template não existe. Sincronize os templates.',
            10: '(#10) Sem permissão para enviar. Configure no Meta Business.',
            3: '(#3) Permissão granular ausente.',
          };
          
          const friendlyError = errorMessages[metaErrorCode] || `(#${metaErrorCode}) ${metaErrorMessage || 'Erro desconhecido'}`;
          updateData.error_message = friendlyError;
          
          // Also update metadata with error details
          const existingMetadata = (messageData?.metadata || {}) as Record<string, unknown>;
          updateData.metadata = {
            ...existingMetadata,
            webhookErrorCode: metaErrorCode,
            webhookErrorMessage: metaErrorMessage,
            webhookErrorDetails: firstError?.error_data?.details
          };
        }

        const { error: updateError } = await supabase
          .from('whatsapp_messages')
          .update(updateData)
          .eq('message_id', messageId);

        if (updateError) {
          console.error('Error updating message status:', updateError);
        } else {
          console.log('Message status updated:', messageId, statusValue);

          if (channel.organization_id) {
            await dispatchWebhookEvent(channel.organization_id, 'message_updated', {
              message_id: messageId,
              channel_id: channel.id,
              channel_name: channel.name,
              previous_status: previousStatus,
              new_status: statusValue,
              timestamp: new Date().toISOString(),
            });
          }

          // Update campaign_recipients based on status
          const metadata = messageData?.metadata as Record<string, unknown> | undefined;
          const campaignId = metadata?.campaignId as string | undefined;
          
          if (campaignId && recipientPhone) {
            const normalizedPhone = normalizePhone(recipientPhone);
            const phoneVariants = [
              normalizedPhone,
              recipientPhone,
              normalizedPhone.slice(-11),
              normalizedPhone.slice(-10),
              normalizedPhone.slice(-9),
              normalizedPhone.slice(-8),
            ];
            
            console.log('Looking for campaign recipient:', { campaignId, phoneVariants });
            
            // Find recipient by phone suffix matching
            // Include updated_at to detect duplicate webhooks
            const { data: recipients } = await supabase
              .from('campaign_recipients')
              .select('id, phone, status, updated_at')
              .eq('campaign_id', campaignId)
              .limit(1000);
            
            if (recipients) {
              const recipient = recipients.find(r => {
                const rPhone = r.phone.replace(/\D/g, '');
                return phoneVariants.some(v => rPhone.endsWith(v.slice(-8)) || v.endsWith(rPhone.slice(-8)));
              });
              
              if (recipient) {
                // ANTI-DUPLICATE: Check if recipient was updated very recently (within 2 seconds)
                // This prevents race conditions from Meta sending multiple webhooks for the same event
                const lastUpdateTime = recipient.updated_at ? new Date(recipient.updated_at).getTime() : 0;
                const timeSinceUpdate = Date.now() - lastUpdateTime;
                
                if (timeSinceUpdate < 2000 && recipient.status === statusValue) {
                  console.log('Ignoring duplicate webhook for recipient:', recipient.id, { 
                    status: statusValue, 
                    timeSinceUpdate: `${timeSinceUpdate}ms` 
                  });
                  // Skip this update - it's a duplicate
                } else {
                  const now = new Date().toISOString();
                  const updateData: Record<string, unknown> = { updated_at: now };
                  
                  // Handle failed status - update recipient to failed with error details
                  if (statusValue === 'failed') {
                    // Only update if not already failed (avoid duplicate processing)
                    if (recipient.status !== 'failed') {
                      updateData.status = 'failed';
                      updateData.error_message = metaErrorMessage || 'Falha reportada pelo Meta';
                      updateData.last_error_code = metaErrorCode ? String(metaErrorCode) : 'WEBHOOK_FAILED';
                      console.log('Updating recipient to FAILED:', recipient.id, { errorCode: metaErrorCode, errorMessage: metaErrorMessage });
                    }
                  }
                  // Only update status if it's an improvement (delivered > sent, read > delivered)
                  else if (statusValue === 'delivered' && recipient.status !== 'read' && recipient.status !== 'failed') {
                    updateData.status = 'delivered';
                    updateData.delivered_at = now;
                    console.log('Updating recipient to delivered:', recipient.id);
                  } else if (statusValue === 'read' && recipient.status !== 'failed') {
                    updateData.status = 'read';
                    updateData.read_at = now;
                    // Also set delivered_at if not already set
                    updateData.delivered_at = now;
                    console.log('Updating recipient to read:', recipient.id);
                  }
                  
                  if (Object.keys(updateData).length > 1) {
                    const { error: recipientError } = await supabase
                      .from('campaign_recipients')
                      .update(updateData)
                      .eq('id', recipient.id);
                    
                    if (recipientError) {
                      console.error('Error updating campaign recipient:', recipientError);
                    } else {
                      console.log('Campaign recipient updated:', recipient.id, updateData);
                      // NOTE: Campaign counters (sent_count, delivered_count, failed_count) are 
                      // automatically updated by the sync_campaign_counts trigger when 
                      // campaign_recipients status changes - no manual update needed here
                    }
                  }
                }
              }
            }
          }

          // NOTE: Campaign counters for failed messages are automatically updated by
          // the sync_campaign_counts trigger when campaign_recipients.status changes to 'failed'
          // No manual counter update needed here
        }
      }

      return new Response('OK', { status: 200 });

    } catch (error) {
      console.error('Error processing webhook:', error);
      return new Response('OK', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
