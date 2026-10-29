import sharp from "sharp";
import { z } from "zod";
import { many, maybeOne, one, systemCtx, userCtx, withTx, type Queryable } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan } from "../authz/permissions";
import { ConflictError, IntegrationError, NotFoundError, ValidationError } from "../errors";
import { env } from "../env";
import { storage } from "../storage";
import { sign, verifySignature } from "../crypto/secrets";
import { enqueueJob, type Job } from "../jobs/queue";
import { audit, userActor } from "./audit";
import { getVersionDocument } from "./content";
import { renderStoredDocument } from "./render-access";
import { svgToPng } from "../render/engine";
import { publicBase } from "./integration-apps";
import { accountAccess, markNeedsReconnect, NETWORK_LABELS, type Network } from "./social-accounts";
import { emitEvent } from "./webhooks";
import { notifyPublicationFailed } from "./notifications";
import { facebookMetrics, instagramMetrics, publishFacebook, publishInstagram, type FbState, type IgState, type PostMetrics } from "../integrations/social/meta";
import { tiktokPublishPhotos, tiktokPublishVideo, waitTikTok } from "../integrations/social/tiktok";
import { youtubeMetrics, youtubeUpload } from "../integrations/social/youtube";
import type { Aspect, ContentFormat } from "@/lib/content/document";

/**
 * Publicação nas redes. Só sai peça com versão aprovada (a versão exata que
 * foi aprovada) ou um vídeo da biblioteca escolhido por uma pessoa, sempre por
 * um pedido explícito: "publicar agora" ou um horário agendado. O envio roda
 * na fila do worker, com novas tentativas que continuam de onde pararam.
 */

export const PUBLISH_JOB = "social.publish";
export const METRICS_JOB = "social.metrics";

export type PublicationKind = "image" | "carousel" | "story" | "video";
export type PublicationStatus = "scheduled" | "publishing" | "published" | "failed" | "cancelled";

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  scheduled: "Agendada",
  publishing: "Publicando",
  published: "Publicada",
  failed: "Falhou",
  cancelled: "Cancelada",
};

export const KIND_LABELS: Record<PublicationKind, string> = { image: "Post", carousel: "Carrossel", story: "Story", video: "Vídeo" };

const FORMAT_KIND: Record<ContentFormat, PublicationKind> = { post: "image", carousel: "carousel", story: "story" };

/** O que cada rede aceita. Devolve o motivo quando não dá. */
export function compatibility(network: Network, kind: PublicationKind, aspect: Aspect | null): string | null {
  if (network === "youtube" && kind !== "video") return "O YouTube só recebe vídeos pela API.";
  if (network === "instagram" && (kind === "image" || kind === "carousel") && aspect === "9:16") return "No feed do Instagram a imagem vai de 4:5 a 1,91:1. Peças 9:16 entram como story.";
  return null;
}

/** Redes que baixam o arquivo de um endereço público (precisam de APP_URL com HTTPS). */
export function needsPublicUrl(network: Network, kind: PublicationKind): boolean {
  return network === "instagram" || (network === "tiktok" && kind !== "video");
}

export function publicUrlProblem(): string | null {
  const b = publicBase();
  if (!b.url) return "Defina APP_URL (o endereço do sistema) na configuração do servidor.";
  if (!b.https || b.local) return "Instagram e TikTok baixam as imagens do endereço do sistema, que precisa ser público e com HTTPS. Isso funciona depois de hospedar com domínio próprio.";
  return null;
}

// ---------------------------------------------------------------------------
// Links temporários para as redes baixarem os arquivos
// ---------------------------------------------------------------------------

const FILE_RE = /^(\d{1,2}\.jpg|video)$/;

export function signedFileUrl(publicationId: string, file: string, ttlSeconds = 3 * 3600): string {
  const base = publicBase().url;
  if (!base) throw new IntegrationError("APP_URL não definida.", false);
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(`${publicationId}/${file}/${exp}`);
  return `${base}/api/publico/publicacao/${publicationId}/${file}?exp=${exp}&sig=${sig}`;
}

