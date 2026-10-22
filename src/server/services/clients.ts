import { z } from "zod";
import { many, maybeOne, one, userCtx, withTx, pgErrorCode, type Queryable } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { BrandProfileSchema, emptyBrandProfile, type BrandProfile } from "@/lib/brand";
import { slugify } from "@/lib/slug";
import { audit, userActor } from "./audit";

export interface ClientSummary {
  id: string;
  name: string;
  slug: string;
  segment: string;
  status: "active" | "paused" | "archived";
  createdAt: string;
  contentCount: number;
  pendingApprovals: number;
}

export interface ClientDetail extends ClientSummary {
  brand: BrandProfile;
  brandRevision: number;
  brandUpdatedAt: string | null;
}

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  segment: string;
  status: ClientSummary["status"];
  created_at: Date;
  content_count: number;
  pending_approvals: number;
};

function mapClient(r: ClientRow): ClientSummary {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    segment: r.segment,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    contentCount: r.content_count,
    pendingApprovals: r.pending_approvals,
  };
}

const CLIENT_SELECT = `
  SELECT c.id, c.name, c.slug, c.segment, c.status, c.created_at,
         (SELECT count(*)::int FROM content_items ci WHERE ci.client_id = c.id AND ci.status <> 'archived') AS content_count,
         (SELECT count(*)::int FROM approvals a WHERE a.client_id = c.id AND a.status = 'pending') AS pending_approvals
  FROM clients c`;

export async function listClients(auth: AuthContext, opts: { includeArchived?: boolean } = {}): Promise<ClientSummary[]> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<ClientRow>(
      tx,
      `${CLIENT_SELECT}
       WHERE c.organization_id = $1 AND ($2::boolean OR c.status <> 'archived')
       ORDER BY c.status = 'archived', lower(c.name)`,
      [auth.organizationId, opts.includeArchived ?? false],
    );
    return rows.map(mapClient);
  });
}

/**
 * Carrega o cliente garantindo que ele pertence à organização ativa e que o
 * usuário tem acesso (RLS). Inexistente e sem acesso são indistinguíveis.
 */
export async function requireClient(tx: Queryable, auth: AuthContext, clientId: string): Promise<{ id: string; name: string; status: string }> {
  if (!z.string().uuid().safeParse(clientId).success) throw new NotFoundError("Cliente não encontrado.");
  const row = await maybeOne<{ id: string; name: string; status: string }>(
    tx,
    "SELECT id, name, status FROM clients WHERE id = $1 AND organization_id = $2",
    [clientId, auth.organizationId],
  );
  if (!row) throw new NotFoundError("Cliente não encontrado.");
  return row;
}

export async function getClient(auth: AuthContext, clientId: string): Promise<ClientDetail> {
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const row = await one<ClientRow>(tx, `${CLIENT_SELECT} WHERE c.id = $1`, [clientId]);
    const brand = await loadBrandProfile(tx, clientId);
    return { ...mapClient(row), ...brand };
  });
}

export async function loadBrandProfile(
  tx: Queryable,
  clientId: string,
): Promise<{ brand: BrandProfile; brandRevision: number; brandUpdatedAt: string | null }> {
  const row = await maybeOne<{
    business: unknown;
    audience: unknown;
    voice: unknown;
    visual: unknown;
    channels: unknown;
    references_info: unknown;
    revision: number;
    updated_at: Date;
  }>(tx, "SELECT business, audience, voice, visual, channels, references_info, revision, updated_at FROM brand_profiles WHERE client_id = $1", [clientId]);
  if (!row) return { brand: emptyBrandProfile(), brandRevision: 0, brandUpdatedAt: null };
  const parsed = BrandProfileSchema.safeParse({
    business: row.business,
    audience: row.audience,
    voice: row.voice,
    visual: row.visual,
    channels: row.channels,
    references: row.references_info,
  });
  return {
    brand: parsed.success ? parsed.data : emptyBrandProfile(),
    brandRevision: row.revision,
    brandUpdatedAt: row.updated_at.toISOString(),
  };
}

export const CreateClientSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente (mínimo 2 caracteres).").max(120),
  segment: z.string().trim().max(200).default(""),
});

export async function createClient(auth: AuthContext, input: z.input<typeof CreateClientSchema>): Promise<{ id: string }> {
  assertCan(auth.role, "client.create");
  const data = CreateClientSchema.parse(input);
  return withTx(userCtx(auth.userId), async (tx) => {
    const slug = slugify(data.name);
    try {
      const client = await one<{ id: string }>(
        tx,
        `INSERT INTO clients (organization_id, name, slug, segment, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [auth.organizationId, data.name, slug, data.segment, auth.userId],
      );
      const brand = emptyBrandProfile();
      brand.business.companyName = data.name;
      brand.business.segment = data.segment;
      await tx.query(
        `INSERT INTO brand_profiles (client_id, organization_id, business, audience, voice, visual, channels, references_info, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          client.id,
          auth.organizationId,
          brand.business,
          brand.audience,
          brand.voice,
          brand.visual,
          brand.channels,
          brand.references,
          auth.userId,
        ],
      );
      await audit(tx, userActor(auth), {
        organizationId: auth.organizationId,
        clientId: client.id,
        action: "client.created",
        entityType: "client",
        entityId: client.id,
        metadata: { name: data.name },
      });
      return client;
    } catch (err) {
      if (pgErrorCode(err) === "23505") throw new ConflictError("Já existe um cliente com este nome.");
      throw err;
    }
  });
}

export const UpdateClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  segment: z.string().trim().max(200),
  status: z.enum(["active", "paused", "archived"]),
});

