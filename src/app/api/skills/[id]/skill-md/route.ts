import { apiAuth, jsonError } from "@/server/http";
import { getCustomSkill } from "@/server/services/custom-skills";
import { skillSlug, toSkillMd } from "@/lib/skills/skill-md";

/** Baixa a versão atual da skill no formato SKILL.md (para guardar, compartilhar ou importar em outro lugar). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await apiAuth();
    const { id } = await params;
    const skill = await getCustomSkill(auth, id);
    return new Response(toSkillMd(skill), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${skillSlug(skill.name)}-v${skill.version}.SKILL.md"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
