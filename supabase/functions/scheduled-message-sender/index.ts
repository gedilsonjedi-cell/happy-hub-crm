import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('[scheduled-message-sender] Starting scheduled message processing...')

    // Get all pending messages that are due
    const now = new Date().toISOString()
    const { data: pendingMessages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select(`
        *,
        channel:channels(id, phone, access_token, waba_id, provider, organization_id),
        template:message_templates(id, name, content, components, dispatch_type)
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .limit(50)

    if (fetchError) {
      console.error('[scheduled-message-sender] Error fetching pending messages:', fetchError)
      throw fetchError
    }

    console.log(`[scheduled-message-sender] Found ${pendingMessages?.length || 0} pending messages to send`)

    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No pending messages' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let successCount = 0
    let failCount = 0

    for (const scheduled of pendingMessages) {
      try {
        console.log(`[scheduled-message-sender] Processing message ${scheduled.id} for ${scheduled.destination_phone}`)

        // Mark as processing to avoid duplicate sends
        await supabase
          .from('scheduled_messages')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', scheduled.id)

        // Prepare the template payload
        const template = scheduled.template
        const channel = scheduled.channel
        
        if (!template || !channel) {
          throw new Error('Template or channel not found')
        }

        // Build variable values from stored data
        const variableValues = scheduled.variable_values || {}
        
        // Call the meta-send function
        const sendPayload = {
          channelId: channel.id,
          destination: scheduled.destination_phone,
          template: {
            name: template.name,
            language: { code: 'pt_BR' },
            components: buildTemplateComponents(template.components, variableValues)
          },
          skipBalanceCheck: false
        }

        console.log(`[scheduled-message-sender] Sending template ${template.name} to ${scheduled.destination_phone}`)

        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/meta-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify(sendPayload)
        })

        const sendResult = await sendResponse.json()

        if (!sendResponse.ok || sendResult.error) {
          throw new Error(sendResult.error || sendResult.message || 'Failed to send message')
        }

        // Mark as sent
        await supabase
          .from('scheduled_messages')
          .update({ 
            status: 'sent', 
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', scheduled.id)

        console.log(`[scheduled-message-sender] Successfully sent message ${scheduled.id}`)
        successCount++

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[scheduled-message-sender] Error sending message ${scheduled.id}:`, errorMessage)
        
        // Mark as failed with error message
        await supabase
          .from('scheduled_messages')
          .update({ 
            status: 'failed', 
            error_message: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('id', scheduled.id)

        failCount++
      }
    }

    console.log(`[scheduled-message-sender] Completed: ${successCount} sent, ${failCount} failed`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: pendingMessages.length,
        sent: successCount,
        failed: failCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[scheduled-message-sender] Fatal error:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function buildTemplateComponents(templateComponents: any[], variableValues: Record<string, string>): any[] {
  if (!templateComponents || !Array.isArray(templateComponents)) {
    return []
  }

  const result: any[] = []

  for (const component of templateComponents) {
    if (component.type === 'HEADER' && component.format === 'TEXT') {
      // Check if header has parameters
      const headerText = component.text || ''
      const headerParams = headerText.match(/\{\{(\d+)\}\}/g)
      
      if (headerParams && headerParams.length > 0) {
        const parameters = headerParams.map((param: string) => {
          const index = param.replace(/\{\{|\}\}/g, '')
          return {
            type: 'text',
            text: variableValues[`header_${index}`] || variableValues[`{{${index}}}`] || ''
          }
        })
        
        result.push({
          type: 'header',
          parameters
        })
      }
    }

    if (component.type === 'BODY') {
      const bodyText = component.text || ''
      const bodyParams = bodyText.match(/\{\{(\d+)\}\}/g)
      
      if (bodyParams && bodyParams.length > 0) {
        const parameters = bodyParams.map((param: string) => {
          const index = param.replace(/\{\{|\}\}/g, '')
          return {
            type: 'text',
            text: variableValues[`body_${index}`] || variableValues[index] || variableValues[`{{${index}}}`] || ''
          }
        })
        
        result.push({
          type: 'body',
          parameters
        })
      }
    }

    if (component.type === 'BUTTON' && component.buttons) {
      // Handle button parameters if needed
      const buttonParams = component.buttons
        .map((btn: any, idx: number) => {
          if (btn.type === 'URL' && btn.url?.includes('{{1}}')) {
            return {
              type: 'button',
              sub_type: 'url',
              index: idx,
              parameters: [{
                type: 'text',
                text: variableValues[`button_${idx + 1}`] || ''
              }]
            }
          }
          return null
        })
        .filter(Boolean)

      result.push(...buttonParams)
    }
  }

  return result
}
