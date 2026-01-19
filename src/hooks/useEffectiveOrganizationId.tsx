import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Hook that returns the effective organization ID to use for queries.
 * When a Super Admin is impersonating an organization, it returns the impersonated org ID.
 * Otherwise, it returns the current user's organization ID.
 */
export function useEffectiveOrganizationId() {
  const { organizationId, loading: roleLoading } = useUserRole();
  const { selectedOrganization, isImpersonating, loading: superAdminLoading } = useSuperAdmin();

  // Wait for both to finish loading before determining effective org
  const isLoading = roleLoading || superAdminLoading;

  // If super admin is impersonating, use the selected organization's ID
  const effectiveOrganizationId = isImpersonating 
    ? selectedOrganization?.id 
    : organizationId;

  return {
    effectiveOrganizationId: isLoading ? null : effectiveOrganizationId,
    isImpersonating,
    realOrganizationId: organizationId,
    impersonatedOrganizationId: selectedOrganization?.id,
    isLoading,
  };
}
