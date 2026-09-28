import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ organizationId: null, loading: true }),
}));

vi.mock("@/hooks/useSuperAdmin", () => ({
  useSuperAdmin: () => ({
    selectedOrganization: { id: "cliente-selecionado" },
    isImpersonating: true,
    loading: true,
  }),
}));

describe("useEffectiveOrganizationId", () => {
  it("prioriza imediatamente o cliente selecionado mesmo com consultas auxiliares pendentes", () => {
    const { result } = renderHook(() => useEffectiveOrganizationId());

    expect(result.current.effectiveOrganizationId).toBe("cliente-selecionado");
    expect(result.current.isLoading).toBe(false);
  });
});