export async function updateClient(auth: AuthContext, clientId: string, input: z.input<typeof UpdateClientSchema>): Promise<void> {
  assertCan(auth.role, "client.update");
  const data = UpdateClientSchema.parse(input);
  await withTx(userCtx(auth.userId), async (tx) => {
    const current = await requireClient(tx, auth, clientId);
    if (data.status !== current.status && data.status === "archived") assertCan(auth.role, "client.archive");
    if (current.status === "archived" && data.status !== "archived") assertCan(auth.role, "client.archive");
    await tx.query("UPDATE clients SET name = $2, segment = $3, status = $4 WHERE id = $1", [clientId, data.name, data.segment, data.status]);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "client.updated",
      entityType: "client",
      entityId: clientId,
      metadata: { name: data.name, segment: data.segment, status: data.status, previousStatus: current.status },
    });
  });
}

const SECTIONS = ["business", "audience", "voice", "visual", "channels", "references"] as const;

export async function updateBrandProfile(
  auth: AuthContext,
  clientId: string,
  input: unknown,
  expectedRevision?: number,
): Promise<{ revision: number }> {
  assertCan(auth.role, "client.update");
  const parsed = BrandProfileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    throw new ValidationError("Revise os campos destacados do perfil de marca.", fieldErrors);
  }
  const profile = parsed.data;
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    if (profile.visual.logoAssetId) {
      const logo = await maybeOne(
        tx,
        "SELECT 1 FROM media_assets WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL AND mime_type LIKE 'image/%'",
        [profile.visual.logoAssetId, clientId],
      );
      if (!logo) throw new ValidationError("O logotipo selecionado não é uma imagem deste cliente.");
    }
    // Serializa salvamentos simultâneos do mesmo perfil: a checagem de revisão vale de fato.
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('brand_profile:' || $1::text))", [clientId]);
    const previous = await loadBrandProfile(tx, clientId);
    if (expectedRevision !== undefined && previous.brandRevision !== expectedRevision) {
      throw new ConflictError("O perfil foi alterado por outra pessoa. Recarregue a página antes de salvar.");
    }
    const changed = SECTIONS.filter((s) => JSON.stringify(previous.brand[s]) !== JSON.stringify(profile[s]));
    const row = await one<{ revision: number }>(
      tx,
      `INSERT INTO brand_profiles (client_id, organization_id, business, audience, voice, visual, channels, references_info, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (client_id) DO UPDATE SET
         business = EXCLUDED.business, audience = EXCLUDED.audience, voice = EXCLUDED.voice,
         visual = EXCLUDED.visual, channels = EXCLUDED.channels, references_info = EXCLUDED.references_info,
         updated_by = EXCLUDED.updated_by, updated_at = now(), revision = brand_profiles.revision + 1
       RETURNING revision`,
      [
        clientId,
        auth.organizationId,
        profile.business,
        profile.audience,
        profile.voice,
        profile.visual,
        profile.channels,
        profile.references,
        auth.userId,
      ],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "brand.updated",
      entityType: "brand_profile",
      entityId: clientId,
      metadata: { changedSections: changed, revision: row.revision },
    });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Memória do cliente: fatos confirmados, preferências, hipóteses e sugestões.
// ---------------------------------------------------------------------------

export const MEMORY_KINDS = ["fact", "preference", "hypothesis", "suggestion"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  fact: "Fato confirmado",
  preference: "Preferência",
  hypothesis: "Hipótese",
  suggestion: "Sugestão",
};

export interface ClientMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  source: string;
  status: "active" | "archived";
  createdAt: string;
  createdByName: string | null;
}

export async function listMemories(auth: AuthContext, clientId: string): Promise<ClientMemory[]> {
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const rows = await many<{ id: string; kind: MemoryKind; content: string; source: string; status: "active" | "archived"; created_at: Date; name: string | null }>(
      tx,
      `SELECT m.id, m.kind, m.content, m.source, m.status, m.created_at, u.name
       FROM client_memories m LEFT JOIN users u ON u.id = m.created_by
       WHERE m.client_id = $1 ORDER BY m.status, m.created_at DESC`,
      [clientId],
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      content: r.content,
      source: r.source,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      createdByName: r.name,
    }));
  });
}

export const AddMemorySchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  content: z.string().trim().min(3, "Descreva a informação (mínimo 3 caracteres).").max(2000),
});

export async function addMemory(auth: AuthContext, clientId: string, input: z.input<typeof AddMemorySchema>): Promise<void> {
  assertCan(auth.role, "memory.manage");
  const data = AddMemorySchema.parse(input);
  await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const row = await one<{ id: string }>(
      tx,
      `INSERT INTO client_memories (organization_id, client_id, kind, content, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [auth.organizationId, clientId, data.kind, data.content, auth.userId],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "memory.added",
      entityType: "client_memory",
      entityId: row.id,
      metadata: { kind: data.kind },
    });
  });
}

export async function setMemoryStatus(auth: AuthContext, clientId: string, memoryId: string, status: "active" | "archived"): Promise<void> {
  assertCan(auth.role, "memory.manage");
  await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const res = await tx.query("UPDATE client_memories SET status = $3 WHERE id = $1 AND client_id = $2", [memoryId, clientId, status]);
    if (res.rowCount === 0) throw new NotFoundError("Memória não encontrada.");
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: status === "archived" ? "memory.archived" : "memory.restored",
      entityType: "client_memory",
      entityId: memoryId,
    });
  });
}

export async function deleteMemory(auth: AuthContext, clientId: string, memoryId: string): Promise<void> {
  assertCan(auth.role, "memory.manage");
  await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const res = await tx.query("DELETE FROM client_memories WHERE id = $1 AND client_id = $2", [memoryId, clientId]);
    if (res.rowCount === 0) throw new NotFoundError("Memória não encontrada.");
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "memory.deleted",
      entityType: "client_memory",
      entityId: memoryId,
    });
  });
}
