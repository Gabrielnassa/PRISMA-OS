import type { Metadata } from "next";
import { getPublicApproval } from "@/server/services/approval-links";
import { PrismaWordmark } from "@/components/brand/logo";
import { formatDateTime } from "@/components/ui";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Aprovação", robots: { index: false, follow: false } };

const DECIDED = {
  approved: { title: "Peça aprovada", tone: "text-emerald-300" },
  rejected: { title: "Ajuste pedido", tone: "text-amber-300" },
  superseded: { title: "Esta versão foi substituída", tone: "text-ink-300" },
  cancelled: { title: "Pedido cancelado pela agência", tone: "text-ink-300" },
} as const;

/** Página pública: o cliente confere a peça e aprova ou pede ajuste, sem login. */
export default async function PublicApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await getPublicApproval(token);
  return (
    <main className="min-h-dvh bg-ink-950 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <PrismaWordmark />
        {!a ? (
          <div className="mt-16 max-w-md">
            <h1 className="font-display text-[30px] font-medium tracking-[-0.04em] text-ink-50">Link indisponível</h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-400">O link expirou ou não existe mais. Peça um novo à agência.</p>
          </div>
        ) : (
          <>
            <header className="mb-8 mt-10">
              <div className="text-[13px] text-ink-400">
                {a.organizationName} · para {a.clientName}
              </div>
              <h1 className="mt-1 font-display text-[30px] font-medium leading-tight tracking-[-0.04em] text-ink-50 md:text-[36px]">{a.title}</h1>
              <p className="mt-2 text-[14px] text-ink-400">Versão {a.versionNumber}{a.status === "pending" ? ` · responda até ${formatDateTime(a.expiresAt)}` : ""}</p>
            </header>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <section aria-label="Peça" className={a.slideCount > 1 ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
                {Array.from({ length: a.slideCount }, (_, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={`/api/publico/aprovacao/${token}/${i}`}
                    alt={a.alts[i] || `Imagem ${i + 1} de ${a.slideCount}`}
                    width={a.aspect.width}
                    height={a.aspect.height}
                    className="h-auto w-full rounded-[10px] border border-ink-700 bg-ink-900"
                  />
                ))}
              </section>
              <aside className="space-y-6">
                {a.caption || a.hashtags.length ? (
                  <div className="rounded-[var(--radius-card)] border border-ink-700/80 bg-ink-900 p-5 text-[14px]">
                    <div className="text-[12.5px] font-medium text-ink-400">Legenda</div>
                    <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-ink-100">{a.caption}</p>
                    {a.hashtags.length ? <p className="mt-2 text-iris-300">{a.hashtags.join(" ")}</p> : null}
                  </div>
                ) : null}
                {a.requestNote ? <p className="text-[13.5px] text-ink-300">Recado da agência: “{a.requestNote}”</p> : null}
                <div className="rounded-[var(--radius-card)] border border-ink-700/80 bg-ink-900 p-5">
                  {a.status === "pending" ? (
                    <DecisionForm token={token} />
                  ) : (
                    <div>
                      <div className={`text-[15px] font-semibold ${DECIDED[a.status].tone}`}>{DECIDED[a.status].title}</div>
                      {a.decidedByName && a.decidedAt ? (
                        <p className="mt-1 text-[13px] text-ink-400">
                          {a.decidedByName} · {formatDateTime(a.decidedAt)}
                        </p>
                      ) : null}
                      {a.decisionNote ? <p className="mt-2 text-[13.5px] text-ink-200">“{a.decisionNote}”</p> : null}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
