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
        <CardHeader title="Verificação" description="Ainda não feita nesta versão." />
      </Card>
    );
  }
  const ordered = [...report.items].sort(
    (a, b) => ["critical", "warning", "info"].indexOf(a.severity) - ["critical", "warning", "info"].indexOf(b.severity),
  );
  return (
    <Card>
      <CardHeader
        title="Verificação"
        description={live ? "Alterações ainda não salvas" : "Versão salva"}
        actions={
          report.passed ? (
            <Badge tone="success">Sem críticos</Badge>
          ) : (
            <Badge tone="danger">{report.criticalCount === 1 ? "1 crítico" : `${report.criticalCount} críticos`}</Badge>
          )
        }
      />
      <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
        {ordered.map((item, i) => (
          <li key={`${item.id}-${i}`} className="flex gap-3 px-5 py-2.5">
            <Badge tone={SEVERITY[item.severity].tone} className="mt-0.5 shrink-0">
              {SEVERITY[item.severity].label}
            </Badge>
            <div className="min-w-0 text-base">
              <p className={cx(item.severity === "critical" ? "text-fg" : "text-fg")}>{item.message}</p>
              {item.suggestion ? <p className="mt-0.5 text-sm text-muted">{item.suggestion}</p> : null}
              {item.slideIndex !== undefined || item.field ? (
                <p className="mt-0.5 text-xs text-muted">
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
