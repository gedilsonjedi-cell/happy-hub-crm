import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u" }, loading: false, session: null, signOut: vi.fn() }) }));
vi.mock("@/hooks/useEffectiveOrganizationId", () => ({
  useEffectiveOrganizationId: () => ({ effectiveOrganizationId: null, isLoading: false, isImpersonating: false, realOrganizationId: null }),
}));
vi.mock("@/components/layout/MainLayout", () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/externalAssignments", () => ({ getExternalAssignments: vi.fn() }));

import Index from "@/pages/Index";

const SIDEBAR_DASHBOARD_PATH = "/dashboard";
const Where = () => <span data-testid="path">{useLocation().pathname}</span>;
const Boom = () => { throw new Error("falha simulada"); };

function App({ start }: { start: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <Where />
      <Routes>
        <Route path="/" element={<Navigate to="/atendimento-v2" replace />} />
        <Route path="/dashboard" element={<RouteErrorBoundary><Index /></RouteErrorBoundary>} />
        <Route path="/atendimento-v2" element={<div>Atendimento</div>} />
        <Route path="/boom" element={<RouteErrorBoundary><Boom /></RouteErrorBoundary>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Roteamento da Dashboard", () => {
  it("item da barra abre a Dashboard e a URL permanece", async () => {
    render(<App start={SIDEBAR_DASHBOARD_PATH} />);
    expect(await screen.findByText("Selecione um cliente na barra lateral para visualizar a Dashboard.")).toBeVisible();
    expect(screen.getByTestId("path").textContent).toBe("/dashboard");
  });

  it("'/' continua levando usuário logado ao Atendimento (causa do bug antigo)", () => {
    render(<App start="/" />);
    expect(screen.getByTestId("path").textContent).toBe("/atendimento-v2");
  });

  it("erro de página aparece na tela, sem redirecionar", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App start="/boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("falha simulada");
    expect(screen.getByTestId("path").textContent).toBe("/boom");
  });
});
