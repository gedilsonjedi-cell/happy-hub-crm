import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { centerSquareCrop, resizeToWebp, validateAvatarFile } from "../contactAvatars";

describe("conversão da foto", () => {
  it("recorte quadrado centralizado", () => {
    expect(centerSquareCrop(800, 600)).toEqual({ sx: 100, sy: 0, size: 600 });
    expect(centerSquareCrop(300, 500)).toEqual({ sx: 0, sy: 100, size: 300 });
  });
  it("valida tipo e tamanho", () => {
    expect(validateAvatarFile(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(validateAvatarFile(new File(["x"], "a.bmp", { type: "image/bmp" }))).toMatch(/JPG/);
  });
  it("redimensiona para 256x256 e gera WebP 0,85", async () => {
    const drawImage = vi.fn();
    const toBlob = vi.fn((cb: (b: Blob) => void, type: string, q: number) => cb(new Blob(["w"], { type })));
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob } as unknown as HTMLCanvasElement;
    vi.spyOn(document, "createElement").mockReturnValueOnce(canvas);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1000, height: 500, close: vi.fn() })));
    const out = await resizeToWebp(new Blob(["x"]));
    expect(canvas.width).toBe(256); expect(canvas.height).toBe(256);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 250, 0, 500, 500, 0, 0, 256, 256);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.85);
    expect(out.type).toBe("image/webp");
  });
});
