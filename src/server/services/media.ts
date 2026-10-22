import crypto from "node:crypto";
import { z } from "zod";
import { many, maybeOne, one, userCtx, withTx, type Queryable } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { env } from "../env";
import { storage } from "../storage";
import { imageSize, isUnsafeSvg, jpegOrientation, sniffType } from "../media/sniff";
import { audit, userActor } from "./audit";
import { requireClient } from "./clients";

export const MEDIA_KINDS = ["image", "logo", "document", "video", "other"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  image: "Imagem",
  logo: "Logotipo",
  document: "Documento",
  video: "Vídeo",
  other: "Outro",
};

export interface MediaAsset {
  id: string;
  clientId: string;
  clientName: string;
  kind: MediaKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  tags: string[];
  licenseNote: string;
  createdAt: string;
  uploadedByName: string | null;
}

export const UploadMediaSchema = z.object({
  kind: z.enum(MEDIA_KINDS).optional(),
  altText: z.string().trim().max(500).default(""),
  licenseNote: z.string().trim().max(500).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

function safeFilename(name: string): string {
  const cleaned = name.normalize("NFC").replace(/[\\/\0<>:"|?*\u0000-\u001f]/g, "_").trim();
  return (cleaned || "arquivo").slice(0, 200);
}

export async function uploadMedia(
  auth: AuthContext,
  clientId: string,
  file: { filename: string; data: Buffer },
  meta: z.input<typeof UploadMediaSchema>,
): Promise<{ id: string; duplicate: boolean }> {
  assertCan(auth.role, "media.upload");
  const opts = UploadMediaSchema.parse(meta);
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (file.data.length === 0) throw new ValidationError("O arquivo está vazio.");
  if (file.data.length > maxBytes) throw new ValidationError(`O arquivo excede o limite de ${env().MAX_UPLOAD_MB} MB.`);
  const type = sniffType(file.data);
  if (!type) throw new ValidationError("Formato não suportado. Envie PNG, JPEG, GIF, SVG, PDF, MP4 ou MOV.");
  // O renderizador final (resvg) não decodifica WebP: a foto sumiria da peça exportada.
  if (type.mime === "image/webp") throw new ValidationError("WebP ainda não é suportado nas peças exportadas. Converta para JPEG ou PNG e envie novamente.");
  if (type.mime === "image/svg+xml" && isUnsafeSvg(file.data)) {
    throw new ValidationError("SVG recusado: contém scripts, eventos ou referências externas.");
  }
  let kind: MediaKind = opts.kind ?? (type.category === "image" ? "image" : type.category);
  if (kind === "logo" && type.category !== "image") throw new ValidationError("O logotipo precisa ser uma imagem.");
  if ((kind === "image" || kind === "logo") && type.category !== "image") kind = type.category;
  const size = type.category === "image" ? imageSize(file.data, type.mime) : null;
  const orientation = type.mime === "image/jpeg" ? jpegOrientation(file.data) : 1;
  if (type.category === "image" && !size) throw new ValidationError("Não foi possível ler as dimensões da imagem. O arquivo pode estar corrompido.");
  if (size && (size.width > 12000 || size.height > 12000)) throw new ValidationError("Imagem grande demais (máximo 12.000 px por lado).");
  const sha256 = crypto.createHash("sha256").update(file.data).digest("hex");

  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const existing = await maybeOne<{ id: string }>(
      tx,
      "SELECT id FROM media_assets WHERE client_id = $1 AND sha256 = $2 AND deleted_at IS NULL",
      [clientId, sha256],
    );
    if (existing) return { id: existing.id, duplicate: true };
    const id = crypto.randomUUID();
    const key = `org/${auth.organizationId}/client/${clientId}/${id}.${type.ext}`;
    await storage().put(key, file.data);
    try {
      await tx.query(
        `INSERT INTO media_assets (id, organization_id, client_id, kind, filename, mime_type, size_bytes, sha256, storage_key,
           width, height, alt_text, tags, license_note, uploaded_by, orientation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          id,
          auth.organizationId,
          clientId,
          kind,
          safeFilename(file.filename),
          type.mime,
          file.data.length,
          sha256,
          key,
          size?.width ?? null,
          size?.height ?? null,
          opts.altText,
          opts.tags,
          opts.licenseNote,
          auth.userId,
          orientation,
        ],
      );
      await audit(tx, userActor(auth), {
        organizationId: auth.organizationId,
        clientId,
        action: "media.uploaded",
        entityType: "media_asset",
        entityId: id,
        metadata: { filename: safeFilename(file.filename), mime: type.mime, size: file.data.length, kind },
      });
    } catch (err) {
      await storage().delete(key).catch(() => undefined);
      throw err;
    }
    return { id, duplicate: false };
  });
}

type MediaRow = {
  id: string;
  client_id: string;
  client_name: string;
  kind: MediaKind;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string;
  tags: string[];
  license_note: string;
  created_at: Date;
  uploaded_by_name: string | null;
};

function mapMedia(r: MediaRow): MediaAsset {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    kind: r.kind,
    filename: r.filename,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    width: r.width,
    height: r.height,
    altText: r.alt_text,
    tags: r.tags,
    licenseNote: r.license_note,
    createdAt: r.created_at.toISOString(),
    uploadedByName: r.uploaded_by_name,
  };
}

export interface MediaFilter {
  clientId?: string;
  kind?: MediaKind;
  search?: string;
  imagesOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function listMedia(auth: AuthContext, filter: MediaFilter = {}): Promise<{ items: MediaAsset[]; total: number }> {
  return withTx(userCtx(auth.userId), async (tx) => {
    if (filter.clientId) await requireClient(tx, auth, filter.clientId);
    const where = [
      "m.organization_id = $1",
      "m.deleted_at IS NULL",
      "($2::uuid IS NULL OR m.client_id = $2)",
      "($3::text IS NULL OR m.kind = $3)",
      "($4::text IS NULL OR m.filename ILIKE '%' || $4 || '%' OR m.alt_text ILIKE '%' || $4 || '%' OR $4 = ANY (m.tags))",
      "(NOT $5::boolean OR m.mime_type LIKE 'image/%')",
    ].join(" AND ");
    const params = [auth.organizationId, filter.clientId ?? null, filter.kind ?? null, filter.search?.trim() || null, filter.imagesOnly ?? false];
    const total = await one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM media_assets m WHERE ${where}`, params);
    const rows = await many<MediaRow>(
      tx,
      `SELECT m.id, m.client_id, c.name AS client_name, m.kind, m.filename, m.mime_type, m.size_bytes, m.width, m.height,
              m.alt_text, m.tags, m.license_note, m.created_at, u.name AS uploaded_by_name
       FROM media_assets m
       JOIN clients c ON c.id = m.client_id
       LEFT JOIN users u ON u.id = m.uploaded_by
       WHERE ${where}
       ORDER BY m.created_at DESC
       LIMIT $6 OFFSET $7`,
      [...params, Math.min(filter.limit ?? 48, 200), filter.offset ?? 0],
    );
    return { items: rows.map(mapMedia), total: total.n };
  });
}

export async function getMediaFile(auth: AuthContext, mediaId: string): Promise<{ data: Buffer; mimeType: string; filename: string }> {
  if (!z.string().uuid().safeParse(mediaId).success) throw new NotFoundError("Arquivo não encontrado.");
  const row = await withTx(userCtx(auth.userId), (tx) =>
    maybeOne<{ storage_key: string; mime_type: string; filename: string }>(
      tx,
      "SELECT storage_key, mime_type, filename FROM media_assets WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
      [mediaId, auth.organizationId],
    ),
  );
  if (!row) throw new NotFoundError("Arquivo não encontrado.");
  return { data: await storage().get(row.storage_key), mimeType: row.mime_type, filename: row.filename };
}

export async function deleteMedia(auth: AuthContext, mediaId: string): Promise<void> {
  assertCan(auth.role, "media.delete");
  await withTx(userCtx(auth.userId), async (tx) => {
    const row = await maybeOne<{ client_id: string; filename: string }>(
      tx,
      "SELECT client_id, filename FROM media_assets WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
      [mediaId, auth.organizationId],
    );
    if (!row) throw new NotFoundError("Arquivo não encontrado.");
    const usedAsLogo = await maybeOne(tx, "SELECT 1 FROM brand_profiles WHERE client_id = $1 AND visual->>'logoAssetId' = $2", [row.client_id, mediaId]);
    if (usedAsLogo) throw new ConflictError("Este arquivo é o logotipo da marca. Troque o logotipo antes de removê-lo.");
    // Exclusão lógica: versões antigas de conteúdo podem referenciar a imagem e precisam continuar reproduzíveis.
    await tx.query("UPDATE media_assets SET deleted_at = now() WHERE id = $1", [mediaId]);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: row.client_id,
      action: "media.deleted",
      entityType: "media_asset",
      entityId: mediaId,
      metadata: { filename: row.filename },
    });
  });
}

/**
 * Carrega imagens (inclusive excluídas logicamente, para reproduzir versões
 * antigas) de um cliente como data URIs para o motor de renderização.
 */
export async function loadImagesForRender(
  tx: Queryable,
  clientId: string,
  ids: string[],
): Promise<Map<string, { dataUri: string; width: number; height: number; orientation: number }>> {
  const unique = [...new Set(ids.filter((id) => z.string().uuid().safeParse(id).success))];
  const out = new Map<string, { dataUri: string; width: number; height: number; orientation: number }>();
  if (unique.length === 0) return out;
  // Somente formatos que o renderizador final decodifica (resvg: PNG, JPEG, GIF e SVG).
  const rows = await many<{ id: string; storage_key: string; mime_type: string; width: number | null; height: number | null; orientation: number }>(
    tx,
    `SELECT id, storage_key, mime_type, width, height, orientation FROM media_assets
     WHERE client_id = $1 AND id = ANY($2::uuid[]) AND mime_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/svg+xml')`,
    [clientId, unique],
  );
  for (const r of rows) {
    try {
      const data = await storage().get(r.storage_key);
      out.set(r.id, {
        dataUri: `data:${r.mime_type};base64,${data.toString("base64")}`,
        width: r.width ?? 1000,
        height: r.height ?? 1000,
        orientation: r.orientation,
      });
    } catch {
      // Arquivo ausente no armazenamento: a peça é renderizada sem a imagem e o controle de qualidade acusa.
    }
  }
  return out;
}
