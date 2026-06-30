import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

const USER_SECTORS_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} demorou demais para responder`));
    }, USER_SECTORS_TIMEOUT_MS);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

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
    let cancelled = false;

    const fetchUserSectors = async () => {
      if (!user?.id || !organizationId) {
        if (cancelled) return;
        setSectors([]);
        setSectorIds([]);
        setLoading(false);
        return;
      }

      try {
        // Super admins and admins can see all sectors in their organization
        if (role === "super_admin" || role === "admin") {
          const { data, error } = await withTimeout(
            supabase
              .from("sectors")
              .select("id, name, description")
              .eq("organization_id", organizationId)
              .order("name"),
            "Departamentos do usuário"
          );

          if (cancelled) return;

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
          const { data: userSectorData, error: userSectorError } = await withTimeout(
            supabase
              .from("user_sectors")
              .select("sector_id")
              .eq("user_id", user.id),
            "Vínculos de departamento"
          );

          if (cancelled) return;

          if (userSectorError) {
            console.error("Error fetching user sectors:", userSectorError);
            setSectors([]);
            setSectorIds([]);
          } else {
            const userSectorIds = (userSectorData || []).map(us => us.sector_id);
            setSectorIds(userSectorIds);

            if (userSectorIds.length > 0) {
              const { data: sectorsData, error: sectorsError } = await withTimeout(
                supabase
                  .from("sectors")
                  .select("id, name, description")
                  .in("id", userSectorIds)
                  .order("name"),
                "Detalhes dos departamentos"
              );

              if (cancelled) return;

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
        if (cancelled) return;
        setSectors([]);
        setSectorIds([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    fetchUserSectors();
    return () => {
      cancelled = true;
    };
  }, [user?.id, organizationId, role]);

  // CRITICAL: Sector-based visibility for conversations
  // - Conversations WITHOUT sector (null) = visible to ALL attendants
  // - Conversations WITH sector = visible only to attendants in that sector
  const canSeeSector = useCallback((sectorId: string | null): boolean => {
    // Admins can see everything
    if (role === "super_admin" || role === "admin") return true;
    
    // Conversation has NO sector - visible to ALL attendants
    if (!sectorId) {
      return true;
    }
    
    // Conversation HAS a sector - only visible if user belongs to it
    return sectorIds.includes(sectorId);
  }, [role, sectorIds]);

  // Check if user can interact with a conversation
  // Same logic: no sector = everyone can interact; with sector = only that department
  const canInteractWithSector = useCallback((sectorId: string | null): boolean => {
    // Admins can interact with everything
    if (role === "super_admin" || role === "admin") return true;
    
    // Conversation has NO sector - all attendants can interact
    if (!sectorId) {
      return true;
    }
    
    // Conversation HAS a sector - only users in that sector can interact
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
