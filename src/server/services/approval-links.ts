import { z } from "zod";
import { many, maybeOne, one, systemCtx, userCtx, withTx, type Queryable } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan } from "../authz/permissions";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { randomToken, sha256 } from "../crypto/secrets";
import { ASPECTS, ContentDocumentSchema, FORMAT_LABELS, referencedAssetIds, type ContentDocument, type ContentFormat } from "@/lib/content/document";
import { renderSlide, svgToPng } from "../render/engine";
import { audit, userActor } from "./audit";
import { documentHash } from "./content";
import { loadImagesForRender } from "./media";
import { publicBase } from "./integration-apps";
import { emitEvent } from "./webhooks";
import { notifyApprovalDecided } from "./notifications";

/**
 * Aprovação pelo cliente sem login. Dois tipos de link, os dois por 14 dias:
 * - de um pedido: o cliente vê exatamente a versão enviada e decide;
 * - do mês (do cliente): mostra tudo o que estiver aguardando aprovação desse
 *   cliente enquanto o link valer, e o cliente decide peça por peça.
 * A decisão leva o nome de quem respondeu e confere o hash da versão, como a
 * aprovação feita pela equipe.
 */

const LINK_DAYS = 14;
const linkUrl = (token: string) => `${publicBase().url ?? ""}/aprovar/${token}`;

export async function createApprovalLink(auth: AuthContext, approvalId: string): Promise<{ url: string; expiresAt: string; clientName: string; title: string }> {
  assertCan(auth.role, "approval.share");
  if (!z.string().uuid().safeParse(approvalId).success) throw new NotFoundError("Pedido de aprovação não encontrado.");
  if (!publicBase().url) throw new ValidationError("Defina APP_URL (o endereço do sistema) para gerar links.");
  const token = randomToken(24);
  return withTx(userCtx(auth.userId), async (tx) => {
    const a = await maybeOne<{ client_id: string; content_item_id: string; status: string; client_name: string; title: string }>(
      tx,
      `SELECT a.client_id, a.content_item_id, a.status, c.name AS client_name, ci.title FROM approvals a JOIN clients c ON c.id = a.client_id JOIN content_items ci ON ci.id = a.content_item_id
       WHERE a.id = $1 AND a.organization_id = $2`,
      [approvalId, auth.organizationId],
    );
    if (!a) throw new NotFoundError("Pedido de aprovação não encontrado.");
    if (a.status !== "pending") throw new ConflictError("Este pedido já foi decidido. Envie a versão atual para aprovação de novo.");
    const r = await one<{ expires_at: Date }>(
      tx,
      `INSERT INTO approval_links (organization_id, client_id, content_item_id, approval_id, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6), $7) RETURNING expires_at`,
      [auth.organizationId, a.client_id, a.content_item_id, approvalId, sha256(token), LINK_DAYS, auth.userId],
    );
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId: a.client_id, action: "approval.link_created", entityType: "approval", entityId: approvalId });
    return { url: linkUrl(token), expiresAt: r.expires_at.toISOString(), clientName: a.client_name, title: a.title };
  });
}

/** Link do mês: tudo o que estiver aguardando aprovação deste cliente. */
export async function createClientApprovalLink(auth: AuthContext, clientId: string): Promise<{ url: string; expiresAt: string; clientName: string; pending: number }> {
  assertCan(auth.role, "approval.share");
  if (!z.string().uuid().safeParse(clientId).success) throw new NotFoundError("Cliente não encontrado.");
  if (!publicBase().url) throw new ValidationError("Defina APP_URL (o endereço do sistema) para gerar links.");
  const token = randomToken(24);
  return withTx(userCtx(auth.userId), async (tx) => {
    const c = await maybeOne<{ name: string; pending: number }>(
      tx,
      "SELECT name, (SELECT count(*)::int FROM approvals a WHERE a.client_id = c.id AND a.status = 'pending') AS pending FROM clients c WHERE id = $1 AND organization_id = $2",
      [clientId, auth.organizationId],
    );
    if (!c) throw new NotFoundError("Cliente não encontrado.");
    if (c.pending === 0) throw new ConflictError("Nada deste cliente está aguardando aprovação. Envie as peças para aprovação primeiro.");
    const r = await one<{ expires_at: Date }>(
      tx,
      `INSERT INTO approval_links (organization_id, client_id, scope, token_hash, expires_at, created_by)
       VALUES ($1, $2, 'client', $3, now() + make_interval(days => $4), $5) RETURNING expires_at`,
      [auth.organizationId, clientId, sha256(token), LINK_DAYS, auth.userId],
    );
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId, action: "approval.client_link_created", entityType: "client", entityId: clientId, metadata: { pending: c.pending } });
    return { url: linkUrl(token), expiresAt: r.expires_at.toISOString(), clientName: c.name, pending: c.pending };
  });
}

