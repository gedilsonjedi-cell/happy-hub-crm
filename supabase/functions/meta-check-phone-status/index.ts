import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PhoneStatus {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  code_verification_status?: string;
  status?: string;
  name_status?: string;
  is_official_business_account?: boolean;
  account_mode?: string;
  eligibility_for_api_business_global_search?: string;
  is_pin_enabled?: boolean;
  messaging_limit_tier?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumberId, accessToken } = await req.json();

    console.log(`[meta-check-phone-status] Checking status for phone: ${phoneNumberId}`);

    if (!phoneNumberId || !accessToken) {
      console.error('[meta-check-phone-status] Missing phoneNumberId or accessToken');
      return new Response(
        JSON.stringify({ 
          error: 'Phone Number ID e Access Token são obrigatórios',
          status: null 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Fetch phone status from Meta Graph API with extended fields
    const metaUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,name_status,is_official_business_account,account_mode,eligibility_for_api_business_global_search,is_pin_enabled,messaging_limit_tier&access_token=${accessToken}`;
    
    console.log(`[meta-check-phone-status] Calling Meta API for phone ${phoneNumberId}`);
    
    const response = await fetch(metaUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.error) {
      console.error('[meta-check-phone-status] Meta API error:', data.error);
      
      let errorMessage = 'Erro ao buscar status do número';
      let statusCode = 'ERROR';
      
      if (data.error.code === 190) {
        errorMessage = 'Access Token inválido ou expirado';
        statusCode = 'TOKEN_EXPIRED';
      } else if (data.error.code === 100) {
        errorMessage = 'Phone Number ID inválido ou sem permissão';
        statusCode = 'INVALID_ID';
      } else if (data.error.code === 10) {
        errorMessage = 'Número não encontrado ou sem permissão de acesso';
        statusCode = 'NOT_FOUND';
      } else if (data.error.message) {
        errorMessage = data.error.message;
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          status: {
            code: statusCode,
            isConnected: false,
            qualityRating: null,
            displayName: null,
            messagingTier: null,
          },
          metaError: data.error
        }),
        { 
          status: 200, // Return 200 so frontend can handle gracefully
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse status from response
    const phoneStatus = data as PhoneStatus;
    
    // Determine connection status based on various factors
    let connectionStatus = 'UNKNOWN';
    let isConnected = false;
    let isPending = false;
    let statusMessage = 'Status desconhecido';
    
    // First, check if we have essential data that indicates the phone is working
    const hasValidData = phoneStatus.id && (phoneStatus.verified_name || phoneStatus.display_phone_number);
    const hasQualityRating = phoneStatus.quality_rating && phoneStatus.quality_rating !== '';
    
    // Check code_verification_status first
    if (phoneStatus.code_verification_status === 'VERIFIED') {
      connectionStatus = 'VERIFIED';
      statusMessage = 'Verificado';
      isConnected = true; // Verified means it's connected
    } else if (phoneStatus.code_verification_status === 'NOT_VERIFIED') {
      connectionStatus = 'NOT_VERIFIED';
      statusMessage = 'Não verificado';
    }
    
    // Check the main status field
    if (phoneStatus.status) {
      const status = phoneStatus.status.toUpperCase();
      if (status === 'CONNECTED' || status === 'ACTIVE') {
        connectionStatus = 'CONNECTED';
        isConnected = true;
        statusMessage = 'Conectado';
      } else if (status === 'DISCONNECTED' || status === 'OFFLINE') {
        connectionStatus = 'DISCONNECTED';
        isConnected = false;
        statusMessage = 'Desconectado';
      } else if (status === 'FLAGGED' || status === 'RESTRICTED') {
        connectionStatus = 'RESTRICTED';
        isConnected = false;
        statusMessage = 'Restrito';
      } else if (status === 'PENDING') {
        connectionStatus = 'PENDING';
        isPending = true;
        statusMessage = 'Pendente';
      } else if (status === 'RATE_LIMITED') {
        connectionStatus = 'RATE_LIMITED';
        isConnected = true;
        statusMessage = 'Limitado';
      }
    }
    
    // Check account_mode for additional context
    if (phoneStatus.account_mode) {
      const statusBlocksConnection = ['PENDING', 'DISCONNECTED', 'OFFLINE', 'FLAGGED', 'RESTRICTED'].includes(connectionStatus);
      if (phoneStatus.account_mode === 'SANDBOX') {
        connectionStatus = 'SANDBOX';
        statusMessage = 'Modo Sandbox';
        isConnected = !statusBlocksConnection; // Sandbox still works for testing unless Meta says pending/disconnected/restricted
      } else if (phoneStatus.account_mode === 'LIVE' && !statusBlocksConnection) {
        isConnected = true;
        if (connectionStatus === 'VERIFIED' || connectionStatus === 'UNKNOWN' || connectionStatus === 'NOT_VERIFIED') {
          connectionStatus = 'CONNECTED';
          statusMessage = 'Ativo';
        }
      }
    }
    
    // IMPORTANT: If we have valid data (quality_rating, verified_name), consider it connected
    // This handles the case where Meta API returns data but no explicit status field
    if ((hasQualityRating || hasValidData) && (connectionStatus === 'UNKNOWN' || connectionStatus === 'NOT_VERIFIED')) {
      connectionStatus = 'CONNECTED';
      isConnected = true;
      statusMessage = 'Ativo';
    }
    
    // Check name_status for potential issues
    if (phoneStatus.name_status) {
      if (phoneStatus.name_status === 'DECLINED') {
        connectionStatus = 'NAME_DECLINED';
        statusMessage = 'Nome recusado';
        // Keep isConnected as is - name declined doesn't mean it can't send messages
      } else if (phoneStatus.name_status === 'PENDING') {
        if (connectionStatus === 'UNKNOWN') {
          connectionStatus = 'NAME_PENDING';
          statusMessage = 'Nome pendente';
        }
        // If we have valid data, it's still connected even with pending name
        if (hasValidData || hasQualityRating) {
          isConnected = true;
        }
      }
    }
    
    // Quality rating info
    let qualityInfo = 'Desconhecido';
    if (phoneStatus.quality_rating) {
      const qr = phoneStatus.quality_rating.toUpperCase();
      if (qr === 'GREEN' || qr === 'HIGH') {
        qualityInfo = 'Alta qualidade';
      } else if (qr === 'YELLOW' || qr === 'MEDIUM') {
        qualityInfo = 'Qualidade média';
      } else if (qr === 'RED' || qr === 'LOW') {
        qualityInfo = 'Baixa qualidade';
        if (connectionStatus === 'CONNECTED') {
          statusMessage = 'Ativo (qualidade baixa)';
        }
      }
    }

    console.log(`[meta-check-phone-status] Phone ${phoneNumberId} status: ${connectionStatus}, connected: ${isConnected}, pending: ${isPending}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        status: {
          code: connectionStatus,
          isConnected,
          isPending,
          message: statusMessage,
          qualityRating: phoneStatus.quality_rating || null,
          qualityInfo,
          displayName: phoneStatus.verified_name || null,
          displayPhoneNumber: phoneStatus.display_phone_number || null,
          messagingTier: phoneStatus.messaging_limit_tier || null,
          accountMode: phoneStatus.account_mode || null,
          nameStatus: phoneStatus.name_status || null,
          isOfficialBusiness: phoneStatus.is_official_business_account || false,
          codeVerificationStatus: phoneStatus.code_verification_status || null,
          rawStatus: phoneStatus.status || null,
        },
        rawData: phoneStatus
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[meta-check-phone-status] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno ao verificar status',
        status: {
          code: 'ERROR',
          isConnected: false,
          message: 'Erro ao verificar',
        },
        details: errorMessage
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
