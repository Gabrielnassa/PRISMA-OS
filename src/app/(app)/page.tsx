import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { DASHBOARD_PERIODS, DASHBOARD_PERIOD_LABELS, getDashboard, type DashboardPeriod } from "@/server/services/dashboard";
import { CHANNELS, CHANNEL_LABELS, type Channel } from "@/lib/content/document";
import { listClients } from "@/server/services/clients";
import { providerStatus } from "@/server/ai/gateway";
import { can } from "@/server/authz/permissions";
import { CONTENT_STATUSES, STATUS_LABELS, type ContentStatus } from "@/lib/content/status";
import { Alert, Card, CardHeader, EmptyState, LinkButton, PageHeader, Select, Stat, Table, Td, Th, cx, formatDateTime, formatUsd } from "@/components/ui";
import { StatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Dashboard" };

const PIPELINE: ContentStatus[] = ["generating", "in_review", "awaiting_approval", "approved", "rejected", "failed"];

const oneOf = <T extends string>(list: readonly T[], v: string | undefined): T | undefined => (list as readonly string[]).includes(v ?? "") ? (v as T) : undefined;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ cliente?: string; periodo?: string; canal?: string; status?: string }> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const clients = await listClients(auth);
  const clientId = clients.some((c) => c.id === sp.cliente) ? sp.cliente : undefined;
  const period: DashboardPeriod = oneOf(DASHBOARD_PERIODS, sp.periodo) ?? "month";
  const channel = oneOf<Channel>(CHANNELS, sp.canal);
  const status = oneOf<ContentStatus>(CONTENT_STATUSES, sp.status);
  const data = await getDashboard(auth, { clientId, period, channel, status });
  const periodLabel = DASHBOARD_PERIOD_LABELS[period].toLowerCase();
  const provider = providerStatus();

  return (
    <>
      <PageHeader
        eyebrow="Centro de operações"
        title={`Olá, ${auth.userName.split(" ")[0]}`}
        description="Indicadores calculados a partir dos registros reais da sua organização."
        actions={can(auth.role, "content.create") ? <LinkButton href="/criar">Criar conteúdo</LinkButton> : null}
      />

      {clients.length > 0 ? (
        <form className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_170px_185px_190px_auto]" action="/" aria-label="Filtros do dashboard">
          <Select name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="periodo" defaultValue={period} aria-label="Período">
            {DASHBOARD_PERIODS.map((p) => (
              <option key={p} value={p}>
                {DASHBOARD_PERIOD_LABELS[p]}
              </option>
            ))}
          </Select>
          <Select name="canal" defaultValue={channel ?? ""} aria-label="Canal">
            <option value="">Todos os canais</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={status ?? ""} aria-label="Status">
            <option value="">Todos os status</option>
            {CONTENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
              </option>
            ))}
          </Select>
          <button type="submit" className="h-10 rounded-lg border border-ink-600 px-4 text-sm text-ink-200 hover:bg-ink-800">
            Filtrar
          </button>
        </form>
      ) : null}

      {!provider.configured ? (
        <div className="mb-6">
          <Alert tone="warning" title="IA não configurada">
            {provider.detail} Ainda é possível criar peças manualmente a partir dos templates. <Link href="/integracoes" className="underline">Ver integrações</Link>
          </Alert>
        </div>
      ) : provider.isDemo ? (
        <div className="mb-6">
          <Alert tone="warning" title="Modo demonstração ativo">
            As gerações usam o provedor de demonstração (sem IA). Os conteúdos gerados assim ficam identificados como “Demonstração”.
          </Alert>
        </div>
      ) : null}

      {clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente ainda"
          description="Cadastre o primeiro cliente e configure a identidade da marca para começar a produzir."
          action={can(auth.role, "client.create") ? <LinkButton href="/clientes">Cadastrar cliente</LinkButton> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Clientes ativos" value={data.clients.active} hint={`${data.clients.total} no total`} />
            <Stat label="Produzidos" value={data.producedInPeriod} tone="violet" hint={DASHBOARD_PERIOD_LABELS[period]} />
            <Stat label="Aprovados" value={data.approvedInPeriod} tone="teal" hint={DASHBOARD_PERIOD_LABELS[period]} />
            <Stat label="Aguardando aprovação" value={data.pendingApprovals} tone={data.pendingApprovals > 0 ? "warning" : undefined} />
            <Stat label="Falhas de geração" value={data.failedJobs} tone={data.failedJobs > 0 ? "danger" : undefined} hint={`${DASHBOARD_PERIOD_LABELS[period]} · ${data.runningJobs} em andamento`} />
            <Stat
              label={`Consumo de IA (${periodLabel})`}
              value={formatUsd(data.ai.costUsd)}
              hint={
                data.ai.runs === 0
                  ? "Nenhuma execução registrada"
                  : `${data.ai.runs} execução(ões)${data.ai.unpriced ? ` · ${data.ai.unpriced} sem tarifa` : ""}${data.ai.demoRuns ? ` · ${data.ai.demoRuns} demo` : ""}`
              }
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Atividade recente" description="Últimos conteúdos atualizados" actions={<LinkButton href="/conteudos" variant="ghost" size="sm">Ver todos</LinkButton>} />
              {data.recent.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="Sem conteúdos ainda" description="Os conteúdos criados aparecerão aqui." action={can(auth.role, "content.create") ? <LinkButton href="/criar" size="sm">Criar o primeiro</LinkButton> : undefined} />
                </div>
              ) : (
                <ul className="divide-y divide-ink-800">
                  {data.recent.map((r) => (
                    <li key={r.id}>
                      <Link href={`/conteudos/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-850">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink-100">{r.title}</div>
                          <div className="text-xs text-ink-400">
                            {r.clientName} · {formatDateTime(r.updatedAt)}
                          </div>
                        </div>
                        <StatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Fluxo de produção" description="Conteúdos por estado" />
              <ul className="space-y-3 p-5">
                {PIPELINE.map((s) => {
                  const n = data.contentByStatus[s] ?? 0;
                  const total = Math.max(1, ...PIPELINE.map((p) => data.contentByStatus[p] ?? 0));
                  return (
                    <li key={s}>
                      <Link href={`/conteudos?status=${s}${clientId ? `&cliente=${clientId}` : ""}`} className={cx("block", status && status !== s && "opacity-50")}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-ink-300">{STATUS_LABELS[s]}</span>
                          <span className="font-semibold text-ink-100">{n}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-ink-800">
                          <div className="h-1.5 rounded-full prisma-gradient" style={{ width: `${(n / total) * 100}%` }} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-ink-700 px-5 py-3 text-xs text-ink-400">
                Tempo médio do pedido à aprovação ({periodLabel}):{" "}
                <span className="font-semibold text-ink-200">
                  {data.avgHoursToApproval === null
                    ? "sem dados"
                    : data.avgHoursToApproval < 48
                      ? `${data.avgHoursToApproval.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
                      : `${(data.avgHoursToApproval / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`}
                </span>
              </div>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader title="Por cliente" description={`Conteúdos criados, aprovações e consumo de IA (${periodLabel}); pendências atuais`} />
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th className="text-right">Conteúdos</Th>
                  <Th className="text-right">Aguardando aprovação</Th>
                  <Th className="text-right">Aprovados</Th>
                  <Th className="text-right">Consumo de IA</Th>
                </tr>
              </thead>
              <tbody>
                {data.perClient.map((c) => (
                  <tr key={c.clientId}>
                    <Td>
                      <Link href={`/clientes/${c.clientId}`} className="font-medium text-ink-100 hover:text-violet-300">
                        {c.name}
                      </Link>
                    </Td>
                    <Td className="text-right">{c.contents}</Td>
                    <Td className="text-right">{c.pending}</Td>
                    <Td className="text-right">{c.approved}</Td>
                    <Td className="text-right">{formatUsd(c.costUsd)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <p className="mt-4 text-xs text-ink-500">
            Publicações, campanhas e métricas de redes sociais aparecerão aqui quando as integrações oficiais forem conectadas (fases 4 e 6). Nenhum número é estimado.
          </p>
        </>
      )}
    </>
  );
}
