import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/server/auth/next";
import { getCostSummary } from "@/server/services/costs";
import { can } from "@/server/authz/permissions";
import { Badge, Card, CardHeader, Dot, EmptyState, PageHeader, Stat, StatGroup, Table, Td, Th, formatDateTime, formatNumber, formatUsd } from "@/components/ui";
import { PriceForm } from "./price-form";

export const metadata: Metadata = { title: "Custos e consumo" };

const RUN_STATUS: Record<string, { label: string; tone: "success" | "info" | "danger" | "warning" }> = {
  succeeded: { label: "Concluída", tone: "success" },
  running: { label: "Em andamento", tone: "info" },
  failed: { label: "Falhou", tone: "danger" },
  refused: { label: "Recusada pela IA", tone: "warning" },
};

export default async function CostsPage() {
  const auth = await requireAuth();
  if (!can(auth.role, "costs.view")) return <EmptyState title="Acesso restrito" description="Custos são visíveis para administradores." />;
  const s = await getCostSummary(auth);
  return (
    <>
      <PageHeader
        title="Custos e consumo"
        description={`Mês ${s.month}. Custos calculados com os tokens informados pelo provedor e a tarifa cadastrada vigente. Execuções atendidas por um modelo sem tarifa aparecem como "sem tarifa"; para o teto, contam pela tarifa do modelo configurado (estimativa).`}
      />
      <StatGroup className="lg:grid-cols-5">
        <Stat label="Custo calculado" value={formatUsd(s.totals.costUsd, 4)} />
        <Stat label="Execuções" value={s.totals.runs} hint={`${s.totals.failed} sem sucesso`} />
        <Stat label="Tokens de entrada" value={formatNumber(s.totals.inputTokens)} />
        <Stat label="Tokens de saída" value={formatNumber(s.totals.outputTokens)} />
        <Stat
          label="Sem tarifa"
          value={s.totals.unpricedRuns}
          tone={s.totals.unpricedRuns ? "warning" : undefined}
          hint={[s.totals.unpricedEstimateUsd ? `≈ ${formatUsd(s.totals.unpricedEstimateUsd, 4)} estimado` : "", s.totals.demoRuns ? `${s.totals.demoRuns} execução(ões) demo sem custo` : ""].filter(Boolean).join(" · ") || undefined}
        />
      </StatGroup>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Por cliente" description="Teto mensal configurável na página de cada cliente." />
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th className="text-right">Execuções</Th>
                <Th className="text-right">Custo</Th>
                <Th className="text-right">Teto</Th>
              </tr>
            </thead>
            <tbody>
              {s.byClient.map((c) => {
                const pct = c.limitUsd ? (c.budgetSpendUsd / c.limitUsd) * 100 : null;
                return (
                  <tr key={c.clientId}>
                    <Td>
                      <Link href={`/clientes/${c.clientId}`} className="text-ink-100 underline-offset-4 hover:underline">
                        {c.clientName}
                      </Link>
                    </Td>
                    <Td className="text-right">{c.runs}</Td>
                    <Td className="text-right tabular text-[12.5px]">
                      {formatUsd(c.costUsd, 4)}
                      {c.budgetSpendUsd > c.costUsd ? <span className="block text-[11.5px] text-amber-300">+ {formatUsd(c.budgetSpendUsd - c.costUsd, 4)} estimado</span> : null}
                    </Td>
                    <Td className="text-right">
                      {c.limitUsd === null ? (
                        <span className="text-ink-400">sem teto</span>
                      ) : (
                        <span className={pct !== null && c.alertPct !== null && pct >= c.alertPct ? "text-amber-300" : ""}>
                          {formatUsd(c.limitUsd)} ({pct?.toFixed(0)}%){c.hardStop ? "" : " · só alerta"}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Por skill" />
          <Table>
            <thead>
              <tr>
                <Th>Skill</Th>
                <Th className="text-right">Execuções</Th>
                <Th className="text-right">Custo</Th>
                <Th className="text-right">Duração média</Th>
              </tr>
            </thead>
            <tbody>
              {s.bySkill.length === 0 ? (
                <tr>
                  <Td className="text-ink-400">Sem execuções no mês.</Td>
                </tr>
              ) : (
                s.bySkill.map((k) => (
                  <tr key={k.skillId}>
                    <Td>
                      <div>{k.skillName}</div>
                      <div className="font-mono text-[11px] text-ink-400">{k.skillId}</div>
                    </Td>
                    <Td className="text-right">{k.runs}</Td>
                    <Td className="text-right tabular text-[12.5px]">{formatUsd(k.costUsd, 4)}</Td>
                    <Td className="text-right">{k.avgDurationMs ? `${(k.avgDurationMs / 1000).toFixed(1)} s` : "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Execuções recentes" />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Cliente</Th>
              <Th>Skill</Th>
              <Th>Modelo</Th>
              <Th>Status</Th>
              <Th className="text-right">Tokens (entrada/saída)</Th>
              <Th className="text-right">Custo</Th>
            </tr>
          </thead>
          <tbody>
            {s.recent.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap tabular text-[12px] text-ink-400">{formatDateTime(r.createdAt)}</Td>
                <Td>{r.clientName ?? "—"}</Td>
                <Td className="text-xs">
                  <span title={r.skillId}>{r.skillName}</span>
                </Td>
                <Td className="whitespace-nowrap tabular text-[12px] text-ink-300">{r.model}</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Dot tone={RUN_STATUS[r.status]?.tone ?? "danger"} title={r.errorMessage ?? undefined}>
                      {RUN_STATUS[r.status]?.label ?? r.status}
                    </Dot>
                    {r.isDemo ? <Badge tone="warning">demo</Badge> : null}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-right tabular text-[12.5px]">
                  {formatNumber(r.inputTokens)} / {formatNumber(r.outputTokens)}
                </Td>
                <Td className="whitespace-nowrap text-right tabular text-[12.5px]">{r.isDemo ? "—" : r.costUsd === null ? <span className="text-amber-300">sem tarifa{r.estimatedCostUsd !== null ? ` (≈ ${formatUsd(r.estimatedCostUsd, 4)})` : ""}</span> : formatUsd(r.costUsd, 4)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Tarifas cadastradas" description="A tarifa vigente é a mais recente de cada provedor/modelo. Margem por cliente depende do cadastro de receitas (fase 3)." />
        <Table>
          <thead>
            <tr>
              <Th>Provedor / modelo</Th>
              <Th className="text-right">Entrada</Th>
              <Th className="text-right">Saída</Th>
              <Th className="text-right">Cache (leitura/escrita)</Th>
              <Th>Vigência</Th>
              <Th>Fonte</Th>
            </tr>
          </thead>
          <tbody>
            {s.prices.map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">
                  <span className="text-ink-400">{p.provider} /</span> <span className="tabular text-[12.5px] text-ink-100">{p.model}</span>
                </Td>
                <Td className="whitespace-nowrap text-right tabular text-[12.5px]">{formatUsd(Number(p.input))}</Td>
                <Td className="whitespace-nowrap text-right tabular text-[12.5px]">{formatUsd(Number(p.output))}</Td>
                <Td className="whitespace-nowrap text-right tabular text-[12.5px]">
                  {p.cacheRead ? formatUsd(Number(p.cacheRead)) : "—"} / {p.cacheWrite ? formatUsd(Number(p.cacheWrite)) : "—"}
                </Td>
                <Td className="whitespace-nowrap tabular text-[12px] text-ink-400">{formatDateTime(p.effectiveFrom)}</Td>
                <Td className="min-w-[260px] max-w-md text-[12px] leading-relaxed text-ink-400">
                  <span className="line-clamp-2" title={p.source}>
                    {p.source}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {can(auth.role, "costs.manage") ? <PriceForm /> : null}
      </Card>
    </>
  );
}
