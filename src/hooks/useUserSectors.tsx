import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export interface UserSector {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Hook that returns the sectors/departments the current user is assigned to.
 * Admins and Super Admins can see all sectors in their organization.
 * Attendants and Supervisors can only see sectors they are assigned to.
 */
export function useUserSectors() {
  const { user } = useAuth();
  const { role, organizationId } = useUserRole();
  const [sectors, setSectors] = useState<UserSector[]>([]);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserSectors = async () => {
      if (!user?.id || !organizationId) {
        setSectors([]);
        setSectorIds([]);
        setLoading(false);
        return;
      }

      try {
        // Super admins and admins can see all sectors in their organization
        if (role === "super_admin" || role === "admin") {
          const { data, error } = await supabase
            .from("sectors")
            .select("id, name, description")
            .eq("organization_id", organizationId)
            .order("name");

          if (error) {
            console.error("Error fetching sectors:", error);
            setSectors([]);
            setSectorIds([]);
          } else {
            setSectors(data || []);
            setSectorIds((data || []).map(s => s.id));
          }
        } else {
          // Attendants and supervisors only see their assigned sectors
          const { data: userSectorData, error: userSectorError } = await supabase
            .from("user_sectors")
            .select("sector_id")
            .eq("user_id", user.id);

          if (userSectorError) {
            console.error("Error fetching user sectors:", userSectorError);
            setSectors([]);
            setSectorIds([]);
          } else {
            const userSectorIds = (userSectorData || []).map(us => us.sector_id);
            setSectorIds(userSectorIds);

            if (userSectorIds.length > 0) {
              const { data: sectorsData, error: sectorsError } = await supabase
                .from("sectors")
                .select("id, name, description")
                .in("id", userSectorIds)
                .order("name");

              if (sectorsError) {
                console.error("Error fetching sector details:", sectorsError);
                setSectors([]);
              } else {
                setSectors(sectorsData || []);
              }
            } else {
              setSectors([]);
            }
          }
        }
      } catch (err) {
        console.error("Error in useUserSectors:", err);
        setSectors([]);
        setSectorIds([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserSectors();
  }, [user?.id, organizationId, role]);

  // Memoize canSeeSector to avoid stale closure issues
  const canSeeSector = useCallback((sectorId: string | null): boolean => {
    // Admins can see everything
    if (role === "super_admin" || role === "admin") return true;
    // No sector means everyone can see
    if (!sectorId) return true;
    // Check if user is assigned to this sector
    return sectorIds.includes(sectorId);
  }, [role, sectorIds]);

  // Check if user can interact with a conversation (stricter than canSeeSector)
  // Used for actions like sending messages, accepting conversations
  const canInteractWithSector = useCallback((sectorId: string | null): boolean => {
    // Admins can interact with everything
    if (role === "super_admin" || role === "admin") return true;
    // Supervisors can interact with their assigned sectors
    if (role === "supervisor") {
      if (!sectorId) return true;
      return sectorIds.includes(sectorId);
    }
    // Attendants can ONLY interact with their own sectors
    // If conversation has a sector, must be in user's sectors
    if (!sectorId) return true;
    return sectorIds.includes(sectorId);
  }, [role, sectorIds]);

  return {
    sectors,
    sectorIds,
    loading,
    canSeeSector,
    canInteractWithSector,
    // Helper to check if user has full access (admin/super_admin)
    hasFullAccess: role === "super_admin" || role === "admin",
  };
}
