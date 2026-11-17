import type { MediaAsset } from "@/server/services/media";
import { MEDIA_KIND_LABELS } from "@/server/services/media";
import type { ActionState } from "@/server/actions";
import { Badge, EmptyState, formatBytes, formatDateTime } from "./ui";
import { InlineAction } from "./inline-action";

export function MediaGrid({
  items,
  showClient = false,
  deleteAction,
}: {
  items: MediaAsset[];
  showClient?: boolean;
  deleteAction?: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  if (items.length === 0)
    return <EmptyState title="Nenhum arquivo" description="Envie fotos, logotipos e documentos do cliente." />;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((m) => (
        <li key={m.id} className="group overflow-hidden rounded-md border border-line bg-surface">
          <a href={`/api/media/${m.id}`} target="_blank" rel="noreferrer" className="block aspect-square bg-surface">
            {m.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${m.id}`}
                alt={m.altText || m.filename}
                loading="lazy"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="tabular flex h-full items-center justify-center text-sm text-muted">
                {m.mimeType.split("/")[1]}
              </div>
            )}
          </a>
          <div className="space-y-1 p-2.5">
            <div className="truncate text-sm font-medium text-fg" title={m.filename}>
              {m.filename}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Badge tone={m.kind === "logo" ? "accent" : "neutral"}>{MEDIA_KIND_LABELS[m.kind]}</Badge>
              {showClient ? <span className="truncate text-xs text-muted">{m.clientName}</span> : null}
            </div>
            <div className="text-xs text-muted">
              {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
              {formatBytes(m.sizeBytes)} · {formatDateTime(m.createdAt)}
            </div>
            {m.licenseNote ? (
              <div className="truncate text-xs text-muted" title={m.licenseNote}>
                Origem: {m.licenseNote}
              </div>
            ) : null}
            {deleteAction ? (
              <InlineAction
                action={deleteAction}
                fields={{ mediaId: m.id }}
                label="Remover"
                pendingText="Removendo..."
                tone="danger"
                confirmMessage={`Remover "${m.filename}" da biblioteca? Versões que já usam o arquivo continuam com ele.`}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
