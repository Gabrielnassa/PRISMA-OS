import Link from "next/link";
import type { Publication } from "@/server/services/publications";
import { KIND_LABELS, PUBLICATION_STATUS_LABELS } from "@/server/services/publications";
import { NETWORK_LABELS } from "@/server/services/social-accounts";
import { publicationOpAction } from "@/app/(app)/publicacoes/actions";
import { Badge, formatDateTime } from "./ui";
import { InlineAction } from "./inline-action";

const TONE = { scheduled: "info", publishing: "accent", published: "success", failed: "danger", cancelled: "neutral" } as const;

function metricsText(m: Publication["metrics"]): string | null {
  if (!m) return null;
  const parts: string[] = [];
  const n = (v: number | undefined, one: string, many: string) => (typeof v === "number" ? parts.push(`${v.toLocaleString("pt-BR")} ${v === 1 ? one : many}`) : 0);
  n(m.views, "visualização", "visualizações");
  n(m.reach, "pessoa alcançada", "pessoas alcançadas");
  n(m.likes, "curtida", "curtidas");
  n(m.comments, "comentário", "comentários");
  n(m.shares, "compartilhamento", "compartilhamentos");
  n(m.saves, "salvamento", "salvamentos");
  return parts.length ? parts.join(" · ") : null;
}

/** Lista de publicações com as ações de cada uma (cancelar, tentar de novo, métricas). */
export function PublicationList({ items, showClient = true, showContent = true, canAct }: { items: Publication[]; showClient?: boolean; showContent?: boolean; canAct: boolean }) {
  return (
    <ul className="divide-y divide-ink-800">
      {items.map((p) => {
        const metrics = metricsText(p.metrics);
        return (
          <li key={p.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5 text-[13.5px]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink-50">{NETWORK_LABELS[p.network]}</span>
                <span className="text-ink-400">{p.accountLabel}</span>
                <Badge tone={TONE[p.status]}>{PUBLICATION_STATUS_LABELS[p.status]}</Badge>
                <span className="text-[12px] text-ink-400">{KIND_LABELS[p.kind]}</span>
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-ink-400">
                {showClient ? `${p.clientName} · ` : ""}
                {showContent ? (
                  p.contentId ? (
                    <Link href={`/conteudos/${p.contentId}`} className="hover:text-ink-100 hover:underline">
                      {p.contentTitle ?? p.title}
                    </Link>
                  ) : (
                    p.title
                  )
                ) : null}
                {showContent ? " · " : ""}
                <span className="tabular">
                  {p.status === "published" && p.publishedAt ? `publicada ${formatDateTime(p.publishedAt)}` : p.status === "scheduled" ? `para ${formatDateTime(p.scheduledAt)}` : formatDateTime(p.scheduledAt)}
                </span>
                {p.requestedByName ? ` · por ${p.requestedByName}` : ""}
              </div>
              {p.error && p.status !== "published" ? <div className="mt-1 text-[12.5px] text-red-300">{p.error}</div> : null}
              {metrics ? (
                <div className="mt-1 text-[12.5px] text-ink-300">
                  {metrics}
                  {p.metricsAt ? <span className="text-ink-500"> · {formatDateTime(p.metricsAt)}</span> : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {p.externalUrl ? (
                <a href={p.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-iris-300 hover:underline">
                  Ver post
                </a>
              ) : null}
              {canAct && p.status === "published" && p.network !== "tiktok" ? (
                <InlineAction action={publicationOpAction} fields={{ publicationId: p.id, op: "metrics" }} label="Atualizar métricas" pendingText="Consultando..." />
              ) : null}
              {canAct && p.status === "failed" ? <InlineAction action={publicationOpAction} fields={{ publicationId: p.id, op: "retry" }} label="Tentar de novo" /> : null}
              {canAct && (p.status === "scheduled" || p.status === "failed") ? (
                <InlineAction action={publicationOpAction} fields={{ publicationId: p.id, op: "cancel" }} label="Cancelar" tone="danger" confirmMessage="Cancelar esta publicação?" />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
