"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { runAction, str, type ActionState } from "@/server/actions";
import {
  createCustomSkill,
  runCustomSkill,
  setCustomSkillStatus,
  updateCustomSkill,
  type CustomSkillInput,
} from "@/server/services/custom-skills";

function skillInput(form: FormData): CustomSkillInput {
  return {
    name: str(form, "name"),
    description: str(form, "description"),
    instructions: str(form, "instructions"),
    effort: (str(form, "effort") || "medium") as CustomSkillInput["effort"],
    clientId: str(form, "clientId") || null,
    source: str(form, "source") === "skill_md" ? "skill_md" : "manual",
  };
}

export async function saveSkillAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  const skillId = str(form, "skillId");
  let createdId = "";
  const result = await runAction<undefined>(async () => {
    if (!skillId) {
      createdId = (await createCustomSkill(auth, skillInput(form))).id;
      return;
    }
    const expected = Number(str(form, "version"));
    const r = await updateCustomSkill(auth, skillId, skillInput(form), Number.isInteger(expected) && expected > 0 ? expected : undefined);
    refresh();
    return { message: r.changed ? `Skill salva (versão ${r.version}).` : "Nada mudou desde a última versão." };
  });
  if (result.status === "ok" && createdId) redirect(`/skills/${createdId}?nova=1`);
  return result;
}

export async function skillStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await setCustomSkillStatus(auth, str(form, "skillId"), str(form, "op") === "archive" ? "archived" : "active");
    refresh();
  });
}

export interface RunSkillData {
  runId: string;
  clientId: string;
  result: string;
  assumptions: string[];
  isDemo: boolean;
  costUsd: number | null;
}

export async function runSkillAction(_prev: ActionState<RunSkillData>, form: FormData): Promise<ActionState<RunSkillData>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const clientId = str(form, "clientId");
    const out = await runCustomSkill(auth, {
      skillId: str(form, "skillId"),
      clientId,
      request: str(form, "request"),
      requestKey: str(form, "requestKey"),
    });
    // Atualiza o histórico e gera uma chave nova (executar de novo cria outra execução).
    refresh();
    return {
      data: { runId: out.runId, clientId, result: out.output.result, assumptions: out.output.assumptions, isDemo: out.isDemo, costUsd: out.costUsd },
      message: out.isDemo ? "Resultado de demonstração (sem IA)." : out.reused ? "Este pedido já tinha sido executado: mostrando o mesmo resultado, sem nova cobrança." : undefined,
    };
  });
}
