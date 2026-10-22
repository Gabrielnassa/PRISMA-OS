import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/server/render/templates";
import { capacityDoc, slideFits } from "@/server/render/calibration";
import { slideKinds, slidePlan } from "@/server/content/compose";
import { capacityFactor } from "@/lib/content/limits";
import type { SlideKind } from "@/lib/content/document";

const KINDS: SlideKind[] = ["cover", "content", "cta"];

describe("capacidade dos templates", () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: todos os campos cheios até o limite efetivo cabem`, async () => {
      for (const aspect of t.aspects) {
        for (const photo of t.image === "none" ? [false] : t.image === "required" ? [true] : [false, true]) {
          for (const kind of KINDS) {
            const { failing } = await slideFits(capacityDoc(t, aspect, kind, photo), kind);
            expect(failing, `${t.id} ${aspect} ${kind} ${photo ? "com foto" : "sem foto"}`).toEqual([]);
          }
        }
      }
    }, 120_000);
  }

  it("o plano enviado à IA usa os limites efetivos de cada lâmina", () => {
    const t = TEMPLATES.find((x) => x.id === "editorial-assimetrico")!;
    const kinds = slideKinds("carousel", 3);
    const ids = ["00000000-0000-4000-8000-0000000000aa", "00000000-0000-4000-8000-0000000000bb", "00000000-0000-4000-8000-0000000000cc"];
    const withPhoto = slidePlan(t, kinds, "1:1", ids);
    // Foto opcional: só lâminas com foto atribuída perdem espaço.
    expect(slidePlan(t, kinds, "1:1", ids.slice(0, 1))[1]!.limits.body).toBe(t.fieldLimits.content.body);
    const plain = slidePlan(t, kinds, "1:1", []);
    expect(capacityFactor(t.capacity, "1:1", "content", true)).toBeLessThan(1);
    expect(withPhoto[1]!.limits.body!).toBeLessThan(plain[1]!.limits.body!);
    expect(plain[1]!.limits.body).toBe(t.fieldLimits.content.body);
  });
});
