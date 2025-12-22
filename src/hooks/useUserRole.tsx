import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "super_admin" | "admin" | "supervisor" | "atendente";

interface UserRoleState {
  role: AppRole | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
  isAtendente: boolean;
  canAccessDisparos: boolean;
  canAccessChatbot: boolean;
  canAccessTemplates: boolean;
  canAccessConexoes: boolean;
  canAccessLeads: boolean;
  canAccessPipeline: boolean;
  canAccessUsuarios: boolean;
  canAccessSetores: boolean;
  canAccessSuperAdmin: boolean;
  organizationId: string | null;
}

export function useUserRole(): UserRoleState {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) {
        setRole(null);
        setOrganizationId(null);
        setLoading(false);
        return;
      }

      try {
        console.log("Fetching role for user:", user.id);
        
        // Fetch role
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (roleError) {
          console.error("Error fetching user role:", roleError);
          setRole(null);
        } else if (roleData) {
          setRole(roleData.role as AppRole);
        } else {
          console.log("No role found for user");
          setRole(null);
        }

        // Fetch organization
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error fetching profile:", profileError);
        } else if (profileData) {
          setOrganizationId(profileData.organization_id);
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user]);

  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const isSupervisor = role === "supervisor";
  const isAtendente = role === "atendente";

  // Permission mappings based on role
  return {
    role,
    loading,
    organizationId,
    isSuperAdmin,
    isAdmin,
    isSupervisor,
    isAtendente,
    // Super admin has access to everything including super admin panel
    // Admin has access to most things except user management and super admin
    // Supervisor has access to most things except user management
    // Atendente only has access to Atendimento
    canAccessDisparos: isSuperAdmin || isAdmin || isSupervisor,
    canAccessChatbot: isSuperAdmin || isAdmin || isSupervisor,
    canAccessTemplates: isSuperAdmin || isAdmin || isSupervisor,
    canAccessConexoes: isSuperAdmin || isAdmin || isSupervisor,
    canAccessLeads: isSuperAdmin || isAdmin || isSupervisor,
    canAccessPipeline: isSuperAdmin || isAdmin || isSupervisor,
    canAccessUsuarios: isSuperAdmin || isAdmin,
    canAccessSetores: isSuperAdmin || isAdmin,
    canAccessSuperAdmin: isSuperAdmin,
  };
}
