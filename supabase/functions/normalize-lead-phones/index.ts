import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Normaliza o telefone para armazenamento no banco de dados
 * SEMPRE adiciona o 55 na frente se não tiver
 */
function normalizePhoneForStorage(phone: string): string {
  // Remove tudo que não é dígito
  let digits = phone.replace(/\D/g, '');
  
  // Se está vazio, retorna vazio
  if (!digits) return '';
  
  // Se já começa com 55 E tem mais de 11 dígitos (55 + DDD + número), está ok
  if (digits.startsWith('55') && digits.length > 11) {
    return digits;
  }
  
  // Se começa com 55 mas tem exatamente 11 ou menos dígitos, 
  // pode ser que os 55 são parte do DDD (ex: 55991234567 = DDD 55 + número)
  // Nesse caso, precisamos adicionar o 55 na frente
  if (digits.startsWith('55') && digits.length <= 11) {
    return '55' + digits;
  }
  
  // Não começa com 55, adiciona na frente
  return '55' + digits;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Authorization header to verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is super admin
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (userRole?.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas super admin pode executar." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { organizationId, dryRun = true, batchStart = 0, batchLimit = 2000 } = body;

    console.log(`[normalize-lead-phones] Starting normalization for org: ${organizationId || 'ALL'}, dryRun: ${dryRun}, batch: ${batchStart}-${batchStart + batchLimit}`);

    // Build query for leads to normalize with pagination
    let query = supabase
      .from("leads")
      .select("id, phone, name, organization_id")
      .range(batchStart, batchStart + batchLimit - 1);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data: leads, error: fetchError } = await query;

    if (fetchError) {
      console.error("[normalize-lead-phones] Error fetching leads:", fetchError);
      throw fetchError;
    }

    console.log(`[normalize-lead-phones] Found ${leads?.length || 0} leads to check in this batch`);

    // Find leads that need normalization
    const leadsToUpdate: { id: string; oldPhone: string; newPhone: string; name: string }[] = [];

    for (const lead of leads || []) {
      const normalizedPhone = normalizePhoneForStorage(lead.phone);
      
      if (normalizedPhone !== lead.phone) {
        leadsToUpdate.push({
          id: lead.id,
          oldPhone: lead.phone,
          newPhone: normalizedPhone,
          name: lead.name,
        });
      }
    }

    console.log(`[normalize-lead-phones] Leads needing update: ${leadsToUpdate.length}`);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          totalChecked: leads?.length || 0,
          leadsToUpdate: leadsToUpdate.length,
          examples: leadsToUpdate.slice(0, 20).map(l => ({
            name: l.name,
            oldPhone: l.oldPhone,
            newPhone: l.newPhone,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Perform updates in batches
    let updatedCount = 0;
    let errorCount = 0;
    const batchSize = 50;

    for (let i = 0; i < leadsToUpdate.length; i += batchSize) {
      const batch = leadsToUpdate.slice(i, i + batchSize);
      
      for (const lead of batch) {
        const { error: updateError } = await supabase
          .from("leads")
          .update({ phone: lead.newPhone })
          .eq("id", lead.id);

        if (updateError) {
          console.error(`[normalize-lead-phones] Error updating lead ${lead.id}:`, updateError);
          errorCount++;
        } else {
          updatedCount++;
        }
      }

      console.log(`[normalize-lead-phones] Progress: ${Math.min(i + batchSize, leadsToUpdate.length)}/${leadsToUpdate.length}`);
    }

    console.log(`[normalize-lead-phones] Complete. Updated: ${updatedCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        dryRun: false,
        totalChecked: leads?.length || 0,
        updatedCount,
        errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[normalize-lead-phones] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
