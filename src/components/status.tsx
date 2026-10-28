import { STATUS_LABELS, STATUS_TONE, type ContentStatus } from "@/lib/content/status";
import { Badge, Dot } from "./ui";

export function StatusBadge({ status }: { status: ContentStatus }) {
  return <Dot tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Dot>;
}

export function SourceBadge({ source }: { source: string }) {
  if (source === "demo") return <Badge tone="warning" title="Gerado sem IA pelo provedor de demonstração">Demonstração</Badge>;
  if (source === "ai") return <Badge tone="accent">IA</Badge>;
  return <Badge>Manual</Badge>;
}
