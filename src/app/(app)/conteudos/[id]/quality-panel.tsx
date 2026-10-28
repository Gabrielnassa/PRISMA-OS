import type { QualityReport } from "@/server/quality/checks";
import { FIELD_LABELS } from "@/lib/content/document";
import { Badge, Card, CardHeader, cx } from "@/components/ui";

const SEVERITY = {
  critical: { label: "Crítico", tone: "danger" as const },
  warning: { label: "Atenção", tone: "warning" as const },
  info: { label: "Info", tone: "neutral" as const },
};

export function QualityPanel({ report, live = false }: { report: QualityReport | null; live?: boolean }) {
  if (!report) {
    return (
      <Card>
        <CardHeader title="Controle de qualidade" description="Ainda não executado para esta versão." />
      </Card>
    );
  }
  const ordered = [...report.items].sort((a, b) => ["critical", "warning", "info"].indexOf(a.severity) - ["critical", "warning", "info"].indexOf(b.severity));
  return (
    <Card>
      <CardHeader
        title="Controle de qualidade"
        description={live ? "Prévia das alterações não salvas" : `Versão salva · ${report.checkerVersion}`}
        actions={report.passed ? <Badge tone="success">Sem críticos</Badge> : <Badge tone="danger">{report.criticalCount} crítico(s)</Badge>}
      />
      <ul className="max-h-[420px] divide-y divide-ink-800 overflow-y-auto">
        {ordered.map((item, i) => (
          <li key={`${item.id}-${i}`} className="flex gap-3 px-5 py-2.5">
            <Badge tone={SEVERITY[item.severity].tone} className="mt-0.5 shrink-0">
              {SEVERITY[item.severity].label}
            </Badge>
            <div className="min-w-0 text-sm">
              <p className={cx(item.severity === "critical" ? "text-ink-50" : "text-ink-200")}>{item.message}</p>
              {item.suggestion ? <p className="mt-0.5 text-xs text-ink-400">{item.suggestion}</p> : null}
              {item.slideIndex !== undefined || item.field ? (
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {item.slideIndex !== undefined ? `Lâmina ${item.slideIndex + 1}` : ""}
                  {item.field ? ` · ${FIELD_LABELS[item.field]}` : ""}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
