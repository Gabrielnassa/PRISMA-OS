"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth/next";
import { runAction, str, type ActionState } from "@/server/actions";
import {
  addComment,
  archiveContent,
  decideApproval,
  getContent,
  restoreVersion,
  retryGeneration,
  saveVersion,
  submitForApproval,
} from "@/server/services/content";
import { deleteContent } from "@/server/services/deletion";
import { runAiSkill } from "@/server/orchestrator";
import { reviewerSkill, type ReviewOutput } from "@/server/skills/reviewer";
import { assertCan } from "@/server/authz/permissions";
import { ValidationError } from "@/server/errors";
import type { QualityReport } from "@/server/quality/checks";

export async function saveVersionAction(
  contentId: string,
  baseVersionId: string | null,
  document: unknown,
  changeNote: string,
): Promise<ActionState<{ number: number; unchanged: boolean; changes: string[]; quality: QualityReport | null }>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const r = await saveVersion(auth, contentId, { document, baseVersionId, changeNote });
    refresh();
    return {
      message: r.unchanged ? "Nenhuma alteração para salvar." : `Versão ${r.number} salva.`,
      data: { number: r.number, unchanged: r.unchanged, changes: r.changes, quality: r.quality },
    };
  });
}

export async function submitApprovalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await submitForApproval(auth, str(form, "contentId"), { versionId: str(form, "versionId"), note: str(form, "note") });
    refresh();
    return { message: "Enviado para aprovação." };
  });
}

export async function decideApprovalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const decision = str(form, "decision") === "approved" ? "approved" : "rejected";
    await decideApproval(auth, str(form, "approvalId"), { decision, note: str(form, "note") });
    refresh();
    return { message: decision === "approved" ? "Versão aprovada." : "Versão reprovada; a equipe foi orientada pelo comentário." };
  });
}

export async function commentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await addComment(auth, str(form, "contentId"), { body: str(form, "body") });
    refresh();
    return { message: "Comentário registrado." };
  });
}

export async function restoreVersionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await restoreVersion(auth, str(form, "contentId"), str(form, "versionId"), str(form, "baseVersionId") || null);
    refresh();
  });
}

export async function archiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await archiveContent(auth, str(form, "contentId"));
    refresh();
  });
}

export async function deleteContentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await deleteContent(auth, str(form, "contentId"));
    redirect("/conteudos?excluido=1");
  });
}

export async function retryGenerationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await retryGeneration(auth, str(form, "contentId"));
    refresh();
    return { message: "Geração reenviada para a fila." };
  });
}

/** Revisão por IA (consultiva; não substitui as regras nem a aprovação humana). */
export async function aiReviewAction(_prev: ActionState<ReviewOutput>, form: FormData): Promise<ActionState<ReviewOutput>> {
  const auth = await requireAuth();
  return runAction(async () => {
    assertCan(auth.role, "content.edit");
    const detail = await getContent(auth, str(form, "contentId"));
    if (!detail.current) throw new ValidationError("O conteúdo ainda não tem versão.");
    const doc = detail.current.document;
    const out = await runAiSkill(reviewerSkill, {
      auth,
      clientId: detail.clientId,
      contentItemId: detail.id,
      idempotencyKey: `review:${detail.current.id}`,
      input: {
        objective: detail.objective,
        briefing: detail.briefing,
        slides: doc.slides.map((s) => ({ kind: s.kind, ...s.fields, alt: s.alt })),
        caption: doc.caption,
        hashtags: doc.hashtags,
        cta: doc.cta,
      },
    });
    refresh();
    return { data: out.output, message: out.isDemo ? "Revisão de demonstração: nenhuma IA foi chamada." : out.reused ? "Revisão desta versão já existia (sem nova cobrança)." : undefined };
  });
}
