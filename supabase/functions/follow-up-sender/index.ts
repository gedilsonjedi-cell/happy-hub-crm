import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FollowUpMessage {
  id: string
  template_id: string
  day_offset: number
  send_time: string
  order_index: number
  sequence_id: string
}

interface FollowUpInstance {
  id: string
  lead_id: string
  sequence_id: string
  channel_id: string | null
  organization_id: string | null
  status: string
  started_at: string
  next_message_index: number
  last_message_sent_at: string | null
}

interface Lead {
  id: string
  name: string
  phone: string
  organization_id: string | null
}

interface MessageTemplate {
  id: string
  name: string
  content: string
  components: any
  variables: string[] | null
  variable_mappings: any
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('[FollowUp] Starting follow-up message processing...')

    // Get current time in Brazil timezone (UTC-3)
    const now = new Date()
    const brazilOffset = -3 * 60 // UTC-3 in minutes
    const brazilTime = new Date(now.getTime() + (brazilOffset + now.getTimezoneOffset()) * 60000)
    
    const currentHour = brazilTime.getHours().toString().padStart(2, '0')
    const currentMinute = brazilTime.getMinutes().toString().padStart(2, '0')
    const currentTimeStr = `${currentHour}:${currentMinute}`
    
    console.log(`[FollowUp] Current Brazil time: ${brazilTime.toISOString()}, time string: ${currentTimeStr}`)

    // Get all active follow-up instances
    const { data: instances, error: instancesError } = await supabase
      .from('follow_up_instances')
      .select('*')
      .eq('status', 'active')
    
    if (instancesError) {
      console.error('[FollowUp] Error fetching instances:', instancesError)
      throw instancesError
    }

    if (!instances || instances.length === 0) {
      console.log('[FollowUp] No active follow-up instances found')
      return new Response(
        JSON.stringify({ success: true, message: 'No active instances', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[FollowUp] Found ${instances.length} active instances`)

    let processedCount = 0
    let sentCount = 0

    for (const instance of instances as FollowUpInstance[]) {
      try {
        console.log(`[FollowUp] Processing instance ${instance.id} for lead ${instance.lead_id}`)

        // Calculate days since follow-up started
        const startedAt = new Date(instance.started_at)
        const daysSinceStart = Math.floor((brazilTime.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24))
        
        console.log(`[FollowUp] Days since start: ${daysSinceStart}, next message index: ${instance.next_message_index}`)

        // Get the next message to send
        const { data: messages, error: messagesError } = await supabase
          .from('follow_up_messages')
          .select('*')
          .eq('sequence_id', instance.sequence_id)
          .eq('order_index', instance.next_message_index)
          .single()

        if (messagesError || !messages) {
          console.log(`[FollowUp] No more messages for instance ${instance.id}, sequence complete`)
          continue
        }

        const message = messages as FollowUpMessage

        // Check if it's time to send this message
        // Message should be sent on day_offset days after start, at send_time
        if (daysSinceStart < message.day_offset) {
          console.log(`[FollowUp] Not yet time for message (day ${message.day_offset}), current day: ${daysSinceStart}`)
          continue
        }

        // Check if we're within the send time window (within 5 minutes)
        const [messageHour, messageMinute] = message.send_time.split(':').map(Number)
        const [currentHourNum, currentMinuteNum] = [parseInt(currentHour), parseInt(currentMinute)]
        
        const messageTimeInMinutes = messageHour * 60 + messageMinute
        const currentTimeInMinutes = currentHourNum * 60 + currentMinuteNum
        const timeDiff = Math.abs(currentTimeInMinutes - messageTimeInMinutes)

        // Check if we already sent a message today
        if (instance.last_message_sent_at) {
          const lastSent = new Date(instance.last_message_sent_at)
          const lastSentDay = Math.floor((lastSent.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24))
          
          if (lastSentDay >= message.day_offset) {
            console.log(`[FollowUp] Message for day ${message.day_offset} already sent`)
            continue
          }
        }

        // Allow 5 minute window for sending
        if (timeDiff > 5) {
          console.log(`[FollowUp] Not within send time window. Message time: ${message.send_time}, current: ${currentTimeStr}`)
          continue
        }

        console.log(`[FollowUp] Time to send message! Day: ${message.day_offset}, Time: ${message.send_time}`)

        // Get lead info
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('*')
          .eq('id', instance.lead_id)
          .single()

        if (leadError || !lead) {
          console.error(`[FollowUp] Lead not found for instance ${instance.id}`)
          continue
        }

        const leadData = lead as Lead

        // Get template info
        const { data: template, error: templateError } = await supabase
          .from('message_templates')
          .select('*')
          .eq('id', message.template_id)
          .single()

        if (templateError || !template) {
          console.error(`[FollowUp] Template not found: ${message.template_id}`)
          continue
        }

        const templateData = template as MessageTemplate

        // Get channel for sending
        let channelId = instance.channel_id

        if (!channelId) {
          // Get any connected channel for the organization
          const { data: channels, error: channelsError } = await supabase
            .from('channels')
            .select('id')
            .eq('organization_id', instance.organization_id)
            .eq('connected', true)
            .limit(1)
          
          if (channelsError || !channels || channels.length === 0) {
            console.error(`[FollowUp] No connected channel found for organization ${instance.organization_id}`)
            continue
          }
          
          channelId = channels[0].id
        }

        // Prepare template variables
        let variables: Record<string, string> = {}
        if (templateData.variable_mappings && typeof templateData.variable_mappings === 'object') {
          const mappings = templateData.variable_mappings as Record<string, string>
          for (const [varName, fieldName] of Object.entries(mappings)) {
            if (fieldName === 'name') {
              variables[varName] = leadData.name || ''
            } else if (fieldName === 'phone') {
              variables[varName] = leadData.phone || ''
            }
          }
        }

        // Send message via meta-send function
        console.log(`[FollowUp] Sending message to ${leadData.phone} via channel ${channelId}`)

        const { data: sendResult, error: sendError } = await supabase.functions.invoke('meta-send', {
          body: {
            channelId: channelId,
            destination: leadData.phone,
            template: {
              name: templateData.name,
              components: templateData.components,
              variables: variables
            }
          }
        })

        if (sendError) {
          console.error(`[FollowUp] Error sending message:`, sendError)
          
          // Log failed attempt
          await supabase.from('follow_up_logs').insert({
            instance_id: instance.id,
            message_id: message.id,
            status: 'failed',
            error_message: sendError.message || 'Unknown error'
          })
          
          continue
        }

        console.log(`[FollowUp] Message sent successfully:`, sendResult)

        // Log successful send
        await supabase.from('follow_up_logs').insert({
          instance_id: instance.id,
          message_id: message.id,
          status: 'sent'
        })

        // Update instance with next message index
        const { data: nextMessage } = await supabase
          .from('follow_up_messages')
          .select('order_index')
          .eq('sequence_id', instance.sequence_id)
          .gt('order_index', message.order_index)
          .order('order_index', { ascending: true })
          .limit(1)
          .single()

        const updateData: any = {
          last_message_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        if (nextMessage) {
          updateData.next_message_index = nextMessage.order_index
        }

        await supabase
          .from('follow_up_instances')
          .update(updateData)
          .eq('id', instance.id)

        sentCount++
        processedCount++

      } catch (instanceError) {
        console.error(`[FollowUp] Error processing instance ${instance.id}:`, instanceError)
        processedCount++
      }
    }

    console.log(`[FollowUp] Completed. Processed: ${processedCount}, Sent: ${sentCount}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount,
        sent: sentCount,
        timestamp: brazilTime.toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[FollowUp] Fatal error:', error)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
