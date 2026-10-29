import Link from "next/link";
import type { ClientMonth } from "@/server/services/month";
import { Badge, Card, CardHeader, cx } from "./ui";
import { Icon } from "./icons";

const PLAN = {
  none: { label: "Sem linha editorial", tone: "warning" },
  draft: { label: "Linha editorial em rascunho", tone: "warning" },
  approved: { label: "Linha editorial aprovada", tone: "success" },
} as const;

/**
 * O mês de cada cliente numa linha: pacote produzido × contratado, linha
 * editorial e o que está parado esperando alguém, com atalho para resolver.
 */
export function MonthBoard({ rows, month, monthName }: { rows: ClientMonth[]; month: string; monthName: string }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader title={monthName} description="Pacote, linha editorial e pendências de cada cliente" />
      <ul className="divide-y divide-ink-800">
        {rows.map((r) => {
          const pct = r.contracted ? Math.min(100, Math.round((r.produced / r.contracted) * 100)) : 0;
          const todo: Array<{ label: string; href: string; tone: "warning" | "danger" | "accent" | "neutral" }> = [];
          if (r.awaitingApproval) todo.push({ label: `${r.awaitingApproval} aguardando aprovação`, href: `/aprovacoes?cliente=${r.clientId}`, tone: "warning" });
          if (r.inReview) todo.push({ label: `${r.inReview} para revisar e enviar`, href: `/clientes/${r.clientId}?aba=conteudos`, tone: "accent" });
          if (r.generating) todo.push({ label: `${r.generating} em geração`, href: `/conteudos?cliente=${r.clientId}&status=generating`, tone: "neutral" });
          if (r.failed) todo.push({ label: `${r.failed} com falha`, href: `/conteudos?cliente=${r.clientId}&status=failed`, tone: "danger" });
          return (
            <li key={r.clientId} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)] md:items-center">
              <div className="min-w-0">
                <Link href={`/clientes/${r.clientId}?aba=editorial`} className="font-medium text-ink-50 hover:underline">
                  {r.name}
                </Link>
                <div className="mt-1">
                  <Badge tone={PLAN[r.plan].tone}>{r.contracted ? PLAN[r.plan].label : "Sem pacote definido"}</Badge>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="text-ink-400">Produzido</span>
                  <span className="tabular text-ink-100">{r.contracted ? `${r.produced} de ${r.contracted}` : r.produced}</span>
                </div>
                <div className="mt-1.5 h-[3px] rounded-full bg-ink-800">
                  <div className={cx("h-[3px] rounded-full", pct >= 100 ? "bg-emerald-400" : "bg-iris-400")} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                {todo.length === 0 ? <span className="text-[12.5px] text-ink-400">Em dia</span> : null}
                {todo.map((t) => (
                  <Link key={t.label} href={t.href} className="hover:opacity-80">
                    <Badge tone={t.tone}>{t.label}</Badge>
                  </Link>
                ))}
                {r.approvedThisMonth ? (
                  <a
                    href={`/api/clients/${r.clientId}/delivery?mes=${month}`}
                    className="inline-flex items-center gap-1 rounded-full border border-ink-600 px-2.5 text-[11.5px] font-medium leading-[22px] text-ink-100 hover:border-ink-400"
                    title="Baixar as peças aprovadas no mês"
                  >
                    <Icon.download width={12} height={12} /> Entrega ({r.approvedThisMonth})
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
