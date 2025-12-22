import { useState, useEffect, createContext, useContext, ReactNode } from "react";
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

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const { isSuperAdmin } = useUserRole();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

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