/** Arquivo pedido pela rede durante a publicação (rota pública, conferida pela assinatura). */
export async function readSignedFile(publicationId: string, file: string, exp: string | null, sig: string | null): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!z.string().uuid().safeParse(publicationId).success || !FILE_RE.test(file) || !exp || !sig || !/^\d{1,12}$/.test(exp)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  if (!verifySignature(`${publicationId}/${file}/${exp}`, sig)) return null;
  const row = await withTx(systemCtx("publication.file"), (tx) =>
    maybeOne<{ status: string; storage_key: string | null; mime_type: string | null }>(
      tx,
      `SELECT p.status, m.storage_key, m.mime_type FROM publications p LEFT JOIN media_assets m ON m.id = p.media_asset_id WHERE p.id = $1`,
      [publicationId],
    ),
  );
  if (!row || row.status === "cancelled") return null;
  try {
    if (file === "video") return row.storage_key ? { data: await storage().get(row.storage_key), mimeType: row.mime_type ?? "video/mp4" } : null;
    return { data: await storage().get(`publish/${publicationId}/${file}`), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Agendamento
// ---------------------------------------------------------------------------

const ScheduleSchema = z.object({
  contentId: z.string().uuid().optional(),
  mediaAssetId: z.string().uuid().optional(),
  accountIds: z.array(z.string().uuid()).min(1, "Escolha pelo menos uma conta.").max(4),
  /** "now" ou data e hora com fuso (ISO 8601). */
  when: z.string().min(3),
  caption: z.string().max(2200, "A legenda passa de 2.200 caracteres (limite do Instagram).").default(""),
  title: z.string().trim().max(100, "O título passa de 100 caracteres.").default(""),
  tiktokPrivacy: z.string().max(40).optional(),
  youtubePrivacy: z.enum(["public", "unlisted", "private"]).optional(),
  allowComments: z.boolean().default(true),
  madeForKids: z.boolean().default(false),
  tiktokConsent: z.boolean().default(false),
});
export type ScheduleInput = z.input<typeof ScheduleSchema>;

export async function schedulePublications(auth: AuthContext, raw: ScheduleInput): Promise<{ ids: string[]; scheduledAt: string }> {
  assertCan(auth.role, "social.publish");
  const parsed = ScheduleSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]!.message);
  const input = parsed.data;
  if (Boolean(input.contentId) === Boolean(input.mediaAssetId)) throw new ValidationError("Escolha uma peça aprovada ou um vídeo.");
  const when = input.when === "now" ? new Date() : new Date(input.when);
  if (Number.isNaN(when.getTime())) throw new ValidationError("Data e hora inválidas.");
  if (when.getTime() < Date.now() - 2 * 60_000) throw new ValidationError("Escolha um horário no futuro.");
  if (when.getTime() > Date.now() + 180 * 86_400_000) throw new ValidationError("Agende para no máximo 6 meses à frente.");

  return withTx(userCtx(auth.userId), async (tx) => {
    let clientId: string;
    let kind: PublicationKind;
    let aspect: Aspect | null = null;
    let versionId: string | null = null;
    let defaultTitle = "";
    if (input.contentId) {
      const item = await maybeOne<{ client_id: string; format: ContentFormat; status: string; approved_version_id: string | null; title: string }>(
        tx,
        "SELECT client_id, format, status, approved_version_id, title FROM content_items WHERE id = $1 AND organization_id = $2",
        [input.contentId, auth.organizationId],
      );
      if (!item) throw new NotFoundError("Peça não encontrada.");
      if (item.status !== "approved" || !item.approved_version_id) throw new ConflictError("Só peças aprovadas podem ser publicadas. Envie para aprovação primeiro.");
      const v = await one<{ document: { aspect: Aspect; slides: unknown[] } }>(tx, "SELECT document FROM content_versions WHERE id = $1", [item.approved_version_id]);
      clientId = item.client_id;
      kind = FORMAT_KIND[item.format];
      if (kind === "carousel" && v.document.slides.length < 2) kind = "image";
      aspect = v.document.aspect;
      versionId = item.approved_version_id;
      defaultTitle = item.title;
    } else {
      const asset = await maybeOne<{ client_id: string; mime_type: string; filename: string }>(
        tx,
        "SELECT client_id, mime_type, filename FROM media_assets WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
        [input.mediaAssetId, auth.organizationId],
      );
      if (!asset) throw new NotFoundError("Vídeo não encontrado.");
      if (!/^video\/(mp4|quicktime)$/.test(asset.mime_type)) throw new ValidationError("Escolha um vídeo MP4 ou MOV.");
      clientId = asset.client_id;
      kind = "video";
      defaultTitle = asset.filename.replace(/\.[a-z0-9]+$/i, "");
    }

    const accounts = await many<{ id: string; client_id: string; network: Network; status: string; username: string | null; display_name: string; details: { privacyOptions?: string[] } }>(
      tx,
      "SELECT id, client_id, network, status, username, display_name, details FROM social_accounts WHERE id = ANY($1::uuid[]) AND organization_id = $2",
      [input.accountIds, auth.organizationId],
    );
    if (accounts.length !== new Set(input.accountIds).size) throw new NotFoundError("Conta não encontrada. Atualize a página.");
    const problems: string[] = [];
    for (const a of accounts) {
      const name = NETWORK_LABELS[a.network];
      if (a.client_id !== clientId) problems.push(`${name}: a conta é de outro cliente.`);
      if (a.status !== "active") problems.push(`${name}: conecte a conta de novo antes de publicar.`);
      const c = compatibility(a.network, kind, aspect);
      if (c) problems.push(`${name}: ${c}`);
      if (needsPublicUrl(a.network, kind)) {
        const p = publicUrlProblem();
        if (p) problems.push(`${name}: ${p}`);
      }
      if (a.network === "tiktok") {
        if (!input.tiktokPrivacy) problems.push("TikTok: escolha quem pode ver o post.");
        else if (a.details.privacyOptions?.length && !a.details.privacyOptions.includes(input.tiktokPrivacy)) problems.push("TikTok: essa opção de privacidade não está disponível para a conta.");
        if (!input.tiktokConsent) problems.push("TikTok: confirme a declaração de uso de música da TikTok.");
      }
      if (a.network === "youtube") {
        if ((input.title || defaultTitle).trim().length < 2) problems.push("YouTube: informe o título do vídeo.");
        if (!input.youtubePrivacy) problems.push("YouTube: escolha a visibilidade do vídeo.");
      }
    }
    if (problems.length) throw new ValidationError([...new Set(problems)].join(" "));

    const ids: string[] = [];
    for (const a of accounts) {
      const options: Record<string, unknown> = { allowComments: input.allowComments };
      if (a.network === "tiktok") options.privacy = input.tiktokPrivacy;
      if (a.network === "youtube") Object.assign(options, { privacy: input.youtubePrivacy, madeForKids: input.madeForKids });
      const pub = await one<{ id: string }>(
        tx,
        `INSERT INTO publications (organization_id, client_id, content_item_id, content_version_id, media_asset_id, social_account_id, network, account_label, kind, title, caption, options, scheduled_at, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [
          auth.organizationId, clientId, input.contentId ?? null, versionId, input.mediaAssetId ?? null, a.id, a.network,
          a.username ? `@${a.username.replace(/^@/, "")}` : a.display_name, kind, (input.title || defaultTitle).slice(0, 100), input.caption, JSON.stringify(options), when.toISOString(), auth.userId,
        ],
      );
      await enqueueJob(tx, {
        organizationId: auth.organizationId,
        clientId,
        type: PUBLISH_JOB,
        payload: { publicationId: pub.id },
        idempotencyKey: `publish:${pub.id}`,
        createdBy: auth.userId,
        maxAttempts: 6,
        runAfter: when,
      });
      await audit(tx, userActor(auth), {
        organizationId: auth.organizationId,
        clientId,
        action: "publication.scheduled",
        entityType: "publication",
        entityId: pub.id,
        metadata: { network: a.network, contentId: input.contentId ?? null, mediaAssetId: input.mediaAssetId ?? null, versionId, scheduledAt: when.toISOString() },
      });
      ids.push(pub.id);
    }
    return { ids, scheduledAt: when.toISOString() };
  });
}

export async function cancelPublication(auth: AuthContext, publicationId: string): Promise<void> {
  assertCan(auth.role, "social.publish");
  if (!z.string().uuid().safeParse(publicationId).success) throw new NotFoundError("Publicação não encontrada.");
  await withTx(userCtx(auth.userId), async (tx) => {
    const p = await maybeOne<{ status: PublicationStatus; client_id: string }>(tx, "SELECT status, client_id FROM publications WHERE id = $1 AND organization_id = $2 FOR UPDATE", [publicationId, auth.organizationId]);
    if (!p) throw new NotFoundError("Publicação não encontrada.");
    if (p.status !== "scheduled" && p.status !== "failed") throw new ConflictError(p.status === "publishing" ? "A publicação já está em andamento." : "Esta publicação não pode mais ser cancelada.");
    await tx.query("UPDATE publications SET status = 'cancelled' WHERE id = $1", [publicationId]);
    await tx.query("UPDATE jobs SET status = 'cancelled', finished_at = now() WHERE organization_id = $1 AND idempotency_key LIKE $2 AND status = 'queued'", [auth.organizationId, `publish:${publicationId}%`]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId: p.client_id, action: "publication.cancelled", entityType: "publication", entityId: publicationId });
  });
}

/** Nova tentativa de uma publicação que falhou (continua do ponto em que parou). */
export async function retryPublication(auth: AuthContext, publicationId: string): Promise<void> {
  assertCan(auth.role, "social.publish");
  if (!z.string().uuid().safeParse(publicationId).success) throw new NotFoundError("Publicação não encontrada.");
  await withTx(userCtx(auth.userId), async (tx) => {
    const p = await maybeOne<{ status: PublicationStatus; client_id: string }>(tx, "SELECT status, client_id FROM publications WHERE id = $1 AND organization_id = $2 FOR UPDATE", [publicationId, auth.organizationId]);
    if (!p) throw new NotFoundError("Publicação não encontrada.");
    if (p.status !== "failed") throw new ConflictError("Só publicações que falharam podem ser tentadas de novo.");
    await tx.query("UPDATE publications SET status = 'scheduled', error = NULL, scheduled_at = now() WHERE id = $1", [publicationId]);
    await enqueueJob(tx, {
      organizationId: auth.organizationId,
      clientId: p.client_id,
      type: PUBLISH_JOB,
      payload: { publicationId },
      idempotencyKey: `publish:${publicationId}:${Date.now()}`,
      createdBy: auth.userId,
      maxAttempts: 6,
    });
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId: p.client_id, action: "publication.retried", entityType: "publication", entityId: publicationId });
  });
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export interface Publication {
  id: string;
  clientId: string;
  clientName: string;
  contentId: string | null;
  contentTitle: string | null;
  mediaAssetId: string | null;
  network: Network;
  accountLabel: string;
  kind: PublicationKind;
  title: string;
  caption: string;
  status: PublicationStatus;
  scheduledAt: string;
  publishedAt: string | null;
  externalUrl: string | null;
  error: string | null;
  metrics: PostMetrics | null;
  metricsAt: string | null;
  requestedByName: string | null;
}

export async function listPublications(auth: AuthContext, f: { clientId?: string; contentId?: string; status?: PublicationStatus; limit?: number } = {}): Promise<Publication[]> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<{
      id: string; client_id: string; client_name: string; content_item_id: string | null; content_title: string | null; media_asset_id: string | null; network: Network; account_label: string;
      kind: PublicationKind; title: string; caption: string; status: PublicationStatus; scheduled_at: Date; published_at: Date | null; external_url: string | null; error: string | null;
      metrics: PostMetrics | null; metrics_at: Date | null; requested_by_name: string | null;
    }>(
      tx,
      `SELECT p.id, p.client_id, c.name AS client_name, p.content_item_id, ci.title AS content_title, p.media_asset_id, p.network, p.account_label, p.kind, p.title, p.caption,
              p.status, p.scheduled_at, p.published_at, p.external_url, p.error, p.metrics, p.metrics_at, u.name AS requested_by_name
       FROM publications p JOIN clients c ON c.id = p.client_id LEFT JOIN content_items ci ON ci.id = p.content_item_id LEFT JOIN users u ON u.id = p.requested_by
       WHERE p.organization_id = $1 AND ($2::uuid IS NULL OR p.client_id = $2) AND ($3::uuid IS NULL OR p.content_item_id = $3) AND ($4::text IS NULL OR p.status = $4)
       ORDER BY CASE WHEN p.status IN ('scheduled', 'publishing') THEN 0 ELSE 1 END, CASE WHEN p.status IN ('scheduled', 'publishing') THEN p.scheduled_at END ASC, coalesce(p.published_at, p.updated_at) DESC
       LIMIT $5`,
      [auth.organizationId, f.clientId ?? null, f.contentId ?? null, f.status ?? null, Math.min(f.limit ?? 100, 300)],
    );
    return rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      contentId: r.content_item_id,
      contentTitle: r.content_title,
      mediaAssetId: r.media_asset_id,
      network: r.network,
      accountLabel: r.account_label,
      kind: r.kind,
      title: r.title,
      caption: r.caption,
      status: r.status,
      scheduledAt: r.scheduled_at.toISOString(),
      publishedAt: r.published_at?.toISOString() ?? null,
      externalUrl: r.external_url,
      error: r.error,
      metrics: r.metrics,
      metricsAt: r.metrics_at?.toISOString() ?? null,
      requestedByName: r.requested_by_name,
    }));
  });
}

// ---------------------------------------------------------------------------
// Execução (worker)
// ---------------------------------------------------------------------------

type PubRow = {
  id: string; organization_id: string; client_id: string; content_item_id: string | null; content_version_id: string | null; media_asset_id: string | null; social_account_id: string | null;
  network: Network; kind: PublicationKind; title: string; caption: string; options: { privacy?: string; allowComments?: boolean; madeForKids?: boolean }; status: PublicationStatus;
  provider_state: Record<string, unknown>; account_username: string | null;
};

async function saveState(id: string, state: unknown): Promise<void> {
  await withTx(systemCtx("publication.state"), (tx) => tx.query("UPDATE publications SET provider_state = $2 WHERE id = $1", [id, JSON.stringify(state)]));
}

export async function toJpeg(png: Buffer): Promise<Buffer> {
  return sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
}

/** Imagens da versão aprovada em JPEG, guardadas para as redes baixarem. */
async function prepareImages(auth: AuthContext, pub: PubRow): Promise<Buffer[]> {
  const v = await getVersionDocument(auth, pub.content_item_id!, pub.content_version_id!);
  if (!v.isApproved) throw new IntegrationError("A versão agendada não é mais a aprovada (a peça mudou). Aprove de novo e reagende.", false, { providerCode: "not_approved" });
  const slides = await renderStoredDocument(auth, pub.content_item_id!, v.document);
  const jpgs: Buffer[] = [];
  for (let i = 0; i < slides.length; i++) {
    const jpg = await toJpeg(svgToPng(slides[i]!.svg, slides[i]!.width));
    await storage().put(`publish/${pub.id}/${i + 1}.jpg`, jpg);
    jpgs.push(jpg);
  }
  return pub.kind === "story" || pub.kind === "image" ? jpgs.slice(0, 1) : jpgs.slice(0, 10);
}

async function loadVideo(tx: Queryable, assetId: string): Promise<{ data: Buffer; mimeType: string; filename: string }> {
  const a = await maybeOne<{ storage_key: string; mime_type: string; filename: string }>(tx, "SELECT storage_key, mime_type, filename FROM media_assets WHERE id = $1 AND deleted_at IS NULL", [assetId]);
  if (!a) throw new IntegrationError("O vídeo foi removido da biblioteca.", false, { providerCode: "video_missing" });
  return { data: await storage().get(a.storage_key), mimeType: a.mime_type, filename: a.filename };
}

export async function handlePublish(job: Job, auth: AuthContext): Promise<Record<string, unknown>> {
  const id = String(job.payload.publicationId ?? "");
  const pub = await withTx(systemCtx("publication.start"), async (tx) => {
    const row = await maybeOne<PubRow>(
      tx,
      `SELECT p.id, p.organization_id, p.client_id, p.content_item_id, p.content_version_id, p.media_asset_id, p.social_account_id, p.network, p.kind, p.title, p.caption,
              p.options, p.status, p.provider_state, a.username AS account_username
       FROM publications p LEFT JOIN social_accounts a ON a.id = p.social_account_id WHERE p.id = $1 FOR UPDATE OF p`,
      [id],
    );
    if (!row || row.status === "cancelled" || row.status === "published") return null;
    await tx.query("UPDATE publications SET status = 'publishing' WHERE id = $1", [id]);
    return row;
  });
  if (!pub) return { skipped: true };
  try {
    if (!pub.social_account_id) throw new IntegrationError("A conta foi desconectada. Conecte de novo e reagende.", false, { providerCode: "account_missing" });
    const access = await withTx(systemCtx("publication.token"), (tx) => accountAccess(tx, pub.social_account_id!));
    const version = env().META_GRAPH_VERSION;
    const images = pub.kind === "video" ? [] : await prepareImages(auth, pub);
    const video = pub.kind === "video" ? await withTx(systemCtx("publication.video"), (tx) => loadVideo(tx, pub.media_asset_id!)) : null;
    const imageUrls = images.map((_, i) => signedFileUrl(pub.id, `${i + 1}.jpg`));
    let externalId: string;
    let externalUrl: string | null;

    if (pub.network === "instagram") {
      const r = await publishInstagram({
        igUserId: access.externalId,
        token: access.token,
        version,
        kind: pub.kind,
        imageUrls,
        videoUrl: video ? signedFileUrl(pub.id, "video") : undefined,
        caption: pub.caption,
        state: pub.provider_state as IgState,
        onState: (s) => saveState(pub.id, s),
      });
      externalId = r.mediaId;
      externalUrl = r.permalink;
    } else if (pub.network === "facebook") {
      const r = await publishFacebook({
        pageId: access.externalId,
        token: access.token,
        version,
        kind: pub.kind,
        images,
        video: video ? { data: video.data, name: video.filename, type: video.mimeType, title: pub.title } : undefined,
        caption: pub.caption,
        state: pub.provider_state as FbState,
        onState: (s) => saveState(pub.id, s),
      });
      externalId = r.postId;
      externalUrl = r.permalink;
    } else if (pub.network === "tiktok") {
      let publishId = pub.provider_state.publishId as string | undefined;
      const privacy = pub.options.privacy ?? "SELF_ONLY";
      if (!publishId) {
        publishId = video
          ? await tiktokPublishVideo({ token: access.token, video: video.data, mimeType: video.mimeType, title: pub.caption || pub.title, privacy, disableComment: pub.options.allowComments === false })
          : await tiktokPublishPhotos({ token: access.token, imageUrls, title: pub.title, description: pub.caption, privacy, disableComment: pub.options.allowComments === false });
        await saveState(pub.id, { publishId });
      }
      const s = await waitTikTok(access.token, publishId);
      if (s.status !== "PUBLISH_COMPLETE" && s.status !== "SEND_TO_USER_INBOX") {
        throw new IntegrationError("A TikTok ainda está processando. Nova tentativa em instantes.", true, { providerCode: "tiktok_processing" });
      }
      externalId = s.postIds[0] ?? publishId;
      const user = pub.account_username?.replace(/^@/, "");
      externalUrl = s.postIds[0] && user ? `https://www.tiktok.com/@${user}/${video ? "video" : "photo"}/${s.postIds[0]}` : null;
    } else {
      if (!video) throw new IntegrationError("O YouTube só recebe vídeos.", false);
      const existing = pub.provider_state.videoId as string | undefined;
      const videoId =
        existing ??
        (
          await youtubeUpload({
            token: access.token,
            video: video.data,
            mimeType: video.mimeType,
            title: pub.title,
            description: pub.caption,
            privacy: (pub.options.privacy as "public" | "unlisted" | "private") ?? "private",
            madeForKids: Boolean(pub.options.madeForKids),
          })
        ).videoId;
      await saveState(pub.id, { videoId });
      externalId = videoId;
      externalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }

    await withTx(systemCtx("publication.done"), async (tx) => {
      await tx.query("UPDATE publications SET status = 'published', published_at = now(), external_id = $2, external_url = $3, error = NULL WHERE id = $1", [pub.id, externalId, externalUrl]);
      await audit(tx, { type: "worker", userId: job.created_by }, {
        organizationId: pub.organization_id,
        clientId: pub.client_id,
        action: "publication.published",
        entityType: "publication",
        entityId: pub.id,
        metadata: { network: pub.network, externalId, externalUrl },
      });
      if (pub.network !== "tiktok") {
        await enqueueJob(tx, {
          organizationId: pub.organization_id,
          clientId: pub.client_id,
          type: METRICS_JOB,
          payload: { publicationId: pub.id },
          idempotencyKey: `metrics:${pub.id}:1d`,
          createdBy: job.created_by,
          maxAttempts: 1,
          runAfter: new Date(Date.now() + 86_400_000),
        });
      }
    });
    await emitEvent(pub.organization_id, "publication.published", { publicationId: pub.id, clientId: pub.client_id, network: pub.network, url: externalUrl, contentId: pub.content_item_id });
    for (let i = 1; i <= images.length; i++) await storage().delete(`publish/${pub.id}/${i}.jpg`).catch(() => undefined);
    return { publicationId: pub.id, externalId, externalUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof IntegrationError && err.code === "token_invalid" && pub.social_account_id) await markNeedsReconnect(pub.social_account_id, message);
    await withTx(systemCtx("publication.error"), (tx) => tx.query("UPDATE publications SET error = $2 WHERE id = $1", [pub.id, message.slice(0, 2000)]));
    throw err;
  }
}

/** Falha definitiva (tentativas esgotadas): roda na mesma transação que encerra a tarefa. */
export async function markPublicationFailed(tx: Queryable, job: Job, message: string): Promise<void> {
  const id = String(job.payload.publicationId ?? "");
  const r = await maybeOne<{ organization_id: string; client_id: string; network: Network; requested_by: string | null; account_label: string; title: string }>(
    tx,
    "UPDATE publications SET status = 'failed', error = $2 WHERE id = $1 AND status IN ('scheduled', 'publishing') RETURNING organization_id, client_id, network, requested_by, account_label, title",
    [id, message.slice(0, 2000)],
  );
  if (!r) return;
  await emitEvent(r.organization_id, "publication.failed", { publicationId: id, clientId: r.client_id, network: r.network, error: message }, tx);
  await notifyPublicationFailed(r.organization_id, { requestedBy: r.requested_by, network: NETWORK_LABELS[r.network], account: r.account_label, title: r.title, error: message });
}

async function fetchMetrics(pub: { network: Network; external_id: string; social_account_id: string }): Promise<PostMetrics> {
  const access = await withTx(systemCtx("publication.metrics"), (tx) => accountAccess(tx, pub.social_account_id));
  const version = env().META_GRAPH_VERSION;
  if (pub.network === "instagram") return instagramMetrics({ mediaId: pub.external_id, token: access.token, version });
  if (pub.network === "facebook") return facebookMetrics({ postId: pub.external_id, token: access.token, version });
  if (pub.network === "youtube") return youtubeMetrics(access.token, pub.external_id);
  throw new IntegrationError("Métricas da TikTok ainda não estão disponíveis por aqui.", false);
}

async function storeMetrics(id: string, network: Network, externalId: string | null, accountId: string | null): Promise<PostMetrics> {
  if (!externalId || !accountId) throw new ConflictError("Publicação sem post ou conta para consultar.");
  const m = await fetchMetrics({ network, external_id: externalId, social_account_id: accountId });
  await withTx(systemCtx("publication.metrics"), (tx) => tx.query("UPDATE publications SET metrics = $2, metrics_at = now() WHERE id = $1", [id, JSON.stringify(m)]));
  return m;
}

export async function refreshMetrics(auth: AuthContext, publicationId: string): Promise<PostMetrics> {
  if (!z.string().uuid().safeParse(publicationId).success) throw new NotFoundError("Publicação não encontrada.");
  const p = await withTx(userCtx(auth.userId), (tx) =>
    maybeOne<{ network: Network; external_id: string | null; social_account_id: string | null; status: string }>(
      tx,
      "SELECT network, external_id, social_account_id, status FROM publications WHERE id = $1 AND organization_id = $2",
      [publicationId, auth.organizationId],
    ),
  );
  if (!p) throw new NotFoundError("Publicação não encontrada.");
  if (p.status !== "published") throw new ConflictError("A publicação ainda não está no ar.");
  return storeMetrics(publicationId, p.network, p.external_id, p.social_account_id);
}

export async function handleMetrics(job: Job): Promise<Record<string, unknown>> {
  const id = String(job.payload.publicationId ?? "");
  const p = await withTx(systemCtx("publication.metrics"), (tx) =>
    maybeOne<{ network: Network; external_id: string | null; social_account_id: string | null; status: string }>(tx, "SELECT network, external_id, social_account_id, status FROM publications WHERE id = $1", [id]),
  );
  if (!p || p.status !== "published") return { skipped: true };
  return { ...(await storeMetrics(id, p.network, p.external_id, p.social_account_id)) };
}
