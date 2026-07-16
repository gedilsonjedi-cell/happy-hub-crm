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
      console.error("[external-auth-token] Missing or invalid Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const internalSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    // Use getUser() which is universally available across all supabase-js versions
    const { data: userData, error: userError } =
      await internalSupabase.auth.getUser();

    if (userError || !userData?.user) {
      console.error("[external-auth-token] Auth validation failed:", userError?.message ?? "No user");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const userId = userData.user.id;

    // Parse body early (may contain impersonatedOrgId)
    let impersonatedOrgId: string | null = null;
    try {
      const body = await req.json();
      if (body?.impersonatedOrgId) impersonatedOrgId = body.impersonatedOrgId;
    } catch {
      // no body
    }

    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check super_admin role
    const { data: roleData } = await svcClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    const isSuperAdmin = !!roleData;

    // Get organization_id from profile
    const { data: profile } = await internalSupabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();

    let effectiveOrgId = profile?.organization_id ?? null;

    if (isSuperAdmin && impersonatedOrgId) {
      effectiveOrgId = impersonatedOrgId;
      console.log("[external-auth-token] Super admin impersonating org:", effectiveOrgId);
    } else if (isSuperAdmin && !effectiveOrgId) {
      // Super admin with no impersonation selected — issue token without org
      // (external RLS will scope to nothing; frontend should only call this
      // when an org is selected, but avoid hard failure).
      console.log("[external-auth-token] Super admin without impersonated org — issuing tokenless-org");
    } else if (!effectiveOrgId) {
      console.error("[external-auth-token] Profile lookup failed: No org userId:", userId);
      return new Response(
        JSON.stringify({ error: "No organization found" }),
        { status: 403, headers }
      );
    }

    // Get external DB config
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extAnonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
    const extJwtSecret = Deno.env.get("EXTERNAL_SUPABASE_JWT_SECRET");

    if (!extUrl || !extAnonKey || !extJwtSecret) {
      console.error("[external-auth-token] External DB not configured. URL:", !!extUrl, "AnonKey:", !!extAnonKey, "JWTSecret:", !!extJwtSecret);
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

    console.log("[external-auth-token] Token generated for user:", userId, "org:", effectiveOrgId);

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
    console.error("[external-auth-token] Unhandled error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers,
    });
  }
});
