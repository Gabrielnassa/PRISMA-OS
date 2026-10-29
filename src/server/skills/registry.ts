import { artDirectorSkill } from "./art-director";
import { copywriterSkill } from "./copywriter";
import { editorialSkill } from "./editorial";
import { ideasSkill } from "./ideas";
import { reviewerSkill } from "./reviewer";
import type { SkillMeta } from "./types";

export { artDirectorSkill, copywriterSkill, editorialSkill, ideasSkill, reviewerSkill };

/** Skills implementadas nesta versão (exibidas em Agentes e skills). */
export const SKILLS: SkillMeta[] = [editorialSkill, ideasSkill, copywriterSkill, artDirectorSkill, reviewerSkill];

export function findSkill(id: string): SkillMeta | undefined {
  return SKILLS.find((s) => s.id === id);
}
