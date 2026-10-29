import { artDirectorSkill } from "./art-director";
import { copywriterSkill } from "./copywriter";
import { editorialSkill } from "./editorial";
import { ideasSkill } from "./ideas";
import { reviewerSkill } from "./reviewer";
import type { SkillMeta } from "./types";

export { artDirectorSkill, copywriterSkill, editorialSkill, ideasSkill, reviewerSkill };

/** Skills implementadas nesta versão (exibidas em Agentes e skills). */
export const SKILLS: SkillMeta[] = [editorialSkill, ideasSkill, copywriterSkill, artDirectorSkill, reviewerSkill];

/** Skills previstas na especificação e ainda não implementadas (transparência no roadmap). */
export const PLANNED_SKILLS: Array<{ name: string; specSection: string; phase: string }> = [
  { name: "Estrategista de marketing", specSection: "9.1", phase: "Fase 3" },
  { name: "Calendário editorial com publicação agendada", specSection: "9.2", phase: "Fase 4" },
  { name: "Produtor de vídeos", specSection: "9.6", phase: "Fase 5" },
  { name: "Desenvolvedor de landing pages", specSection: "9.7", phase: "Fase 5" },
  { name: "Especialista em anúncios", specSection: "9.8", phase: "Fase 6" },
  { name: "Analista de resultados", specSection: "9.10", phase: "Fase 4" },
  { name: "Pesquisador de mercado", specSection: "9.11", phase: "Fase 3" },
  { name: "Gerente de operações", specSection: "9.12", phase: "Fase 3" },
];

export function findSkill(id: string): SkillMeta | undefined {
  return SKILLS.find((s) => s.id === id);
}
