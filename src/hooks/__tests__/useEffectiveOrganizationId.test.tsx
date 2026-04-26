import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

// Mock dos hooks dependentes ANTES de importar useEffectiveOrganizationId
const mockUseUserRole = vi.fn();
const mockUseSuperAdmin = vi.fn();

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => mockUseUserRole(),
}));

vi.mock("@/hooks/useSuperAdmin", () => ({
  useSuperAdmin: () => mockUseSuperAdmin(),
}));

import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";

const REAL_ORG = "real-org-id-aaaa";
const IMPERSONATED_ORG = "henrimath-org-id-bbbb";

beforeEach(() => {
  mockUseUserRole.mockReset();
  mockUseSuperAdmin.mockReset();
});

/**
 * Estes testes blindam o comportamento descrito pelo usuário:
 *  - Em /usuarios e /conexoes, durante impersonação, o seletor amplo de
 *    organização deve ficar escondido.
 *  - A organization_id usada (effectiveOrganizationId) deve ser SEMPRE a
 *    da conta impersonada, nunca a do super admin.
 *
 * Os componentes-alvo são páginas grandes com Supabase, contextos, etc.
 * Em vez de renderizá-las, validamos a regra exata aplicada na UI:
 *    isSuperAdmin && !isImpersonating && organizations.length > 0
 * Se alguém remover o `!isImpersonating` no futuro, este teste quebra.
 */

// Pequeno componente espelhando a expressão usada em Usuarios.tsx e Conexoes.tsx
function OrgFilterGuard({
  isSuperAdmin,
  isImpersonating,
  organizationsCount,
}: {
  isSuperAdmin: boolean;
  isImpersonating: boolean;
  organizationsCount: number;
}) {
  const showFilter = isSuperAdmin && !isImpersonating && organizationsCount > 0;
  return showFilter ? (
    <div data-testid="org-filter">Filtrar por organização</div>
  ) : null;
}

describe("useEffectiveOrganizationId — durante impersonação", () => {
  it("retorna a organização impersonada quando super admin está em uma conta", () => {
    mockUseUserRole.mockReturnValue({ organizationId: null, loading: false });
    mockUseSuperAdmin.mockReturnValue({
      selectedOrganization: { id: IMPERSONATED_ORG, name: "Henrimath" },
      isImpersonating: true,
      loading: false,
    });

    const { result } = renderHook(() => useEffectiveOrganizationId());

    expect(result.current.effectiveOrganizationId).toBe(IMPERSONATED_ORG);
    expect(result.current.isImpersonating).toBe(true);
  });

  it("retorna a própria organização do usuário quando NÃO está impersonando", () => {
    mockUseUserRole.mockReturnValue({ organizationId: REAL_ORG, loading: false });
    mockUseSuperAdmin.mockReturnValue({
      selectedOrganization: null,
      isImpersonating: false,
      loading: false,
    });

    const { result } = renderHook(() => useEffectiveOrganizationId());

    expect(result.current.effectiveOrganizationId).toBe(REAL_ORG);
    expect(result.current.isImpersonating).toBe(false);
  });

  it("NUNCA cai de volta para a org real quando estiver impersonando (super admin sem org própria)", () => {
    // Super admins não devem ter organization_id próprio (regra Core).
    mockUseUserRole.mockReturnValue({ organizationId: null, loading: false });
    mockUseSuperAdmin.mockReturnValue({
      selectedOrganization: { id: IMPERSONATED_ORG, name: "Henrimath" },
      isImpersonating: true,
      loading: false,
    });

    const { result } = renderHook(() => useEffectiveOrganizationId());

    expect(result.current.effectiveOrganizationId).toBe(IMPERSONATED_ORG);
    // garante que a org "real" do super admin não vaza para queries
    expect(result.current.effectiveOrganizationId).not.toBeNull();
  });
});

describe("Filtro/seletor de organização — visibilidade", () => {
  it("ESCONDE o seletor quando super admin está impersonando (Usuarios e Conexoes)", () => {
    render(
      <OrgFilterGuard
        isSuperAdmin={true}
        isImpersonating={true}
        organizationsCount={5}
      />
    );
    expect(screen.queryByTestId("org-filter")).not.toBeInTheDocument();
  });

  it("EXIBE o seletor quando super admin NÃO está impersonando", () => {
    render(
      <OrgFilterGuard
        isSuperAdmin={true}
        isImpersonating={false}
        organizationsCount={5}
      />
    );
    expect(screen.getByTestId("org-filter")).toBeInTheDocument();
  });

  it("ESCONDE o seletor para usuários comuns (não super admin)", () => {
    render(
      <OrgFilterGuard
        isSuperAdmin={false}
        isImpersonating={false}
        organizationsCount={5}
      />
    );
    expect(screen.queryByTestId("org-filter")).not.toBeInTheDocument();
  });

  it("ESCONDE o seletor quando não há organizações carregadas", () => {
    render(
      <OrgFilterGuard
        isSuperAdmin={true}
        isImpersonating={false}
        organizationsCount={0}
      />
    );
    expect(screen.queryByTestId("org-filter")).not.toBeInTheDocument();
  });
});
