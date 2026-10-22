import { describe, expect, it } from "vitest";
import { canonicalJson, ContentDocumentSchema, normalizeHashtag } from "@/lib/content/document";
import { emptyBrandProfile } from "@/lib/brand";
import { composeDocument, diffDocuments, slideKinds, slidePlan } from "@/server/content/compose";
import { artDirectorSkill } from "@/server/skills/art-director";
import { copywriterSkill } from "@/server/skills/copywriter";
import { getTemplate } from "@/server/render/templates";
import { sampleDocument } from "../support/fixtures";

const visual = emptyBrandProfile().visual;

describe("documento de conteúdo", () => {
  it("impõe limites da plataforma e do formato", () => {
    const doc = sampleDocument();
    expect(ContentDocumentSchema.safeParse({ ...doc, hashtags: Array.from({ length: 31 }, (_, i) => `#tag${i}`) }).success).toBe(false);
    expect(ContentDocumentSchema.safeParse({ ...doc, caption: "x".repeat(2201) }).success).toBe(false);
    expect(ContentDocumentSchema.safeParse({ ...doc, format: "post" }).success).toBe(false); // post aceita 1 lâmina
    expect(ContentDocumentSchema.safeParse({ ...doc, aspect: "9:16" }).success).toBe(false); // carrossel não é 9:16
  });
  it("normaliza hashtags", () => {
    expect(normalizeHashtag("saúde no inverno")).toBe("#saúdenoinverno");
    expect(normalizeHashtag("##tag")).toBe("#tag");
    expect(normalizeHashtag("!!!")).toBeNull();
  });
  it("hash canônico independe da ordem das chaves", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } })).toBe(canonicalJson({ a: { c: [1, { e: 2, f: 1 }], d: 2 }, b: 1 }));
  });
  it("descreve diferenças entre versões", () => {
    const a = sampleDocument();
    const b = structuredClone(a);
    b.slides[1]!.fields.body = "outro texto";
    b.caption = "nova";
    expect(diffDocuments(a, b)).toEqual(["Lâmina 2: body", "Legenda"]);
  });
});

describe("composição", () => {
  it("monta abertura, desenvolvimento e CTA", () => {
    expect(slideKinds("carousel", 5)).toEqual(["cover", "content", "content", "content", "cta"]);
    expect(slideKinds("carousel", 2)).toEqual(["cover", "cta"]);
    expect(slideKinds("post", 7)).toEqual(["cover"]);
  });
  it("gera documento válido a partir da direção de arte (modo manual)", () => {
    const art = artDirectorSkill.run({ format: "carousel", objective: "education", visual, hasImages: false });
    const doc = composeDocument({ format: "carousel", art, kinds: slideKinds("carousel", 4), imageIds: [], copy: null, fallbackTitle: "Pauta", notes: "" });
    expect(doc.slides).toHaveLength(4);
    expect(doc.slides[0]!.fields.title).toBe("Pauta");
    expect(ContentDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe("diretor de arte", () => {
  it("usa a família do objetivo sem fotos", () => {
    const art = artDirectorSkill.run({ format: "carousel", objective: "education", visual, hasImages: false });
    expect(art.template.family).toBe("educativo");
    expect(art.aspect).toBe("4:5");
  });
  it("respeita as fotos selecionadas pelo usuário", () => {
    const art = artDirectorSkill.run({ format: "carousel", objective: "education", visual, hasImages: true });
    expect(art.template.image).not.toBe("none");
  });
  it("prioriza famílias preferidas da marca e o template escolhido", () => {
    expect(artDirectorSkill.run({ format: "post", objective: "awareness", visual: { ...visual, preferredFamilies: ["tech"] }, hasImages: false }).template.family).toBe("tech");
    expect(artDirectorSkill.run({ format: "post", objective: "awareness", visual, hasImages: false, templatePreference: "produto-oferta" }).template.id).toBe("produto-oferta");
  });
  it("Story usa 9:16 e nunca exige foto sem foto disponível", () => {
    const art = artDirectorSkill.run({ format: "story", objective: "conversion", visual, hasImages: false });
    expect(art.aspect).toBe("9:16");
    expect(art.template.image).not.toBe("required");
  });
});

describe("copywriter", () => {
  const template = getTemplate("educativo-lista").template;
  const input = copywriterSkill.inputSchema.parse({
    format: "carousel",
    channel: "instagram",
    objective: "education",
    title: "Cuidados no inverno",
    briefing: { text: "Hidratação importa no frio. Vacinação em dia protege todos.", cta: "Agende" },
    templateName: template.name,
    templateDescription: template.description,
    slidePlan: slidePlan(template, slideKinds("carousel", 4)),
  });
  it("demonstração respeita limites e não inventa campos", () => {
    const out = copywriterSkill.outputSchema.parse(copywriterSkill.demo(input));
    expect(out.slides).toHaveLength(4);
    out.slides.forEach((s, i) => {
      const limits = input.slidePlan[i]!.limits;
      for (const k of ["kicker", "title", "body", "highlight", "footer"] as const) {
        if (limits[k] === undefined) expect(s[k]).toBe("");
        else expect(s[k].length).toBeLessThanOrEqual(limits[k]!);
      }
    });
    expect(out.slides.every((s) => s.highlight === "")).toBe(true); // sem oferta no briefing
  });
  it("pós-processamento corrige número de lâminas e hashtags", () => {
    const raw = { ...copywriterSkill.demo(input), slides: copywriterSkill.demo(input).slides.slice(0, 2), hashtags: ["saúde", "#saúde", "inválida!", ...Array.from({ length: 40 }, (_, i) => `t${i}`)] };
    const out = copywriterSkill.postProcess!(raw, input);
    expect(out.slides.map((s) => s.kind)).toEqual(["cover", "content", "content", "cta"]);
    expect(out.hashtags[0]).toBe("#saúde");
    expect(out.hashtags.length).toBeLessThanOrEqual(30);
  });
});
