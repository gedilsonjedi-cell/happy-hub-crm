import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * external-auth-token
 *
 * Generates a short-lived JWT signed with the external Supabase's JWT secret.
 * The token contains the user's organization_id as a custom claim so that
 * RLS policies on the external DB can filter by organization.
 *
 * Returns: { token, url, anonKey, expiresAt }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Validate internal auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const internalSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await internalSupabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const userId = claimsData.claims.sub as string;

    // Get organization_id from profile
    const { data: profile } = await internalSupabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .single();

    if (!profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: "No organization found" }),
        { status: 403, headers }
      );
    }

    // Check for super_admin impersonation
    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let effectiveOrgId = profile.organization_id;

    // Check if request body has impersonated org
    try {
      const body = await req.json();
      if (body?.impersonatedOrgId) {
        // Verify super_admin role
        const { data: roleData } = await svcClient
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "super_admin")
          .maybeSingle();

        if (roleData) {
          effectiveOrgId = body.impersonatedOrgId;
        }
      }
    } catch {
      // No body or parse error — use default org
    }

    // Get external DB config
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extAnonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
    const extJwtSecret = Deno.env.get("EXTERNAL_SUPABASE_JWT_SECRET");

    if (!extUrl || !extAnonKey || !extJwtSecret) {
      return new Response(
        JSON.stringify({ error: "External DB not configured" }),
        { status: 500, headers }
      );
    }

    // Sign a short-lived JWT (5 minutes) with the external DB's JWT secret
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 300; // 5 minutes

    const secret = new TextEncoder().encode(extJwtSecret);

    const externalToken = await new SignJWT({
      sub: userId,
      organization_id: effectiveOrgId,
      role: "authenticated",
      iss: "supabase",
      iat: now,
      exp: expiresAt,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(secret);

    return new Response(
      JSON.stringify({
        token: externalToken,
        url: extUrl,
        anonKey: extAnonKey,
        expiresAt: expiresAt * 1000, // ms for JS Date
      }),
      { status: 200, headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[external-auth-token]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers,
    });
  }
});
