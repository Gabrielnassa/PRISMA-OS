import { describe, expect, it } from "vitest";
import { formatRelative } from "@/components/ui";

describe("datas relativas", () => {
  const now = new Date("2026-10-29T15:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
  it("usa minutos, horas e dias e volta à data depois de uma semana", () => {
    expect(formatRelative(ago(20), now)).toBe("agora");
    expect(formatRelative(ago(5 * 60), now)).toBe("há 5 min");
    expect(formatRelative(ago(3 * 3600), now)).toBe("há 3 h");
    expect(formatRelative(ago(86400 + 60), now)).toBe("ontem");
    expect(formatRelative(ago(4 * 86400), now)).toBe("há 4 dias");
    expect(formatRelative(ago(10 * 86400), now)).toBe("19/10/2026");
    expect(formatRelative(null, now)).toBe("—");
  });
});
