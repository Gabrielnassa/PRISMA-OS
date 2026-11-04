import type { Metadata } from "next";
import { getPublicApproval, type PublicApprovalItem } from "@/server/services/approval-links";
import { PrismaWordmark } from "@/components/brand/logo";
import { formatDateTime } from "@/components/ui";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Aprovação", robots: { index: false, follow: false } };

const DECIDED = {
  approved: { title: "Aprovada", tone: "text-emerald-300" },
  rejected: { title: "Ajuste pedido", tone: "text-amber-300" },
  superseded: { title: "Versão substituída pela agência", tone: "text-ink-300" },
  cancelled: { title: "Pedido cancelado pela agência", tone: "text-ink-300" },
} as const;

function Piece({ token, item, scoped }: { token: string; item: PublicApprovalItem; scoped: boolean }) {
  // No link de um pedido, o título já está no topo da página.
  const src = (i: number) => `/api/publico/aprovacao/${token}/${i}${scoped ? `?pedido=${item.approvalId}` : ""}`;
  return (
    <article className="grid gap-6 border-t border-ink-800 py-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-label={`Imagens de ${item.title}`} className={item.slideCount > 1 ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
        {Array.from({ length: item.slideCount }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src(i)}
            alt={item.alts[i] || `Imagem ${i + 1} de ${item.slideCount}`}
            width={item.aspect.width}
            height={item.aspect.height}
            loading={i > 1 ? "lazy" : undefined}
            className="h-auto w-full rounded-[10px] border border-ink-700 bg-ink-900"
          />
        ))}
      </section>
      <aside className="space-y-5">
        <div>
          <div className="text-[12.5px] text-ink-400">
            {item.format} · versão {item.versionNumber}
          </div>
          {scoped ? <h2 className="mt-1 font-display text-[24px] font-medium leading-tight tracking-[-0.03em] text-ink-50">{item.title}</h2> : null}
        </div>
        {item.caption || item.hashtags.length ? (
          <div className="rounded-[var(--radius-card)] border border-ink-700/80 bg-ink-900 p-5 text-[14px]">
            <div className="text-[12.5px] font-medium text-ink-400">Legenda</div>
            <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-ink-100">{item.caption}</p>
            {item.hashtags.length ? <p className="mt-2 text-iris-300">{item.hashtags.join(" ")}</p> : null}
          </div>
        ) : null}
        {item.requestNote ? <p className="text-[13.5px] text-ink-300">Recado da agência: “{item.requestNote}”</p> : null}
        <div className="rounded-[var(--radius-card)] border border-ink-700/80 bg-ink-900 p-5">
          {item.status === "pending" ? (
            <DecisionForm token={token} approvalId={item.approvalId} />
          ) : (
            <div>
              <div className={`text-[15px] font-semibold ${DECIDED[item.status].tone}`}>{DECIDED[item.status].title}</div>
              {item.decidedByName && item.decidedAt ? (
                <p className="mt-1 text-[13px] text-ink-400">
                  {item.decidedByName} · {formatDateTime(item.decidedAt)}
                </p>
              ) : null}
              {item.decisionNote ? <p className="mt-2 text-[13.5px] text-ink-200">“{item.decisionNote}”</p> : null}
            </div>
          )}
        </div>
      </aside>
    </article>
  );
}

/** Página pública: o cliente confere as peças e aprova ou pede ajuste, sem login. */
export default async function PublicApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await getPublicApproval(token);
  const pending = a ? a.items.filter((i) => i.status === "pending").length : 0;
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
            <header className="mb-10 mt-10">
              <div className="text-[13px] text-ink-400">
                {a.organizationName} · para {a.clientName}
              </div>
              <h1 className="mt-1 font-display text-[30px] font-medium leading-tight tracking-[-0.04em] text-ink-50 md:text-[36px]">
                {a.scope === "client" ? "Peças para aprovar" : (a.items[0]?.title ?? "Aprovação")}
              </h1>
              <p className="mt-2 text-[14px] text-ink-400">
                {a.scope === "client"
                  ? pending
                    ? `${pending === 1 ? "1 peça aguardando" : `${pending} peças aguardando`} a sua resposta · link válido até ${formatDateTime(a.expiresAt)}`
                    : "Tudo respondido. Obrigado!"
                  : pending
                    ? `Responda até ${formatDateTime(a.expiresAt)}`
                    : ""}
              </p>
            </header>
            {a.items.length === 0 ? (
              <p className="text-[14.5px] text-ink-400">Nada aguardando aprovação agora. Quando a agência enviar novas peças, elas aparecem neste mesmo link.</p>
            ) : (
              a.items.map((item) => <Piece key={item.approvalId} token={token} item={item} scoped={a.scope === "client"} />)
            )}
          </>
        )}
      </div>
    </main>
  );
}
