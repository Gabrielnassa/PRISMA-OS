import { describe, expect, it } from "vitest";
import { currentMonth, planSlots, shiftMonth } from "@/server/services/editorial";

describe("espaços da linha editorial", () => {
  it("pacote típico (4 carrosséis e 4 vídeos): formatos intercalados, em dias úteis, dentro do mês", () => {
    const slots = planSlots({ posts: 0, carousels: 4, stories: 0, videos: 4 }, "2026-11");
    expect(slots).toHaveLength(8);
    expect(slots.filter((s) => s.format === "video")).toHaveLength(4);
    // Nunca dois do mesmo formato seguidos neste pacote equilibrado.
    for (let i = 1; i < slots.length; i++) expect(slots[i]!.format).not.toBe(slots[i - 1]!.format);
    for (const s of slots) {
      expect(s.date.startsWith("2026-11-")).toBe(true);
      const day = new Date(`${s.date}T12:00:00Z`).getUTCDay();
      expect(day === 0 || day === 6).toBe(false);
    }
    const dates = slots.map((s) => s.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("pacote vazio não gera espaços; meses viram corretamente", () => {
    expect(planSlots({ posts: 0, carousels: 0, stories: 0, videos: 0 }, "2026-11")).toEqual([]);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(currentMonth(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10"); // ainda 31/10 em São Paulo
  });
});
