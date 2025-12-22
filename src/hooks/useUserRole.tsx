import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "super_admin" | "admin" | "supervisor" | "atendente";

const CACHE_KEY = "user_role_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedRoleData {
  role: AppRole | null;
  organizationId: string | null;
  userId: string;
  timestamp: number;
}

interface UserRoleState {
  role: AppRole | null;
  loading: boolean;
  syncing: boolean; // New: indicates background sync in progress
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

// Helper functions for cache
const getCachedRole = (userId: string): CachedRoleData | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedRoleData = JSON.parse(cached);
    
    // Check if cache is for the same user and not expired
    if (data.userId === userId && Date.now() - data.timestamp < CACHE_DURATION) {
      return data;
    }
    
    return null;
  } catch {
    return null;
  }
};

const setCachedRole = (userId: string, role: AppRole | null, organizationId: string | null) => {
  try {
    const data: CachedRoleData = {
      role,
      organizationId,
      userId,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
};

const clearCachedRole = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
};

export function useUserRole(): UserRoleState {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // Try to load from cache immediately
  useEffect(() => {
    if (user) {
      const cached = getCachedRole(user.id);
      if (cached) {
        setRole(cached.role);
        setOrganizationId(cached.organizationId);
        setLoading(false);
      }
    }
  }, [user?.id]);

  const fetchRole = useCallback(async (isBackgroundSync = false) => {
    if (!user) {
      setRole(null);
      setOrganizationId(null);
      setLoading(false);
      clearCachedRole();
      return;
    }

    // Check cache first
    const cached = getCachedRole(user.id);
    if (cached && !isBackgroundSync) {
      setRole(cached.role);
      setOrganizationId(cached.organizationId);
      setLoading(false);
    }

    // Set syncing state for background updates
    if (isBackgroundSync || cached) {
      setSyncing(true);
    }

    try {
      // Fetch role
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleError) {
        console.error("Error fetching user role:", roleError);
        if (!cached) setRole(null);
      } else if (roleData) {
        setRole(roleData.role as AppRole);
      } else {
        if (!cached) setRole(null);
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

      // Update cache with fresh data
      const finalRole = roleData?.role as AppRole | null ?? cached?.role ?? null;
      const finalOrgId = profileData?.organization_id ?? cached?.organizationId ?? null;
      setCachedRole(user.id, finalRole, finalOrgId);
      
    } catch (err) {
      console.error("Error fetching user role:", err);
      if (!cached) setRole(null);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [user]);

  // Initial fetch
  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  // Listen for realtime changes to user_roles table
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user-role-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Role changed:', payload);
          // Clear cache and refetch
          clearCachedRole();
          fetchRole(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchRole]);

  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const isSupervisor = role === "supervisor";
  const isAtendente = role === "atendente";

  // Permission mappings based on role
  return {
    role,
    loading,
    syncing,
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
