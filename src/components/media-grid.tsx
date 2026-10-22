import type { MediaAsset } from "@/server/services/media";
import { MEDIA_KIND_LABELS } from "@/server/services/media";
import { Badge, EmptyState, formatBytes, formatDateTime } from "./ui";

export function MediaGrid({ items, showClient = false, deleteAction }: { items: MediaAsset[]; showClient?: boolean; deleteAction?: (form: FormData) => Promise<void> }) {
  if (items.length === 0) return <EmptyState title="Nenhum arquivo" description="Envie fotos reais, logotipos e documentos do cliente." />;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((m) => (
        <li key={m.id} className="group overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
          <a href={`/api/media/${m.id}`} target="_blank" rel="noreferrer" className="block aspect-square bg-ink-850">
            {m.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${m.id}`} alt={m.altText || m.filename} loading="lazy" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs uppercase text-ink-400">{m.mimeType.split("/")[1]}</div>
            )}
          </a>
          <div className="space-y-1 p-2.5">
            <div className="truncate text-xs font-medium text-ink-100" title={m.filename}>
              {m.filename}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Badge tone={m.kind === "logo" ? "accent" : "neutral"}>{MEDIA_KIND_LABELS[m.kind]}</Badge>
              {showClient ? <span className="truncate text-[11px] text-ink-400">{m.clientName}</span> : null}
            </div>
            <div className="text-[11px] text-ink-500">
              {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
              {formatBytes(m.sizeBytes)} · {formatDateTime(m.createdAt)}
            </div>
            {m.licenseNote ? <div className="truncate text-[11px] text-ink-400" title={m.licenseNote}>Origem: {m.licenseNote}</div> : null}
            {deleteAction ? (
              <form action={deleteAction}>
                <input type="hidden" name="mediaId" value={m.id} />
                <button type="submit" className="text-[11px] text-red-300 hover:underline">
                  Remover
                </button>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
