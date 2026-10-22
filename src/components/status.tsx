import { STATUS_LABELS, STATUS_TONE, type ContentStatus } from "@/lib/content/status";
import { Badge } from "./ui";

export function StatusBadge({ status }: { status: ContentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function SourceBadge({ source }: { source: string }) {
  if (source === "demo") return <Badge tone="warning" title="Gerado sem IA pelo provedor de demonstração">Demonstração</Badge>;
  if (source === "ai") return <Badge tone="accent">IA</Badge>;
  return <Badge>Manual</Badge>;
}
