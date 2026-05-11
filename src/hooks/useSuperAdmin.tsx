import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface Organization {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  plan: string;
}

interface SuperAdminContextType {
  organizations: Organization[];
  selectedOrganization: Organization | null;
  setSelectedOrganization: (org: Organization | null) => void;
  isImpersonating: boolean;
  loading: boolean;
  refetch: () => void;
}

const SuperAdminContext = createContext<SuperAdminContextType | undefined>(undefined);

const STORAGE_KEY = "super_admin_selected_org";

// Helper to get cached organization from sessionStorage
const getCachedOrganization = (): Organization | null => {
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error("Error reading cached organization:", err);
  }
  return null;
};

// Helper to save organization to sessionStorage
const setCachedOrganization = (org: Organization | null) => {
  try {
    if (org) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(org));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.error("Error caching organization:", err);
  }
};

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const { isSuperAdmin, role, loading: roleLoading } = useUserRole();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganization, setSelectedOrganizationState] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const setSelectedOrganization = useCallback((org: Organization | null) => {
    setSelectedOrganizationState(org);
    setCachedOrganization(org);
    // CRÍTICO: ao trocar de cliente impersonado, invalidar todos os clientes
    // do banco externo em cache. Caso contrário, o JWT antigo (com a claim
    // organization_id da org anterior) continua sendo usado e a RLS do externo
    // bloqueia a leitura — sidebar fica vazia até um Ctrl+Shift+R.
    void import("@/lib/externalSupabaseClient").then(({ clearExternalClient }) => {
      clearExternalClient();
    });
  }, []);

  // Initialize cached org only for super admins, clear for others
  useEffect(() => {
    if (roleLoading) return;
    
    if (isSuperAdmin) {
      // Super admin: restore cached organization
      const cached = getCachedOrganization();
      if (cached) {
        setSelectedOrganizationState(cached);
      }
    } else {
      // Not super admin: clear any cached impersonation
      setCachedOrganization(null);
      setSelectedOrganizationState(null);
    }
    setInitialized(true);
  }, [isSuperAdmin, roleLoading]);

  const fetchOrganizations = async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug, is_active, plan")
        .order("name");

      if (error) {
        console.error("Error fetching organizations:", error);
      } else {
        setOrganizations(data || []);
        
        // Validate cached organization still exists
        const cached = getCachedOrganization();
        if (cached && data) {
          const stillExists = data.find(org => org.id === cached.id);
          if (!stillExists) {
            setSelectedOrganization(null);
          } else {
            // Update cached data with fresh data
            setSelectedOrganizationState(stillExists);
            setCachedOrganization(stillExists);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching organizations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchOrganizations();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  const isImpersonating = selectedOrganization !== null;

  return (
    <SuperAdminContext.Provider
      value={{
        organizations,
        selectedOrganization,
        setSelectedOrganization,
        isImpersonating,
        loading,
        refetch: fetchOrganizations,
      }}
    >
      {children}
    </SuperAdminContext.Provider>
  );
}

export function useSuperAdmin() {
  const context = useContext(SuperAdminContext);
  if (context === undefined) {
    throw new Error("useSuperAdmin must be used within a SuperAdminProvider");
  }
  return context;
}
