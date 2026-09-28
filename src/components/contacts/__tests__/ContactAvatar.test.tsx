import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = {
  createSignedUrls: vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}`, error: null })), error: null })),
  createSignedUrl: vi.fn(async (p: string) => ({ data: { signedUrl: `https://signed/${p}` }, error: null })),
  upload: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
};
const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => storage }, from: () => ({ update }) },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Avatar só mostra a imagem após carregar: simula carregamento/erro
let imageShouldFail = false;
class FakeImage {
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  complete = false; naturalWidth = 0;
  set src(_v: string) { setTimeout(() => (imageShouldFail ? this.onerror?.() : (this.naturalWidth = 1, this.onload?.())), 0); }
  addEventListener(t: string, cb: () => void) { if (t === "load") this.onload = cb; if (t === "error") this.onerror = cb; }
  removeEventListener() {}
}
vi.stubGlobal("Image", FakeImage);

vi.mock("@/lib/contactAvatars", async (orig) => {
  const mod = await orig<typeof import("@/lib/contactAvatars")>();
  return { ...mod, resizeToWebp: vi.fn(async () => new Blob(["x"], { type: "image/webp" })) };
});

import { ContactAvatar } from "../ContactAvatar";
import { ContactAvatarDialog } from "../ContactAvatarDialog";

describe("ContactAvatar", () => {
  beforeEach(() => { imageShouldFail = false; });
  it("sem foto mostra iniciais", () => {
    render(<ContactAvatar name="Maria Souza" avatarPath={null} />);
    expect(screen.getByText("MS")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("com foto mostra a imagem assinada (em lote)", async () => {
    render(<><ContactAvatar name="Ana" avatarPath="org/l1/1.webp" /><ContactAvatar name="Bia" avatarPath="org/l2/1.webp" /></>);
    const img = await screen.findByAltText("Foto de Ana");
    expect(img).toHaveAttribute("src", "https://signed/org/l1/1.webp");
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
  });
  it("imagem quebrada volta para iniciais", async () => {
    imageShouldFail = true;
    render(<ContactAvatar name="Carlos Lima" avatarPath="org/l3/1.webp" />);
    await act(() => new Promise((r) => setTimeout(r, 120)));
    expect(screen.queryByAltText("Foto de Carlos Lima")).toBeNull();
    expect(screen.getByText("CL")).toBeInTheDocument();
  });
});

describe("ContactAvatarDialog", () => {
  const base = { open: true, onOpenChange: vi.fn(), leadId: "lead-1", organizationId: "org", phone: "5511999998888", name: "Maria" };
  beforeEach(() => { storage.upload.mockClear(); storage.remove.mockClear(); update.mockClear(); });
  const pick = (f: File) => fireEvent.change(screen.getByTestId("avatar-file-input"), { target: { files: [f] } });

  it("rejeita tipo inválido", async () => {
    render(<ContactAvatarDialog {...base} currentPath={null} />);
    pick(new File(["x"], "a.gif", { type: "image/gif" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use JPG, PNG ou WebP");
  });
  it("rejeita arquivo acima de 5 MB", async () => {
    render(<ContactAvatarDialog {...base} currentPath={null} />);
    pick(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("5 MB");
  });
  it("salvar envia arquivo, atualiza o lead e apaga a foto antiga", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
    render(<ContactAvatarDialog {...base} currentPath="org/lead-1/old.webp" />);
    pick(new File(["x"], "a.png", { type: "image/png" }));
    const save = screen.getByRole("button", { name: "Salvar" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(storage.upload).toHaveBeenCalled());
    expect((storage.upload.mock.calls[0] as unknown[])[0]).toMatch(/^org\/lead-1\/\d+\.webp$/);
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ avatar_updated_by: "user-1" })));
    await waitFor(() => expect(storage.remove).toHaveBeenCalledWith(["org/lead-1/old.webp"]));
  });
  it("remover limpa o lead e apaga o arquivo", async () => {
    render(<ContactAvatarDialog {...base} currentPath="org/lead-1/old.webp" />);
    fireEvent.click(screen.getByRole("button", { name: "Remover foto" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ avatar_path: null })));
    await waitFor(() => expect(storage.remove).toHaveBeenCalledWith(["org/lead-1/old.webp"]));
  });
});
