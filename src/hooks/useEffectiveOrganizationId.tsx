import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Hook that returns the effective organization ID to use for queries.
 * When a Super Admin is impersonating an organization, it returns the impersonated org ID.
 * Otherwise, it returns the current user's organization ID.
 */
export function useEffectiveOrganizationId() {
  const { organizationId } = useUserRole();
  const { selectedOrganization, isImpersonating } = useSuperAdmin();

  // If super admin is impersonating, use the selected organization's ID
  const effectiveOrganizationId = isImpersonating 
    ? selectedOrganization?.id 
    : organizationId;

  return {
    effectiveOrganizationId,
    isImpersonating,
    realOrganizationId: organizationId,
    impersonatedOrganizationId: selectedOrganization?.id,
  };
}
