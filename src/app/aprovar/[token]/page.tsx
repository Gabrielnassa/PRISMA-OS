import type { Metadata } from "next";
import { getPublicApproval, type PublicApprovalItem } from "@/server/services/approval-links";
import { PrismaWordmark } from "@/components/brand/logo";
import { formatDateTime } from "@/components/ui";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Aprovação", robots: { index: false, follow: false } };

const DECIDED = {
  approved: { title: "Aprovada", tone: "text-ok" },
  rejected: { title: "Ajuste pedido", tone: "text-warn" },
  superseded: { title: "Versão substituída pela agência", tone: "text-muted" },
  cancelled: { title: "Pedido cancelado pela agência", tone: "text-muted" },
} as const;

function Piece({ token, item, scoped }: { token: string; item: PublicApprovalItem; scoped: boolean }) {
  // No link de um pedido, o título já está no topo da página.
  const src = (i: number) => `/api/publico/aprovacao/${token}/${i}${scoped ? `?pedido=${item.approvalId}` : ""}`;
  return (
    <article className="grid gap-6 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section
        aria-label={`Imagens de ${item.title}`}
        className={item.slideCount > 1 ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}
      >
        {Array.from({ length: item.slideCount }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src(i)}
            alt={item.alts[i] || `Imagem ${i + 1} de ${item.slideCount}`}
            width={item.aspect.width}
            height={item.aspect.height}
            loading={i > 1 ? "lazy" : undefined}
            className="h-auto w-full rounded-md border border-line bg-surface"
          />
        ))}
      </section>
      <aside className="space-y-5">
        <div>
          <div className="text-sm text-muted">
            {item.format} · versão {item.versionNumber}
          </div>
          {scoped ? <h2 className="mt-1 text-lg leading-tight font-semibold text-fg">{item.title}</h2> : null}
        </div>
        {item.caption || item.hashtags.length ? (
          <div className="rounded-md border border-line bg-surface p-5 text-base">
            <div className="text-sm font-medium text-muted">Legenda</div>
            <p className="mt-1.5 leading-relaxed whitespace-pre-wrap text-fg">{item.caption}</p>
            {item.hashtags.length ? <p className="mt-2 text-accent">{item.hashtags.join(" ")}</p> : null}
          </div>
        ) : null}
        {item.requestNote ? <p className="text-base text-muted">Recado da agência: “{item.requestNote}”</p> : null}
        <div className="rounded-md border border-line bg-surface p-5">
          {item.status === "pending" ? (
            <DecisionForm token={token} approvalId={item.approvalId} />
          ) : (
            <div>
              <div className={`text-md font-semibold ${DECIDED[item.status].tone}`}>{DECIDED[item.status].title}</div>
              {item.decidedByName && item.decidedAt ? (
                <p className="mt-1 text-base text-muted">
                  {item.decidedByName} · {formatDateTime(item.decidedAt)}
                </p>
              ) : null}
              {item.decisionNote ? <p className="mt-2 text-base text-fg">“{item.decisionNote}”</p> : null}
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
    <main className="min-h-dvh bg-bg px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <PrismaWordmark />
        {!a ? (
          <div className="mt-16 max-w-md">
            <h1 className="text-lg font-semibold text-fg">Link indisponível</h1>
            <p className="mt-2 text-md leading-relaxed text-muted">
              O link expirou ou não existe mais. Peça um novo à agência.
            </p>
          </div>
        ) : (
          <>
            <header className="mt-10 mb-10">
              <div className="text-base text-muted">
                {a.organizationName} · para {a.clientName}
              </div>
              <h1 className="mt-1 text-lg leading-tight font-semibold text-fg md:text-lg">
                {a.scope === "client" ? "Peças para aprovar" : (a.items[0]?.title ?? "Aprovação")}
              </h1>
              <p className="mt-2 text-base text-muted">
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
              <p className="text-md text-muted">
                Nada aguardando aprovação agora. Quando a agência enviar novas peças, elas aparecem neste mesmo link.
              </p>
            ) : (
              a.items.map((item) => (
                <Piece key={item.approvalId} token={token} item={item} scoped={a.scope === "client"} />
              ))
            )}
          </>
        )}
      </div>
    </main>
  );
}
