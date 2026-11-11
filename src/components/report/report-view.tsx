import type { MonthlyReport } from "@/server/services/reports";
import { NETWORK_LABELS } from "@/server/services/social-accounts";
import { monthLabel } from "@/lib/content/editorial";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const date = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
const hours = (h: number | null) =>
  h === null
    ? "—"
    : h < 48
      ? `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
      : `${(h / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3.5">
      <div className="text-[12px] text-zinc-500">{label}</div>
      <div className="mt-1 font-display text-[26px] leading-none font-medium tracking-[-0.04em] text-zinc-950">
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-[11.5px] text-zinc-500">{hint}</div> : null}
    </div>
  );
}

/**
 * Relatório do mês em formato de documento claro (bom para imprimir em PDF e
 * para o cliente ler no celular). `coverSrc` monta o endereço da capa de
 * cada peça (interno com login ou o do link público).
 */
export function ReportView({
  r,
  coverSrc,
}: {
  r: MonthlyReport;
  coverSrc: (p: MonthlyReport["pieces"][number]) => string;
}) {
  const posted = r.posts.length;
  return (
    <article className="mx-auto max-w-4xl bg-white px-6 py-10 text-zinc-800 sm:px-10 print:max-w-none print:px-0 print:py-0">
      <header className="border-b border-zinc-200 pb-6">
        <div className="text-[12.5px] text-zinc-500">{r.organizationName}</div>
        <h1 className="mt-1 font-display text-[34px] leading-tight font-medium tracking-[-0.04em] text-zinc-950">
          Relatório de {monthLabel(r.month).toLowerCase()}
        </h1>
        <div className="mt-1 text-[16px] text-zinc-700">{r.clientName}</div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumo">
        <Kpi
          label="Peças entregues"
          value={r.contracted ? `${r.delivered} de ${r.contracted}` : fmt(r.delivered)}
          hint={r.videosDone ? `inclui ${r.videosDone === 1 ? "1 vídeo" : `${r.videosDone} vídeos`}` : undefined}
        />
        <Kpi
          label="Publicações"
          value={fmt(posted)}
          hint={posted ? [...new Set(r.posts.map((p) => NETWORK_LABELS[p.network]))].join(", ") : "pelo sistema"}
        />
        <Kpi
          label="Alcance e visualizações"
          value={r.totals.withMetrics ? fmt(r.totals.reach + r.totals.views) : "—"}
          hint={r.totals.withMetrics ? undefined : "sem métricas no mês"}
        />
        <Kpi
          label="Interações"
          value={
            r.totals.withMetrics ? fmt(r.totals.likes + r.totals.comments + r.totals.shares + r.totals.saves) : "—"
          }
          hint={
            r.totals.withMetrics ? `${fmt(r.totals.likes)} curtidas · ${fmt(r.totals.comments)} comentários` : undefined
          }
        />
      </section>

      <section className="mt-10 break-inside-avoid">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-zinc-950">Peças aprovadas</h2>
        {r.pieces.length ? (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {r.pieces.map((p) => (
              <li key={p.contentId} className="break-inside-avoid">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverSrc(p)}
                  alt={`Capa de ${p.title}`}
                  className="aspect-[4/5] w-full rounded-lg border border-zinc-200 bg-zinc-100 object-cover"
                  loading="lazy"
                />
                <div className="mt-1.5 text-[13px] leading-snug font-medium text-zinc-900">{p.title}</div>
                <div className="text-[11.5px] text-zinc-500">
                  {p.format} ·{" "}
                  {p.plannedDate
                    ? `pauta de ${date(`${p.plannedDate}T12:00:00Z`)}`
                    : `aprovada em ${date(p.approvedAt)}`}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-zinc-500">Nenhuma peça aprovada neste mês.</p>
        )}
      </section>

      <section className="mt-10 break-inside-avoid">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-zinc-950">Publicações</h2>
        {posted ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-zinc-200 text-[12px] text-zinc-500">
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Rede</th>
                  <th className="py-2 pr-3 font-medium">Peça</th>
                  <th className="py-2 pr-3 text-right font-medium">Alcance</th>
                  <th className="py-2 pr-3 text-right font-medium">Curtidas</th>
                  <th className="py-2 text-right font-medium">Comentários</th>
                </tr>
              </thead>
              <tbody>
                {r.posts.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100">
                    <td className="tabular py-2 pr-3 text-zinc-600">{date(p.publishedAt)}</td>
                    <td className="py-2 pr-3">{NETWORK_LABELS[p.network]}</td>
                    <td className="py-2 pr-3">
                      {p.url ? (
                        <a
                          href={p.url}
                          className="text-zinc-900 underline decoration-zinc-300 underline-offset-2"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {p.title}
                        </a>
                      ) : (
                        p.title
                      )}
                    </td>
                    <td className="tabular py-2 pr-3 text-right">
                      {p.metrics?.reach !== undefined || p.metrics?.views !== undefined
                        ? fmt((p.metrics?.reach ?? 0) + (p.metrics?.views ?? 0))
                        : "—"}
                    </td>
                    <td className="tabular py-2 pr-3 text-right">
                      {p.metrics?.likes !== undefined ? fmt(p.metrics.likes) : "—"}
                    </td>
                    <td className="tabular py-2 text-right">
                      {p.metrics?.comments !== undefined ? fmt(p.metrics.comments) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-[14px] text-zinc-500">Nenhuma publicação feita pelo sistema neste mês.</p>
        )}
      </section>

      <section className="mt-10 grid break-inside-avoid gap-3 sm:grid-cols-3">
        <Kpi
          label="Aprovadas"
          value={fmt(r.approvals.approved)}
          hint={r.approvals.byClient ? `${fmt(r.approvals.byClient)} pelo link do cliente` : undefined}
        />
        <Kpi label="Ajustes pedidos" value={fmt(r.approvals.adjustments)} />
        <Kpi label="Tempo médio até a decisão" value={hours(r.approvals.avgHours)} />
      </section>

      {r.editorial.planned ? (
        <p className="mt-6 text-[13px] text-zinc-600">
          Linha editorial {r.editorial.approved ? "aprovada" : "em rascunho"}: {r.editorial.done} de{" "}
          {r.editorial.planned} pautas produzidas.
        </p>
      ) : null}

      <footer className="mt-12 border-t border-zinc-200 pt-4 text-[11.5px] leading-relaxed text-zinc-500">
        Gerado em{" "}
        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date())}.
        Métricas das publicações feitas pelo sistema, lidas nas APIs oficiais de cada rede.
      </footer>
    </article>
  );
}
