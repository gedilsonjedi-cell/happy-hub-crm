import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "super_admin" | "admin" | "supervisor" | "atendente";

interface UserRoleState {
  role: AppRole | null;
  loading: boolean;
  syncing: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
  isAtendente: boolean;
  canAccessDisparos: boolean;
  canAccessChatbot: boolean;
  canAccessTemplates: boolean;
  canAccessConexoes: boolean;
  canAccessIntegracoes: boolean;
  canAccessLeads: boolean;
  canAccessPipeline: boolean;
  canAccessUsuarios: boolean;
  canAccessSetores: boolean;
  canAccessSuperAdmin: boolean;
  organizationId: string | null;
}

function withRoleTimeout<T>(promise: PromiseLike<T>, label: string, timeoutMs = 8000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} excedeu ${timeoutMs / 1000}s`)), timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export function useUserRole(userIdOverride?: string | null): UserRoleState {
  const { user, loading: authLoading } = useAuth();
  const resolvedUserId = userIdOverride ?? user?.id ?? null;

  // Fetch role using React Query with aggressive caching
  const { data: roleData, isLoading: roleLoading, isFetching: roleFetching } = useQuery({
    queryKey: ["user-role", resolvedUserId],
    queryFn: async () => {
      if (!resolvedUserId) return null;
      
      const { data, error } = await withRoleTimeout(
        supabase.from("user_roles").select("role").eq("user_id", resolvedUserId).maybeSingle(),
        "Consulta de função do usuário",
      );

      if (error) {
        console.error("[useUserRole] Error fetching role:", error.message);
        return null;
      }
      
      console.log("[useUserRole] Role fetch result:", { roleData: data });
      return data?.role as AppRole | null;
    },
    enabled: !!resolvedUserId,
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  // Fetch organization using React Query with aggressive caching
  const { data: organizationId, isLoading: orgLoading, isFetching: orgFetching } = useQuery({
    queryKey: ["user-organization", resolvedUserId],
    queryFn: async () => {
      if (!resolvedUserId) return null;
      
      const { data, error } = await withRoleTimeout(
        supabase.from("profiles").select("organization_id").eq("user_id", resolvedUserId).maybeSingle(),
        "Consulta de organização do usuário",
      );

      if (error) {
        console.error("[useUserRole] Error fetching profile:", error.message);
        return null;
      }
      
      console.log("[useUserRole] Profile fetch result:", { profileData: data });
      return data?.organization_id ?? null;
    },
    enabled: !!resolvedUserId,
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const role = roleData ?? null;
  const loading = authLoading || roleLoading || orgLoading;
  const syncing = roleFetching || orgFetching;

  // Memoize permissions to prevent unnecessary re-renders
  return useMemo(() => {
    const isSuperAdmin = role === "super_admin";
    const isAdmin = role === "admin";
    const isSupervisor = role === "supervisor";
    const isAtendente = role === "atendente";

    return {
      role,
      loading,
      syncing,
      organizationId: organizationId ?? null,
      isSuperAdmin,
      isAdmin,
      isSupervisor,
      isAtendente,
      canAccessDisparos: isSuperAdmin || isAdmin || isSupervisor,
      canAccessChatbot: isSuperAdmin || isAdmin || isSupervisor,
      canAccessTemplates: isSuperAdmin || isAdmin || isSupervisor,
      canAccessConexoes: isSuperAdmin || isAdmin || isSupervisor,
      canAccessIntegracoes: isSuperAdmin || isAdmin || isSupervisor,
      canAccessLeads: isSuperAdmin || isAdmin || isSupervisor || isAtendente,
      canAccessPipeline: isSuperAdmin || isAdmin || isSupervisor || isAtendente,
      canAccessUsuarios: isSuperAdmin || isAdmin || isSupervisor,
      canAccessSetores: isSuperAdmin || isAdmin || isSupervisor || isAtendente,
      canAccessSuperAdmin: isSuperAdmin,
    };
  }, [role, loading, syncing, organizationId]);
}
