import { readFileSync } from "fs";
import { describe, expect, it, beforeEach } from "vitest";

const html = readFileSync("index.html", "utf8");
const script = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/)![1];
const run = () => new Function(script)();
const root = document.documentElement;

describe("tema antes do primeiro paint", () => {
  beforeEach(() => { localStorage.clear(); root.className = ""; root.style.colorScheme = ""; });
  it("sem valor salvo abre escuro", () => {
    run();
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
  });
  it("valor 'system' ou inválido abre escuro", () => {
    localStorage.setItem("optimus-theme", "system");
    run();
    expect(root.classList.contains("dark")).toBe(true);
  });
  it("valor 'light' salvo permanece claro", () => {
    localStorage.setItem("optimus-theme", "light");
    run();
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });
  it("alternar tema funciona nos dois sentidos", () => {
    localStorage.setItem("optimus-theme", "dark"); run();
    expect(root.classList.contains("dark")).toBe(true);
    localStorage.setItem("optimus-theme", "light"); run();
    expect(root.classList.contains("dark")).toBe(false);
  });
});
