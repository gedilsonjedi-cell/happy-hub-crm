import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const state = { selected: null as null | { id: string; name: string; slug: string; is_active: boolean; plan: string }, setSelected: vi.fn() };
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isSuperAdmin: true }) }));
vi.mock("@/hooks/useSuperAdmin", () => ({
  useSuperAdmin: () => ({
    organizations: [{ id: "z", name: "Zentum Soluções Financeiras", slug: "zentum", is_active: true, plan: "pro" }],
    selectedOrganization: state.selected,
    setSelectedOrganization: state.setSelected,
    isImpersonating: !!state.selected,
  }),
}));
import { ClientSwitcher } from "../ClientSwitcher";

const zentum = { id: "z", name: "Zentum Soluções Financeiras", slug: "zentum", is_active: true, plan: "pro" };
const mount = (compact = false) => render(<MemoryRouter><TooltipProvider><ClientSwitcher compact={compact} /></TooltipProvider></MemoryRouter>);
const open = (el: HTMLElement) => { fireEvent.pointerDown(el, { button: 0, ctrlKey: false }); };

describe("ClientSwitcher", () => {
  beforeEach(() => { state.selected = null; state.setSelected.mockReset(); });

  it("expandido com cliente: nome e um único gatilho, sem pílula", () => {
    state.selected = zentum; mount();
    const triggers = screen.getAllByTestId("client-switcher-trigger");
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toHaveTextContent("Zentum Soluções Financeiras");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("expandido sem cliente: Selecionar cliente", () => {
    mount();
    expect(screen.getByTestId("client-switcher-trigger")).toHaveTextContent("Selecionar cliente");
  });

  it("recolhido: só a inicial", () => {
    state.selected = zentum; mount(true);
    const t = screen.getByTestId("client-switcher-trigger");
    expect(t.textContent).toBe("Z");
    expect(t.querySelector(".lucide-chevron-down")).toBeNull();
  });

  it("impersonando: 'Sair do cliente' no dropdown chama a ação", async () => {
    state.selected = zentum; mount();
    open(screen.getByTestId("client-switcher-trigger"));
    fireEvent.click(await screen.findByText("Sair do cliente"));
    expect(state.setSelected).toHaveBeenCalledWith(null);
  });
});
