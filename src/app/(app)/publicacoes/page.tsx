import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { can } from "@/server/authz/permissions";
import { listClients } from "@/server/services/clients";
import { listMedia } from "@/server/services/media";
import { listAccounts, NETWORK_LABELS } from "@/server/services/social-accounts";
import { compatibility, listPublications, needsPublicUrl, publicUrlProblem, PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/server/services/publications";
import { Card, CardHeader, EmptyState, PageHeader, Select, buttonClass } from "@/components/ui";
import { PublicationList } from "@/components/publication-list";
import { PublishForm } from "@/components/publish-form";

export const metadata: Metadata = { title: "Publicações" };

const STATUSES = Object.keys(PUBLICATION_STATUS_LABELS) as PublicationStatus[];

export default async function PublicationsPage({ searchParams }: { searchParams: Promise<{ cliente?: string; status?: string; video?: string; enviar?: string }> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const clients = await listClients(auth);
  const clientId = clients.some((c) => c.id === sp.cliente) ? sp.cliente : undefined;
  const status = STATUSES.includes(sp.status as PublicationStatus) ? (sp.status as PublicationStatus) : undefined;
  const canPublish = can(auth.role, "social.publish");
  const items = await listPublications(auth, { clientId, status });

  const videoMode = canPublish && sp.enviar === "video";
  const videos = videoMode && clientId ? (await listMedia(auth, { clientId, kind: "video", limit: 100 })).items.filter((m) => /^video\/(mp4|quicktime)$/.test(m.mimeType)) : [];
  const video = videos.find((v) => v.id === sp.video);
  const accounts = video && clientId ? await listAccounts(auth, clientId) : [];
  const urlProblem = publicUrlProblem();

  return (
    <>
      <PageHeader
        title="Publicações"
        description="Posts agendados e publicados nas redes dos clientes"
        actions={canPublish && !videoMode ? <a href={`/publicacoes?enviar=video${clientId ? `&cliente=${clientId}` : ""}`} className={buttonClass("secondary")}>Publicar vídeo</a> : null}
      />

      {videoMode ? (
        <Card className="mb-6">
          <CardHeader title="Publicar vídeo da biblioteca" description="Reels, TikTok, YouTube e Facebook" actions={<a href="/publicacoes" className="text-[13px] text-ink-400 hover:text-ink-100">Fechar</a>} />
          <div className="space-y-5 p-5">
            <form action="/publicacoes" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="enviar" value="video" />
              <Select name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente" className="w-60" required>
                <option value="" disabled>
                  Cliente...
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {clientId ? (
                <Select name="video" defaultValue={video?.id ?? ""} aria-label="Vídeo" className="w-72" required>
                  <option value="" disabled>
                    {videos.length ? "Vídeo..." : "Nenhum vídeo MP4 ou MOV"}
                  </option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.filename}
                    </option>
                  ))}
                </Select>
              ) : null}
              <button type="submit" className={buttonClass("secondary")}>
                {clientId ? "Escolher" : "Continuar"}
              </button>
            </form>
            {video ? (
              <PublishForm
                target={{ mediaAssetId: video.id }}
                defaultCaption=""
                defaultTitle={video.filename.replace(/\.[a-z0-9]+$/i, "")}
                isVideo
                accounts={accounts.map((a) => ({
                  id: a.id,
                  network: a.network,
                  networkLabel: NETWORK_LABELS[a.network],
                  label: a.username ? `@${a.username.replace(/^@/, "")}` : a.displayName,
                  privacyOptions: Array.isArray(a.details.privacyOptions) ? (a.details.privacyOptions as string[]) : [],
                  blocked: a.status !== "active" ? "Conecte a conta de novo." : (compatibility(a.network, "video", null) ?? (needsPublicUrl(a.network, "video") && urlProblem ? "Disponível depois de hospedar com domínio e HTTPS." : null)),
                }))}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <form className="mb-6 flex flex-wrap gap-2" action="/publicacoes" aria-label="Filtros">
        <Select name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente" className="w-60">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Situação" className="w-48">
          <option value="">Todas as situações</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {PUBLICATION_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma publicação" description="Peças aprovadas têm o botão Publicar. As contas são conectadas na aba Redes de cada cliente." />
      ) : (
        <Card>
          <PublicationList items={items} canAct={canPublish} />
        </Card>
      )}
    </>
  );
}
