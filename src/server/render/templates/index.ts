import type { TemplateFamily } from "@/lib/brand";
import type { TemplateDef } from "../kit";
import { EDITORIAL_TEMPLATES } from "./editorial";
import { EDUCATIVO_TEMPLATES } from "./educativo";
import { NATURAL_TEMPLATES } from "./natural";
import { PRODUTO_TEMPLATES } from "./produto";
import { TECH_TEMPLATES } from "./tech";
import { VIDEO_TEMPLATES } from "./video";

export const TEMPLATES: TemplateDef[] = [
  ...EDITORIAL_TEMPLATES,
  ...NATURAL_TEMPLATES,
  ...EDUCATIVO_TEMPLATES,
  ...PRODUTO_TEMPLATES,
  ...VIDEO_TEMPLATES,
  ...TECH_TEMPLATES,
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export const DEFAULT_TEMPLATE_ID = "editorial-assimetrico";

export function getTemplate(id: string): { template: TemplateDef; known: boolean } {
  const t = BY_ID.get(id);
  if (t) return { template: t, known: true };
  return { template: BY_ID.get(DEFAULT_TEMPLATE_ID)!, known: false };
}

export function templatesByFamily(family: TemplateFamily): TemplateDef[] {
  return TEMPLATES.filter((t) => t.family === family);
}
