import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Teste de regressão estático: garante que as páginas /usuarios e /conexoes
 * mantenham o guard `!isImpersonating` nos seletores de organização.
 *
 * Se alguém no futuro reintroduzir o seletor amplo (sem o guard) em qualquer
 * uma dessas páginas, este teste quebra imediatamente.
 *
 * Cobertura:
 *  - src/pages/Usuarios.tsx → 1 filtro de organização
 *  - src/pages/Conexoes.tsx → 4 dropdowns (Z-API, Gupshup, Infobip, Meta)
 */

const readSrc = (relPath: string) =>
  readFileSync(resolve(process.cwd(), relPath), "utf8");

describe("Regression: guard de impersonação nos seletores de organização", () => {
  it("Usuarios.tsx usa `isSuperAdmin && !isImpersonating` no filtro de organização", () => {
    const source = readSrc("src/pages/Usuarios.tsx");
    expect(source).toMatch(
      /isSuperAdmin\s*&&\s*!isImpersonating\s*&&\s*organizations\.length\s*>\s*0/
    );
  });

  it("Usuarios.tsx importa `isImpersonating` de useEffectiveOrganizationId", () => {
    const source = readSrc("src/pages/Usuarios.tsx");
    expect(source).toMatch(
      /useEffectiveOrganizationId\(\)[\s\S]{0,200}isImpersonating/
    );
  });

  it("Usuarios.tsx auto-fixa o filtro com a organização impersonada", () => {
    const source = readSrc("src/pages/Usuarios.tsx");
    // O efeito que sincroniza selectedOrgFilter com a org ativa
    expect(source).toMatch(/setSelectedOrgFilter\(organizationId\)/);
  });

  it("Conexoes.tsx esconde TODOS os seletores de organização durante impersonação", () => {
    const source = readSrc("src/pages/Conexoes.tsx");

    // Conta quantos blocos `{isSuperAdmin && (` ainda existem para o seletor
    // de organização. Devem ser ZERO — todos devem ter `!isImpersonating`.
    const unguardedSelectors = source.match(
      /\{isSuperAdmin && \(\s*\n\s*<div[^>]*>\s*\n\s*<Label[^>]*>\s*Organização\s*\*/g
    );
    expect(unguardedSelectors).toBeNull();

    // E deve haver pelo menos 4 ocorrências do guard correto (Z-API, Gupshup, Infobip, Meta)
    const guardedSelectors = source.match(
      /\{isSuperAdmin\s*&&\s*!isImpersonating\s*&&\s*\(/g
    );
    expect(guardedSelectors).not.toBeNull();
    expect(guardedSelectors!.length).toBeGreaterThanOrEqual(4);
  });

  it("Conexoes.tsx auto-seleciona a org impersonada para vincular novos canais", () => {
    const source = readSrc("src/pages/Conexoes.tsx");
    expect(source).toMatch(
      /isSuperAdmin\s*&&\s*isImpersonating\s*&&\s*effectiveOrganizationId[\s\S]{0,120}setSelectedOrgId\(effectiveOrganizationId\)/
    );
  });
});
