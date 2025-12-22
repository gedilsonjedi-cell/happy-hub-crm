import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "supervisor" | "atendente";

interface UserRoleState {
  role: AppRole | null;
  loading: boolean;
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
}

export function useUserRole(): UserRoleState {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        console.log("Fetching role for user:", user.id);
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        console.log("Role fetch result:", { data, error });

        if (error) {
          console.error("Error fetching user role:", error);
          setRole(null);
        } else if (data) {
          setRole(data.role as AppRole);
        } else {
          // No role found - user might be new, default to null
          console.log("No role found for user");
          setRole(null);
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

  const isAdmin = role === "admin";
  const isSupervisor = role === "supervisor";
  const isAtendente = role === "atendente";

  // Permission mappings based on role
  return {
    role,
    loading,
    isAdmin,
    isSupervisor,
    isAtendente,
    // Admin has access to everything
    // Supervisor has access to most things except user management
    // Atendente only has access to Atendimento
    canAccessDisparos: isAdmin || isSupervisor,
    canAccessChatbot: isAdmin || isSupervisor,
    canAccessTemplates: isAdmin || isSupervisor,
    canAccessConexoes: isAdmin || isSupervisor,
    canAccessLeads: isAdmin || isSupervisor,
    canAccessPipeline: isAdmin || isSupervisor,
    canAccessUsuarios: isAdmin,
    canAccessSetores: isAdmin,
  };
}
