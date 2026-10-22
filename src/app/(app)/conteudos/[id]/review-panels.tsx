"use client";

import { useActionState } from "react";
import { Badge, Button, Card, CardHeader, Field, Textarea, formatDateTime } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import type { ApprovalRecord } from "@/server/services/content";
import type { ReviewOutput } from "@/server/skills/reviewer";
import { aiReviewAction, commentAction, decideApprovalAction, retryGenerationAction, submitApprovalAction } from "./actions";

const APPROVAL_STATUS: Record<ApprovalRecord["status"], { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovada", tone: "success" },
  rejected: { label: "Reprovada", tone: "danger" },
  superseded: { label: "Substituída", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export function ApprovalPanel({
  contentId,
  currentVersionId,
  currentVersionNumber,
  status,
  qualityPassed,
  approvals,
  canSubmit,
  canApprove,
}: {
  contentId: string;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  status: string;
  qualityPassed: boolean;
  approvals: ApprovalRecord[];
  canSubmit: boolean;
  canApprove: boolean;
}) {
  const [submitState, submit] = useActionState(submitApprovalAction, { status: "idle" });
  const [decideState, decide] = useActionState(decideApprovalAction, { status: "idle" });
  const pending = approvals.find((a) => a.status === "pending");
  const submittable = canSubmit && currentVersionId && ["draft", "in_review", "rejected"].includes(status);

  return (
    <Card>
      <CardHeader title="Aprovação" description="A aprovação fica vinculada à versão exata (hash do conteúdo). Qualquer alteração exige nova aprovação." />
      <div className="flex flex-col gap-4 p-5">
        {pending ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="text-sm font-semibold text-amber-100">Aguardando aprovação da versão {pending.versionNumber}</div>
            <div className="mt-1 text-xs text-amber-100/70">
              Pedido por {pending.requestedByName ?? "—"} em {formatDateTime(pending.requestedAt)}
              {pending.requestNote ? ` · “${pending.requestNote}”` : ""}
            </div>
            {canApprove ? (
              <form action={decide} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="approvalId" value={pending.id} />
                <Field label="Comentário da decisão" htmlFor="decision-note" hint="Obrigatório ao reprovar: explique o ajuste necessário.">
                  <Textarea id="decision-note" name="note" maxLength={2000} className="min-h-20" />
                </Field>
                <FormMessage state={decideState} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="approved" pendingText="Registrando...">
                    Aprovar versão {pending.versionNumber}
                  </SubmitButton>
                  <SubmitButton name="decision" value="rejected" variant="danger" pendingText="Registrando...">
                    Reprovar
                  </SubmitButton>
                </div>
              </form>
            ) : (
              <p className="mt-3 text-xs text-ink-400">Seu papel não permite decidir aprovações.</p>
            )}
          </div>
        ) : submittable ? (
          <form action={submit} className="flex flex-col gap-3">
            <input type="hidden" name="contentId" value={contentId} />
            <input type="hidden" name="versionId" value={currentVersionId ?? ""} />
            <Field label={`Enviar a versão ${currentVersionNumber} para aprovação`} htmlFor="request-note">
              <Textarea id="request-note" name="note" maxLength={1000} placeholder="Observações para quem vai aprovar (opcional)" className="min-h-16" />
            </Field>
            {!qualityPassed ? <p className="text-xs text-red-300">Há problemas críticos no controle de qualidade. Corrija e salve uma nova versão antes de enviar.</p> : null}
            <FormMessage state={submitState} />
            <div>
              <SubmitButton disabled={!qualityPassed} pendingText="Enviando...">
                Solicitar aprovação
              </SubmitButton>
            </div>
          </form>
        ) : status === "approved" ? (
          <p className="text-sm text-emerald-300">Versão aprovada. Exportação liberada.</p>
        ) : null}

        {approvals.length ? (
          <ul className="divide-y divide-ink-800 rounded-lg border border-ink-700">
            {approvals.map((a) => (
              <li key={a.id} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={APPROVAL_STATUS[a.status].tone}>{APPROVAL_STATUS[a.status].label}</Badge>
                  <span className="text-ink-200">Versão {a.versionNumber}</span>
                  <span className="text-xs text-ink-500">{formatDateTime(a.decidedAt ?? a.requestedAt)}</span>
                </div>
                {a.decidedByName ? (
                  <p className="mt-1 text-xs text-ink-400">
                    {a.decidedByName}
                    {a.decisionNote ? `: “${a.decisionNote}”` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

export function CommentsPanel({ contentId, comments, canComment }: { contentId: string; comments: Array<{ id: string; body: string; authorName: string | null; createdAt: string; versionNumber: number | null }>; canComment: boolean }) {
  const [state, action] = useActionState(commentAction, { status: "idle" });
  return (
    <Card>
      <CardHeader title="Comentários e ajustes" />
      {comments.length ? (
        <ul className="divide-y divide-ink-800">
          {comments.map((c) => (
            <li key={c.id} className="px-5 py-3 text-sm">
              <div className="text-xs text-ink-400">
                <span className="font-medium text-ink-200">{c.authorName ?? "—"}</span> · {formatDateTime(c.createdAt)}
                {c.versionNumber ? ` · v${c.versionNumber}` : ""}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-ink-100">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-3 text-sm text-ink-400">Nenhum comentário.</p>
      )}
      {canComment ? (
        <form action={action} className="flex flex-col gap-3 border-t border-ink-700 p-5">
          <input type="hidden" name="contentId" value={contentId} />
          <label htmlFor="comment" className="sr-only">
            Novo comentário
          </label>
          <Textarea id="comment" name="body" required maxLength={4000} placeholder="Solicite um ajuste ou registre uma observação" className="min-h-16" />
          <FormMessage state={state} />
          <div>
            <SubmitButton variant="secondary" size="sm">
              Comentar
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

export function RetryPanel({ contentId, error }: { contentId: string; error: string | null }) {
  const [state, action] = useActionState(retryGenerationAction, { status: "idle" });
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
      <div className="text-sm font-semibold text-red-100">A geração falhou</div>
      <p className="mt-1 text-sm text-red-100/80">{error ?? "Erro não informado."}</p>
      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="contentId" value={contentId} />
        <SubmitButton variant="secondary" pendingText="Reenviando...">
          Tentar novamente
        </SubmitButton>
        <FormMessage state={state} />
      </form>
    </div>
  );
}

export function AiReviewPanel({ contentId, enabled }: { contentId: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<import("@/server/actions").ActionState<ReviewOutput>, FormData>(aiReviewAction, { status: "idle" });
  return (
    <Card>
      <CardHeader title="Revisão por IA" description="Consultiva: ortografia, aderência ao briefing e afirmações sem base. Não substitui a aprovação humana." />
      <form action={action} className="flex flex-col gap-3 p-5">
        <input type="hidden" name="contentId" value={contentId} />
        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={!enabled || pending}>
            {pending ? "Revisando..." : "Revisar versão atual"}
          </Button>
        </div>
        <FormMessage state={state} />
        {state.status === "ok" && state.data ? (
          <div className="text-sm">
            <p className="text-ink-200">{state.data.summary}</p>
            {state.data.issues.length ? (
              <ul className="mt-2 space-y-2">
                {state.data.issues.map((i, n) => (
                  <li key={n} className="rounded-lg border border-ink-700 p-2.5">
                    <Badge tone={i.severity === "critical" ? "danger" : i.severity === "warning" ? "warning" : "neutral"}>{i.severity}</Badge>{" "}
                    <span className="text-xs text-ink-400">{i.slideNumber ? `Lâmina ${i.slideNumber}` : "Legenda"} · {i.field}</span>
                    <p className="mt-1 text-ink-100">{i.problem}</p>
                    <p className="text-xs text-ink-400">Sugestão: {i.suggestion}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>
    </Card>
  );
}
