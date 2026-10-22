import { z } from "zod";
import { BrandVisualSchema, type BrandVisual, type TemplateFamily } from "@/lib/brand";
import { CONTENT_FORMATS, FORMAT_ASPECTS, OBJECTIVES, type Aspect, type ContentFormat, type DocumentStyle, type Objective } from "@/lib/content/document";
import { TEMPLATES, getTemplate } from "../render/templates";
import type { TemplateDef } from "../render/kit";
import type { RulesSkill } from "./types";

export const ArtDirectionInputSchema = z.object({
  format: z.enum(CONTENT_FORMATS),
  objective: z.enum(OBJECTIVES),
  segment: z.string().default(""),
  visual: BrandVisualSchema,
  handle: z.string().default(""),
  hasImages: z.boolean(),
  templatePreference: z.string().default("auto"),
  aspect: z.enum(["1:1", "4:5", "9:16"]).optional(),
  recentTemplateIds: z.array(z.string()).default([]),
});
export type ArtDirectionInput = z.input<typeof ArtDirectionInputSchema>;

export interface ArtDirection {
  template: TemplateDef;
  aspect: Aspect;
  style: DocumentStyle;
  rationale: string[];
}

const OBJECTIVE_FAMILY: Record<Objective, TemplateFamily> = {
  awareness: "editorial",
  engagement: "natural",
  education: "educativo",
  conversion: "produto",
  authority: "educativo",
  relationship: "natural",
};

function supports(t: TemplateDef, format: ContentFormat, aspect: Aspect) {
  return t.formats.includes(format) && t.aspects.includes(aspect);
}

/**
 * Diretor de arte por regras (seção 9.4): escolhe template e proporção e
 * converte a identidade visual da marca em estilo da peça. Determinístico e
 * explicável; a escolha pode ser alterada no editor.
 */
export const artDirectorSkill: RulesSkill<ArtDirectionInput, ArtDirection> = {
  id: "art-director.rules",
  version: "1.0.0",
  name: "Diretor de arte (regras)",
  specSection: "9.4",
  description: "Seleciona template, proporção e estilo a partir do objetivo, do formato, das famílias preferidas e da disponibilidade de fotos reais.",
  kind: "rules",
  allowedTools: [],
  qualityCriteria: ["Template compatível com formato e proporção", "Template com foto só quando há foto real", "Evita repetir o mesmo template em sequência"],
  errorHandling: "Sem template compatível, usa o padrão editorial e registra a justificativa.",
  inputSchema: ArtDirectionInputSchema,
  run(raw) {
    const input = ArtDirectionInputSchema.parse(raw);
    const rationale: string[] = [];
    const aspect: Aspect = input.aspect && FORMAT_ASPECTS[input.format].includes(input.aspect) ? input.aspect : FORMAT_ASPECTS[input.format][0]!;
    let template: TemplateDef | undefined;

    if (input.templatePreference !== "auto") {
      const { template: t, known } = getTemplate(input.templatePreference);
      if (known && supports(t, input.format, aspect)) {
        template = t;
        rationale.push(`Template escolhido pelo usuário: ${t.name}.`);
      } else {
        rationale.push("O template solicitado não é compatível com o formato; seleção automática aplicada.");
      }
    }

    if (!template) {
      const isTech = /tecnolog|software|saas|digital|startup|app/i.test(input.segment);
      const families: TemplateFamily[] = [
        ...input.visual.preferredFamilies,
        ...(isTech ? (["tech"] as TemplateFamily[]) : []),
        OBJECTIVE_FAMILY[input.objective],
        "editorial",
      ];
      for (const family of families) {
        const candidates = TEMPLATES.filter((t) => t.family === family && supports(t, input.format, aspect));
        const usable = candidates.filter((t) => (input.hasImages ? true : t.image !== "required"));
        const ranked = [...usable].sort((a, b) => {
          const score = (t: TemplateDef) =>
            (input.hasImages && t.image !== "none" ? 2 : 0) + (!input.hasImages && t.image === "none" ? 1 : 0) - (input.recentTemplateIds[0] === t.id ? 3 : 0);
          return score(b) - score(a);
        });
        if (ranked[0]) {
          template = ranked[0];
          rationale.push(
            input.visual.preferredFamilies.includes(family)
              ? `Família preferida da marca: ${family}.`
              : family === "tech"
                ? "Segmento de tecnologia: família Tech."
                : `Família indicada para o objetivo: ${family}.`,
          );
          rationale.push(input.hasImages ? "Há fotos reais selecionadas: priorizado layout com foto." : "Sem fotos selecionadas: priorizado layout tipográfico.");
          break;
        }
      }
    }
    template ??= getTemplate("editorial-assimetrico").template;

    const visual: BrandVisual = input.visual;
    const style: DocumentStyle = {
      colors: { ...visual.colors },
      headingFont: visual.headingFont,
      bodyFont: visual.bodyFont,
      logoAssetId: visual.logoAssetId,
      showLogo: true,
      handle: input.handle,
    };
    if (!visual.configured) rationale.push("Identidade visual não configurada: cores e fontes provisórias.");
    return { template, aspect, style, rationale };
  },
};
