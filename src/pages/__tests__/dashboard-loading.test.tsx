import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Index from "@/pages/Index";

const authState = {
  user: { id: "super-admin-test" } as { id: string } | null,
  loading: false,
};

const organizationState = {
  effectiveOrganizationId: null as string | null,
  isLoading: false,
};

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ ...authState, signOut: vi.fn(), session: null }),
}));

vi.mock("@/hooks/useEffectiveOrganizationId", () => ({
  useEffectiveOrganizationId: () => ({
    ...organizationState,
    isImpersonating: false,
    realOrganizationId: null,
    impersonatedOrganizationId: undefined,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      throw new Error("A Dashboard não deve consultar o banco sem organização efetiva");
    }),
  },
}));

vi.mock("@/lib/externalAssignments", () => ({
  getExternalAssignments: vi.fn(() => {
    throw new Error("A Dashboard não deve abrir o cliente externo sem organização efetiva");
  }),
}));

describe("Dashboard: estado de organização efetiva", () => {
  beforeEach(() => {
    authState.user = { id: "super-admin-test" };
    authState.loading = false;
    organizationState.effectiveOrganizationId = null;
    organizationState.isLoading = false;
  });

  it("encerra o carregamento e pede seleção de cliente para super admin sem organização", async () => {
    render(<Index />);

    expect(await screen.findByText("Selecione um cliente na barra lateral para visualizar a Dashboard.")).toBeVisible();

    await waitFor(() => {
      expect(screen.queryByText("Carregando")).not.toBeInTheDocument();
      expect(document.querySelectorAll(".animate-pulse")).toHaveLength(0);
    });
  });
});