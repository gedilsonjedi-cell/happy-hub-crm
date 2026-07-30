import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseAuth = vi.fn();
const mockUseUserRole = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => mockUseUserRole() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a) },
}));

import { useUserSectors } from "@/hooks/useUserSectors";

const ME = "user-me";
const OTHER = "user-other";
const ORG = "org-1";
const MY_SECTOR = "sector-mine";
const OTHER_SECTOR = "sector-other";

function setup(role: "atendente" | "supervisor" | "admin" | "super_admin", sectorIds: string[]) {
  mockUseAuth.mockReturnValue({ user: { id: ME } });
  mockUseUserRole.mockReturnValue({ role, organizationId: ORG });

  // Simulate useUserSectors fetch chain. For admin/super_admin it queries sectors directly;
  // for others it queries user_sectors then sectors. We short-circuit by returning empty
  // arrays and manually seed sectorIds via re-render trick: instead, return sectorIds rows.
  mockFrom.mockImplementation((table: string) => {
    if (table === "user_sectors") {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: sectorIds.map((id) => ({ sector_id: id })), error: null }),
        }),
      };
    }
    if (table === "sectors") {
      // Support both .eq().order() (admin path) and .in().order() (attendant path)
      const rows = sectorIds.map((id) => ({ id, name: id, description: null }));
      const chain = {
        eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        in: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
      };
      return { select: () => chain };
    }
    return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
  });
}

async function renderCan(role: Parameters<typeof setup>[0], sectorIds: string[]) {
  setup(role, sectorIds);
  const { result } = renderHook(() => useUserSectors());
  // wait for effect
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return result.current.canAccessConversation;
}

beforeEach(() => {
  mockUseAuth.mockReset();
  mockUseUserRole.mockReset();
  mockFrom.mockReset();
});

describe("canAccessConversation — ownership + sector isolation", () => {
  it("1. attendant: sem sector e sem dono → true", async () => {
    const can = await renderCan("atendente", [MY_SECTOR]);
    expect(can({ sectorId: null, assignedTo: null })).toBe(true);
  });

  it("2. attendant: dono = próprio usuário → true", async () => {
    const can = await renderCan("atendente", [MY_SECTOR]);
    expect(can({ sectorId: MY_SECTOR, assignedTo: ME })).toBe(true);
  });

  it("3. attendant: dono = outro usuário → false", async () => {
    const can = await renderCan("atendente", [MY_SECTOR]);
    expect(can({ sectorId: MY_SECTOR, assignedTo: OTHER })).toBe(false);
  });

  it("4. supervisor: dono = outro usuário → true (visão geral como admin)", async () => {
    const can = await renderCan("supervisor", [MY_SECTOR]);
    expect(can({ sectorId: MY_SECTOR, assignedTo: OTHER })).toBe(true);
  });

  it("5. supervisor: dono = próprio usuário → true", async () => {
    const can = await renderCan("supervisor", [MY_SECTOR]);
    expect(can({ sectorId: MY_SECTOR, assignedTo: ME })).toBe(true);
  });


  it("6. admin: dono = outro usuário → true (bypass)", async () => {
    const can = await renderCan("admin", [MY_SECTOR]);
    expect(can({ sectorId: OTHER_SECTOR, assignedTo: OTHER })).toBe(true);
  });

  it("7. super_admin: dono = outro usuário → true (bypass)", async () => {
    const can = await renderCan("super_admin", [MY_SECTOR]);
    expect(can({ sectorId: OTHER_SECTOR, assignedTo: OTHER })).toBe(true);
  });

  it("8a. attendant: sector alheio, sem dono → false (regra de setor)", async () => {
    const can = await renderCan("atendente", [MY_SECTOR]);
    expect(can({ sectorId: OTHER_SECTOR, assignedTo: null })).toBe(false);
  });

  it("8b. supervisor: sector alheio, sem dono → false (regra de setor)", async () => {
    const can = await renderCan("supervisor", [MY_SECTOR]);
    expect(can({ sectorId: OTHER_SECTOR, assignedTo: null })).toBe(false);
  });
});
