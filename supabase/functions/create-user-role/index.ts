import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the requesting user is a super admin using the token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Invalid authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if requesting user is super admin
    const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin', {
      _user_id: requestingUser.id,
    });

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Only super admins can perform this action" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // Handle updating existing user
    if (action === "update_user") {
      const { user_id, display_name, email, password } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update user auth data (email and/or password)
      const updateData: { email?: string; password?: string } = {};
      if (email) updateData.email = email;
      if (password && password.length >= 6) updateData.password = password;

      if (Object.keys(updateData).length > 0) {
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, updateData);
        
        if (authUpdateError) {
          console.error("Error updating user auth:", authUpdateError);
          return new Response(JSON.stringify({ error: authUpdateError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Update profile
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          display_name: display_name || null,
          email: email || null,
        })
        .eq("user_id", user_id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle creating user with role (full flow)
    if (action === "create_user_with_role") {
      const { email, password, display_name, organization_id, role } = body;

      if (!email || !password || !organization_id || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create user using admin API (doesn't change session)
      // Include organization_id in metadata to prevent auto-organization creation trigger
      const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name,
          organization_id, // This prevents the onboarding trigger from creating a new org
        },
      });

      if (createUserError) {
        console.error("Error creating user:", createUserError);
        return new Response(JSON.stringify({ error: createUserError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!authData.user) {
        return new Response(JSON.stringify({ error: "Failed to create user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Wait for profile trigger to run
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update profile with organization_id
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          organization_id,
          display_name: display_name || null,
        })
        .eq("user_id", authData.user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }

      // Create user role
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          role,
        });

      if (roleError) {
        console.error("Error creating role:", roleError);
        return new Response(JSON.stringify({ error: roleError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        user_id: authData.user.id 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Legacy: just create role for existing user
    const { user_id, role } = body;

    if (!user_id || !role) {
      return new Response(JSON.stringify({ error: "Missing user_id or role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the user role using service role (bypasses RLS)
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id,
        role,
      });

    if (roleError) {
      console.error("Error creating role:", roleError);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
