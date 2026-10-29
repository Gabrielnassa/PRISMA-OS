"use client";

import { useActionState } from "react";
import { Badge, Button, Card, CardHeader, Field, Textarea, formatDateTime } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import type { ApprovalRecord } from "@/server/services/content";
import type { ReviewOutput } from "@/server/skills/reviewer";
import { aiReviewAction, approvalLinkAction, commentAction, decideApprovalAction, emailApprovalLinkAction, retryGenerationAction, submitApprovalAction } from "./actions";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/ui";

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
  canShare = false,
}: {
  contentId: string;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  status: string;
  qualityPassed: boolean;
  approvals: ApprovalRecord[];
  canSubmit: boolean;
  canApprove: boolean;
  canShare?: boolean;
}) {
  const [submitState, submit] = useActionState(submitApprovalAction, { status: "idle" });
  const [decideState, decide] = useActionState(decideApprovalAction, { status: "idle" });
  const pending = approvals.find((a) => a.status === "pending");
  const submittable = canSubmit && currentVersionId && ["draft", "in_review", "rejected"].includes(status);

  return (
    <Card>
      <CardHeader title="Aprovação" description="Vale para a versão enviada. Qualquer alteração pede nova aprovação." />
      <div className="flex flex-col gap-4 p-5">
        {pending ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="text-sm font-semibold text-amber-100">Aguardando aprovação da versão {pending.versionNumber}</div>
            <div className="mt-1 text-xs text-amber-100/70">
              Pedido por {pending.requestedByName ?? "—"} em {formatDateTime(pending.requestedAt)}
              {pending.requestNote ? ` · “${pending.requestNote}”` : ""}
            </div>
            {canApprove ? (
              <ActionForm action={decide} state={decideState} className="mt-4 flex flex-col gap-3">
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
              </ActionForm>
            ) : (
              <p className="mt-3 text-xs text-ink-400">A decisão cabe a quem aprova.</p>
            )}
            {canShare ? <ShareApprovalLink approvalId={pending.id} /> : null}
          </div>
        ) : submittable ? (
          <ActionForm action={submit} state={submitState} resetOnSuccess className="flex flex-col gap-3">
            <input type="hidden" name="contentId" value={contentId} />
            <input type="hidden" name="versionId" value={currentVersionId ?? ""} />
            <Field label={`Enviar a versão ${currentVersionNumber} para aprovação`} htmlFor="request-note">
              <Textarea id="request-note" name="note" maxLength={1000} placeholder="Observações para quem vai aprovar (opcional)" className="min-h-16" />
            </Field>
            {!qualityPassed ? <p className="text-xs text-red-300">Corrija os problemas críticos da verificação e salve uma nova versão antes de enviar.</p> : null}
            <FormMessage state={submitState} />
            <div>
              <SubmitButton disabled={!qualityPassed} pendingText="Enviando...">
                Solicitar aprovação
              </SubmitButton>
            </div>
          </ActionForm>
        ) : status === "approved" ? (
          <p className="text-sm text-emerald-300">Versão aprovada.</p>
        ) : null}

        {approvals.length ? (
          <ul className="divide-y divide-ink-800 rounded-lg border border-ink-700">
            {approvals.map((a) => (
              <li key={a.id} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={APPROVAL_STATUS[a.status].tone}>{APPROVAL_STATUS[a.status].label}</Badge>
                  <span className="text-ink-200">Versão {a.versionNumber}</span>
                  <span className="text-xs text-ink-400">{formatDateTime(a.decidedAt ?? a.requestedAt)}</span>
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
        <ActionForm action={action} state={state} resetOnSuccess className="flex flex-col gap-3 border-t border-ink-700 p-5">
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
        </ActionForm>
      ) : null}
    </Card>
  );
}

export function RetryPanel({ contentId, error, canRetry }: { contentId: string; error: string | null; canRetry: boolean }) {
  const [state, action] = useActionState(retryGenerationAction, { status: "idle" });
  return (
    <div className="rounded-[var(--radius-card)] border border-red-400/25 bg-red-400/[0.05] p-5">
      <div className="text-sm font-semibold text-red-100">A geração falhou</div>
      <p className="mt-1 text-sm text-red-100/80">{error ?? "Erro não informado."}</p>
      {canRetry ? (
        <ActionForm action={action} state={state} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="contentId" value={contentId} />
          <SubmitButton variant="secondary" pendingText="Reenviando...">
            Tentar novamente
          </SubmitButton>
          <FormMessage state={state} />
        </ActionForm>
      ) : (
        <p className="mt-3 text-xs text-red-100/70">Peça a alguém da criação para tentar de novo.</p>
      )}
    </div>
  );
}

export function AiReviewPanel({ contentId, enabled }: { contentId: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<import("@/server/actions").ActionState<ReviewOutput>, FormData>(aiReviewAction, { status: "idle" });
  return (
    <Card>
      <CardHeader title="Revisão de texto" description="Ortografia, aderência ao briefing e afirmações sem base" />
      <ActionForm action={action} state={state} className="flex flex-col gap-3 p-5">
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
      </ActionForm>
    </Card>
  );
}

/** Link para o cliente aprovar sem login: copiar, WhatsApp ou e-mail. */
function ShareApprovalLink({ approvalId }: { approvalId: string }) {
  const [link, create, creating] = useActionState(approvalLinkAction, { status: "idle" });
  const [mail, send] = useActionState(emailApprovalLinkAction, { status: "idle" });
  const data = link.status === "ok" ? link.data : undefined;
  const message = data ? `Olá! Segue a peça "${data.title}" para aprovação. É só abrir o link, conferir e responder por lá: ${data.url}` : "";
  return (
    <div className="mt-4 border-t border-amber-500/20 pt-4">
      <div className="text-[13px] font-medium text-amber-50">Aprovação pelo cliente</div>
      {data ? (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="select-all break-all rounded-[4px] bg-ink-950 px-2 py-1 font-mono text-[12px] text-ink-100 ring-1 ring-ink-700">{data.url}</code>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={data.url} label="Copiar link" />
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-full border border-emerald-400/40 px-3.5 text-[13px] font-medium text-emerald-200 hover:bg-emerald-400/10">
              Enviar pelo WhatsApp
            </a>
          </div>
          <ActionForm action={send} state={mail} resetOnSuccess className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="approvalId" value={approvalId} />
            <Input name="email" type="email" placeholder="e-mail do cliente" aria-label="E-mail do cliente" className="w-56" required />
            <SubmitButton size="sm" variant="secondary" pendingText="Enviando...">
              Enviar por e-mail
            </SubmitButton>
          </ActionForm>
          <FormMessage state={mail} />
          <p className="text-[12px] text-amber-100/60">O link vale 14 dias e só para esta versão.</p>
        </div>
      ) : (
        <form
          action={create}
          className="mt-2 flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="approvalId" value={approvalId} />
          <Button type="submit" size="sm" variant="secondary" disabled={creating}>
            {creating ? "Gerando..." : "Gerar link para o cliente"}
          </Button>
          <span className="text-[12px] text-amber-100/70">O cliente vê a peça e aprova ou pede ajuste, sem login.</span>
          {link.status === "error" ? <span className="text-[12.5px] text-red-300">{link.message}</span> : null}
        </form>
      )}
    </div>
  );
}