export interface PublicApprovalItem {
  approvalId: string;
  title: string;
  format: string;
  versionNumber: number;
  slideCount: number;
  aspect: { width: number; height: number };
  caption: string;
  hashtags: string[];
  alts: string[];
  requestNote: string;
  status: "pending" | "approved" | "rejected" | "superseded" | "cancelled";
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface PublicApproval {
  scope: "single" | "client";
  organizationName: string;
  clientName: string;
  expiresAt: string;
  items: PublicApprovalItem[];
}

type LinkRow = {
  link_id: string; organization_id: string; client_id: string; scope: "single" | "client"; approval_id: string | null; content_item_id: string | null;
  expired: boolean; revoked: boolean; expires_at: Date; client_name: string; org_name: string; created_at: Date;
};

async function loadLink(token: string): Promise<LinkRow | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return withTx(systemCtx("approval_link.read"), (tx) =>
    maybeOne<LinkRow>(
      tx,
      `SELECT l.id AS link_id, l.organization_id, l.client_id, l.scope, l.approval_id, l.content_item_id, l.expires_at < now() AS expired, l.revoked_at IS NOT NULL AS revoked,
              l.expires_at, l.created_at, c.name AS client_name, o.name AS org_name
       FROM approval_links l JOIN clients c ON c.id = l.client_id JOIN organizations o ON o.id = l.organization_id
       WHERE l.token_hash = $1 AND c.status <> 'archived'`,
      [sha256(token)],
    ),
  );
}

type ApprovalRow = {
  id: string; status: PublicApprovalItem["status"]; client_id: string; content_item_id: string; content_version_id: string; document: unknown; document_hash: string;
  version_number: number; request_note: string; decided_by_name: string | null; team_name: string | null; decided_at: Date | null; decision_note: string | null;
  title: string; format: ContentFormat;
};

const APPROVAL_SELECT = `SELECT a.id, a.status, a.client_id, a.content_item_id, a.content_version_id, v.document, a.document_hash, v.version_number, a.request_note,
  a.decided_by_name, u.name AS team_name, a.decided_at, a.decision_note, ci.title, ci.format
  FROM approvals a JOIN content_versions v ON v.id = a.content_version_id JOIN content_items ci ON ci.id = a.content_item_id LEFT JOIN users u ON u.id = a.decided_by`;

function toItem(r: ApprovalRow): PublicApprovalItem {
  const doc = ContentDocumentSchema.parse(r.document);
  return {
    approvalId: r.id,
    title: r.title,
    format: FORMAT_LABELS[r.format],
    versionNumber: r.version_number,
    slideCount: doc.slides.length,
    aspect: ASPECTS[doc.aspect],
    caption: doc.caption,
    hashtags: doc.hashtags,
    alts: doc.slides.map((s) => s.alt),
    requestNote: r.request_note,
    status: r.status,
    decidedByName: r.decided_by_name ?? r.team_name,
    decidedAt: r.decided_at?.toISOString() ?? null,
    decisionNote: r.decision_note,
  };
}

/** Pedido de aprovação dentro do alcance do link (o do pedido ou um do cliente do link). */
async function approvalInScope(tx: Queryable, link: LinkRow, approvalId: string | null | undefined): Promise<ApprovalRow | null> {
  const id = link.scope === "single" ? link.approval_id : approvalId;
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return maybeOne<ApprovalRow>(tx, `${APPROVAL_SELECT} WHERE a.id = $1 AND a.client_id = $2`, [id, link.client_id]);
}

/** Dados da página pública. `null` quando o link não existe, expirou ou foi revogado. */
export async function getPublicApproval(token: string): Promise<PublicApproval | null> {
  const link = await loadLink(token);
  if (!link || link.revoked) return null;
  const rows = await withTx(systemCtx("approval_link.view"), async (tx) => {
    if (link.scope === "single") {
      const r = await approvalInScope(tx, link, null);
      return r ? [r] : [];
    }
    // Pendentes primeiro; depois o que foi decidido desde que o link foi criado.
    return many<ApprovalRow>(
      tx,
      `${APPROVAL_SELECT} WHERE a.client_id = $1 AND (a.status = 'pending' OR (a.status IN ('approved', 'rejected') AND a.decided_at >= $2))
       ORDER BY (a.status = 'pending') DESC, a.requested_at LIMIT 60`,
      [link.client_id, link.created_at],
    );
  });
  const items = rows.map(toItem);
  if (link.expired && (link.scope === "client" || items.some((i) => i.status === "pending"))) return null;
  await withTx(systemCtx("approval_link.opened"), (tx) => tx.query("UPDATE approval_links SET opened_at = coalesce(opened_at, now()) WHERE id = $1", [link.link_id]));
  return { scope: link.scope, organizationName: link.org_name, clientName: link.client_name, expiresAt: link.expires_at.toISOString(), items };
}

