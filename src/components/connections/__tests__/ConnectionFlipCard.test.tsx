import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectionFlipCard } from "../ConnectionFlipCard";

const setHover = (on: boolean) =>
  Object.defineProperty(window, "matchMedia", { writable: true, value: (q: string) => ({ matches: on && q.includes("hover"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) });

const props = { id: "c1", name: "Zentum Cobrança 01", phone: "5511987654321", wabaId: "1234567890123456", active: true, status: "connected" as const };
const mount = (extra = {}) => {
  const onManage = vi.fn(); const onToggle = vi.fn();
  render(<TooltipProvider><ConnectionFlipCard {...props} onManage={onManage} onToggle={onToggle} {...extra} /></TooltipProvider>);
  return { onManage, onToggle, card: screen.getByTestId("connection-card") };
};

describe("ConnectionFlipCard", () => {
  beforeEach(() => setHover(true));

  it("frente mostra status, nome, provedor e número", () => {
    const { card } = mount();
    expect(card).toHaveAttribute("data-flipped", "false");
    expect(card).toHaveClass("h-44");
    expect(screen.getByText("Conectado")).toBeInTheDocument();
    expect(screen.getByText("Zentum Cobrança 01")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp Cloud (Oficial)")).toBeInTheDocument();
    expect(screen.getByText("+55 (11) 98765-4321")).toBeInTheDocument();
    const front = card.querySelector('[aria-hidden="false"]')!;
    expect(front.textContent).not.toMatch(/BM|WABA/i);
  });

  it("hover e foco viram o card", () => {
    const { card } = mount();
    fireEvent.pointerEnter(card, { pointerType: "mouse" });
    expect(card).toHaveAttribute("data-flipped", "true");
    fireEvent.pointerLeave(card);
    expect(card).toHaveAttribute("data-flipped", "false");
    fireEvent.focus(card.querySelector('[tabindex="0"]')!);
    expect(card).toHaveAttribute("data-flipped", "true");
  });

  it("verso mostra BM, engrenagem e interruptor; ações chamam handlers", () => {
    const { card, onManage, onToggle } = mount();
    fireEvent.pointerEnter(card, { pointerType: "mouse" });
    const back = screen.getByTestId("connection-card-back");
    expect(back).toHaveAttribute("aria-hidden", "false");
    expect(back).toHaveTextContent("BM …123456");
    fireEvent.click(screen.getByRole("button", { name: "Gerenciar conexão Zentum Cobrança 01" }));
    expect(onManage).toHaveBeenCalledWith("c1");
    fireEvent.click(screen.getByRole("switch", { name: "Desativar conexão Zentum Cobrança 01" }));
    expect(onToggle).toHaveBeenCalledWith("c1");
  });

  it("face oculta fica inerte", () => {
    mount();
    expect(screen.getByTestId("connection-card-back")).toHaveAttribute("inert");
  });

  it("toque vira e desvira; tocar fora desvira", () => {
    setHover(false);
    const { card, onManage } = mount();
    fireEvent.click(card);
    expect(card).toHaveAttribute("data-flipped", "true");
    fireEvent.click(screen.getByRole("button", { name: /Gerenciar conexão/ }));
    expect(onManage).toHaveBeenCalled();
    expect(card).toHaveAttribute("data-flipped", "true");
    fireEvent.click(card);
    expect(card).toHaveAttribute("data-flipped", "false");
    fireEvent.click(card);
    fireEvent.pointerDown(document.body);
    expect(card).toHaveAttribute("data-flipped", "false");
  });

  it("reduced-motion: rotação só com motion-safe, verso sem transformação", () => {
    const { card } = mount();
    const inner = card.firstElementChild!;
    expect(inner.className).toContain("motion-safe:transition-transform");
    expect(inner.className).not.toMatch(/(^|\s)\[transform:rotateY/);
    expect(screen.getByTestId("connection-card-back").className).toContain("motion-reduce:[transform:none]");
  });
});
