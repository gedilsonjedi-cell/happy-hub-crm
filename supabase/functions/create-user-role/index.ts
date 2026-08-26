import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    // Create client with service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a service-role call (internal)
    const isServiceRoleCall = authHeader === `Bearer ${supabaseServiceKey}`;

    if (!isServiceRoleCall) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing authorization" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create a client with the user's token to verify authentication
      const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } }
      });
      
      // Verify the requesting user using getClaims
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabaseAnon.auth.getClaims(token);
      
      if (claimsError || !claimsData?.claims?.sub) {
        console.error("Auth claims error:", claimsError);
        return new Response(JSON.stringify({ error: "Invalid authorization" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const requestingUserId = claimsData.claims.sub;

      // Check if requesting user is super admin or admin
      const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin', {
        _user_id: requestingUserId,
      });

      const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', {
        _user_id: requestingUserId,
      });

      if (!isSuperAdmin && !isAdmin) {
        return new Response(JSON.stringify({ error: "Only admins can perform this action" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { action } = body;

    // Handle deleting user
    if (action === "delete_user") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete from auth.users (this cascades to profiles and user_roles)
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      
      if (deleteError) {
        console.error("Error deleting user:", deleteError);
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle updating existing user
    if (action === "update_user") {
      const { user_id, display_name, email, password } = body;

      console.log("Update user request:", { user_id, display_name, email, hasPassword: !!password });

      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build auth update data - only include fields that are explicitly provided
      const updateData: { email?: string; password?: string } = {};
      
      // Only update email if explicitly provided (not undefined)
      if (email !== undefined && email !== null && email.trim()) {
        updateData.email = email.trim();
        console.log("Email will be updated to:", updateData.email);
      }
      
      // Update password if provided and meets minimum length
      if (password && password.trim() && password.trim().length >= 6) {
        updateData.password = password.trim();
        console.log("Password will be updated");
      }

      console.log("Update data keys:", Object.keys(updateData));

      if (Object.keys(updateData).length > 0) {
        console.log("Calling updateUserById with:", { user_id, updateKeys: Object.keys(updateData) });
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, updateData);
        
        if (authUpdateError) {
          console.error("Error updating user auth:", authUpdateError);
          return new Response(JSON.stringify({ error: authUpdateError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log("Auth update successful");
      } else {
        console.log("No auth updates needed");
      }

      // Update profile only if display_name or email was provided
      const profileUpdate: { display_name?: string | null; email?: string | null } = {};
      if (display_name !== undefined) {
        profileUpdate.display_name = display_name || null;
      }
      if (email !== undefined) {
        profileUpdate.email = email || null;
      }

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .update(profileUpdate)
          .eq("user_id", user_id);

        if (profileError) {
          console.error("Error updating profile:", profileError);
          return new Response(JSON.stringify({ error: profileError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log("Profile update successful");
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle creating super admin (no organization needed)
    if (action === "create_super_admin") {
      const { email, password, display_name } = body;

      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Missing email or password" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only existing super admins can create new super admins
      if (!isServiceRoleCall) {
        const token = authHeader!.replace("Bearer ", "");
        const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader! } }
        });
        const { data: claimsData } = await supabaseAnon.auth.getClaims(token);
        const requestingUserId = claimsData?.claims?.sub;
        
        const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin', {
          _user_id: requestingUserId,
        });

        if (!isSuperAdmin) {
          return new Response(JSON.stringify({ error: "Only super admins can create new super admins" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      console.log("Creating super admin user:", email);
      
      const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: display_name || email.split('@')[0],
          is_super_admin: true,
        },
      });

      if (createUserError) {
        console.error("Error creating super admin:", createUserError);
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

      // Wait for profile trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update profile (no organization)
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          display_name: display_name || null,
          organization_id: null,
        })
        .eq("user_id", authData.user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }

      // Create super_admin role
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          role: "super_admin",
        });

      if (roleError) {
        console.error("Error creating super_admin role:", roleError);
        return new Response(JSON.stringify({ error: roleError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Super admin created successfully:", authData.user.id);

      return new Response(JSON.stringify({ 
        success: true, 
        user_id: authData.user.id 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle creating user with role (full flow)
    if (action === "create_user_with_role") {
      const { email, password, display_name, organization_id, role, whatsapp_phone } = body;

      // WhatsApp OPCIONAL. Se vier vazio, segue sem validar e sem gravar whatsapp_phone.
      // (O WhatsappPhoneGate exige o cadastro do número no primeiro login do usuário.)
      const normalizedWhatsapp = String(whatsapp_phone || "").replace(/\D/g, "");

      if (normalizedWhatsapp) {
        const isValidWhatsapp = /^55[1-9][1-9]9[6-9]\d{7}$/.test(normalizedWhatsapp);
        if (!isValidWhatsapp) {
          return new Response(JSON.stringify({ error: "WhatsApp do usuário inválido. Use DDI 55 + DDD + celular com 9 dígitos." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Duplicidade: o WhatsApp não pode estar vinculado a outro usuário
        const { data: dupProfiles, error: dupError } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .eq("whatsapp_phone", normalizedWhatsapp)
          .limit(1);
        if (dupError) {
          console.error("Error checking duplicate whatsapp:", dupError);
        } else if (dupProfiles && dupProfiles.length > 0) {
          return new Response(JSON.stringify({
            error: "Este número de WhatsApp já está cadastrado em outra conta. Use outro número.",
            code: "whatsapp_exists",
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (!email || !password || !organization_id || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create user using admin API (doesn't change session)
      // Include organization_id in metadata to prevent auto-organization creation trigger
      console.log("Creating user with organization_id in metadata:", organization_id);
      const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: display_name || email.split('@')[0],
          organization_id: organization_id, // This prevents the onboarding trigger from creating a new org
          created_by_admin: true,
        },
      });

      if (createUserError) {
        console.error("Error creating user:", createUserError);
        // Detect duplicate email and return a friendly message + diagnostic info
        const isEmailExists = (createUserError as { code?: string })?.code === "email_exists"
          || /already been registered|already registered|already exists/i.test(createUserError.message || "");
        if (isEmailExists) {
          // Look up the existing user to give the admin context
          let existingUserId: string | null = null;
          let existingOrgId: string | null = null;
          let existingRole: string | null = null;
          try {
            const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
            const found = list?.users?.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
            if (found) {
              existingUserId = found.id;
              const { data: prof } = await supabaseAdmin
                .from("profiles")
                .select("organization_id")
                .eq("user_id", found.id)
                .maybeSingle();
              existingOrgId = prof?.organization_id ?? null;
              const { data: roleRow } = await supabaseAdmin
                .from("user_roles")
                .select("role")
                .eq("user_id", found.id)
                .maybeSingle();
              existingRole = (roleRow?.role as string) ?? null;
            }
          } catch (lookupErr) {
            console.error("Lookup existing user failed:", lookupErr);
          }

          const sameOrg = existingOrgId && existingOrgId === organization_id;
          let friendly = `O e-mail ${email} já está cadastrado no sistema.`;
          if (sameOrg) {
            friendly += " Este usuário já pertence à sua organização — edite-o em vez de criar um novo.";
          } else if (existingOrgId) {
            friendly += " Ele está vinculado a outra organização. Use um e-mail diferente.";
          } else if (existingUserId) {
            friendly += " Existe um cadastro órfão (sem organização). Contate o suporte para liberar este e-mail.";
          }

          return new Response(JSON.stringify({
            error: friendly,
            code: "email_exists",
            existing_user_id: existingUserId,
            existing_organization_id: existingOrgId,
            existing_role: existingRole,
            same_organization: !!sameOrg,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
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
          ...(normalizedWhatsapp ? { whatsapp_phone: normalizedWhatsapp } : {}),
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
