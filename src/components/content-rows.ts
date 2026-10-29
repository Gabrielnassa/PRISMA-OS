import type { ContentListItem } from "@/server/services/content";
import type { ContentRow } from "./content-table";
import { formatDateTime, formatRelative } from "./ui";

/** Só o que a tabela de conteúdos precisa (vai para o navegador). */
export function toContentRows(items: ContentListItem[]): ContentRow[] {
  return items.map((c) => ({
    id: c.id,
    title: c.title,
    clientName: c.clientName,
    format: c.format,
    status: c.status,
    currentVersion: c.currentVersion,
    hasApprovedVersion: c.hasApprovedVersion,
    updatedLabel: formatRelative(c.updatedAt),
    updatedTitle: formatDateTime(c.updatedAt),
  }));
}
