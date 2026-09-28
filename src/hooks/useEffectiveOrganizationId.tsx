import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Hook that returns the effective organization ID to use for queries.
 * When a Super Admin is impersonating an organization, it returns the impersonated org ID.
 * Otherwise, it returns the current user's organization ID.
 *
 * Resilient to being rendered outside SuperAdminProvider (e.g. during HMR or
 * route transitions): falls back to no impersonation instead of throwing.
 */
export function useEffectiveOrganizationId() {
  const { organizationId, loading: roleLoading } = useUserRole();
  let selectedOrganization: { id: string } | null = null;
  let isImpersonating = false;
  let superAdminLoading = false;
  try {
    const sa = useSuperAdmin();
    selectedOrganization = sa.selectedOrganization;
    isImpersonating = sa.isImpersonating;
    superAdminLoading = sa.loading;
  } catch {
    // No SuperAdminProvider in tree — treat as non-impersonating.
  }

  const hasSelectedOrganization = isImpersonating && !!selectedOrganization?.id;
  const isLoading = hasSelectedOrganization ? false : roleLoading || superAdminLoading;

  const effectiveOrganizationId = isImpersonating 
    ? selectedOrganization?.id 
    : organizationId;

  return {
    effectiveOrganizationId,
    isImpersonating,
    realOrganizationId: organizationId,
    impersonatedOrganizationId: selectedOrganization?.id,
    isLoading,
  };
}