/** PNG de uma lâmina da versão enviada (só com o link válido e dentro do alcance dele). */
export async function renderPublicSlide(token: string, index: number, approvalId?: string | null): Promise<Buffer | null> {
  const link = await loadLink(token);
  if (!link || link.revoked || link.expired) return null;
  const r = await withTx(systemCtx("approval_link.render"), (tx) => approvalInScope(tx, link, approvalId));
  if (!r) return null;
  const doc: ContentDocument = ContentDocumentSchema.parse(r.document);
  if (!Number.isInteger(index) || index < 0 || index >= doc.slides.length) return null;
  const images = await withTx(systemCtx("approval_link.render"), (tx) => loadImagesForRender(tx, r.client_id, referencedAssetIds(doc)));
  const slide = await renderSlide(doc, index, { images });
  return svgToPng(slide.svg, Math.min(slide.width, 1080));
}

const DecisionSchema = z.object({
  approvalId: z.string().uuid().optional(),
  decision: z.enum(["approved", "rejected"]),
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  note: z.string().trim().max(2000).default(""),
});

export async function decideByLink(token: string, raw: { approvalId?: string; decision: string; name: string; note?: string }): Promise<{ status: "approved" | "rejected" }> {
  const parsed = DecisionSchema.safeParse({ ...raw, approvalId: raw.approvalId || undefined });
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]!.message, { [String(parsed.error.issues[0]!.path[0])]: parsed.error.issues[0]!.message });
  const { decision, name, note } = parsed.data;
  if (decision === "rejected" && note.length < 3) throw new ValidationError("Conte o que precisa mudar para a equipe ajustar.", { note: "Explique o ajuste." });
  const link = await loadLink(token);
  if (!link || link.revoked || link.expired) throw new NotFoundError("Este link não vale mais. Peça um novo à agência.");
  const result = await withTx(systemCtx("approval_link.decide"), async (tx) => {
    const target = await approvalInScope(tx, link, parsed.data.approvalId);
    if (!target) throw new NotFoundError("Peça não encontrada neste link.");
    const item = await one<{ id: string; current_version_id: string | null; title: string }>(tx, "SELECT id, current_version_id, title FROM content_items WHERE id = $1 FOR UPDATE", [target.content_item_id]);
    const a = await one<{ status: string; content_version_id: string; document_hash: string; requested_by: string | null }>(
      tx,
      "SELECT status, content_version_id, document_hash, requested_by FROM approvals WHERE id = $1 FOR UPDATE",
      [target.id],
    );
    if (a.status !== "pending") throw new ConflictError("Este pedido já foi respondido.");
    if (item.current_version_id !== a.content_version_id) {
      await tx.query("UPDATE approvals SET status = 'superseded' WHERE id = $1", [target.id]);
      throw new ConflictError("A agência alterou a peça depois do envio. Ela volta para você quando a nova versão for enviada.");
    }
    const v = await one<{ document: unknown; document_hash: string; version_number: number }>(tx, "SELECT document, document_hash, version_number FROM content_versions WHERE id = $1", [a.content_version_id]);
    if (documentHash(ContentDocumentSchema.parse(v.document)) !== a.document_hash || v.document_hash !== a.document_hash) {
      throw new ConflictError("A versão não confere com o pedido de aprovação. Peça um novo link à agência.");
    }
    await tx.query("UPDATE approvals SET status = $2, decided_at = now(), decided_via = 'client_link', decided_by_name = $3, decision_note = $4 WHERE id = $1", [target.id, decision, name, note]);
    if (decision === "approved") {
      await tx.query("UPDATE content_items SET status = 'approved', approved_version_id = $2 WHERE id = $1", [item.id, a.content_version_id]);
    } else {
      await tx.query("UPDATE content_items SET status = 'rejected' WHERE id = $1", [item.id]);
      await tx.query(
        `INSERT INTO client_memories (organization_id, client_id, kind, content, source) VALUES ($1, $2, 'suggestion', $3, 'approval_feedback')`,
        [link.organization_id, link.client_id, `Ajuste pedido pelo cliente (${name}) em "${item.title}" (v${v.version_number}): ${note}`.slice(0, 2000)],
      );
    }
    await audit(tx, { type: "system" }, {
      organizationId: link.organization_id,
      clientId: link.client_id,
      action: decision === "approved" ? "approval.approved" : "approval.rejected",
      entityType: "approval",
      entityId: target.id,
      metadata: { contentId: item.id, version: v.version_number, hash: a.document_hash, note, via: "client_link", name },
    });
    return { approvalId: target.id, contentId: item.id, requestedBy: a.requested_by, title: item.title };
  });
  await emitEvent(link.organization_id, "approval.decided", { approvalId: result.approvalId, contentId: result.contentId, clientId: link.client_id, decision, by: name, via: "client_link", note });
  await notifyApprovalDecided(link.organization_id, { requestedBy: result.requestedBy, contentId: result.contentId, title: result.title, clientName: link.client_name, decision, by: `${name} (cliente)`, note });
  return { status: decision };
}
