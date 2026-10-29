import { z } from "zod";
import { emitEvent } from "./webhooks";
import { many, maybeOne, one, userCtx, withTx, type Queryable } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { AppError, BudgetExceededError, ConflictError, NotFoundError, RateLimitError, ValidationError } from "../errors";
import { getProvider } from "../ai/gateway";
import { runAiSkill } from "../orchestrator";
import { OBJECTIVES, type Objective } from "@/lib/content/document";
import { EDITORIAL_FORMATS, editorialSkill, type EditorialFormat } from "../skills/editorial";
import { audit, userActor } from "./audit";
import { requireClient } from "./clients";
import { createContent } from "./content";
import { loadPackage, type ClientPackage } from "./packages";

/**
 * Linha editorial do mês: uma pauta para cada espaço do pacote do cliente.
 * A IA (ou a equipe, sem IA) propõe; a equipe edita e aprova; na aprovação, as
 * pautas viram peças na fila de criação, com fotos da biblioteca do cliente.
 * Vídeos ficam como itens a marcar quando feitos (a criação de vídeo é de uma fase seguinte).
 */

export interface EditorialItem {
  id: string;
  position: number;
  plannedDate: string | null;
  format: EditorialFormat;
  objective: Objective;
  title: string;
  brief: string;
  cta: string;
  status: "planned" | "in_production" | "done" | "skipped";
  contentItemId: string | null;
  contentStatus: string | null;
}

export interface EditorialPlan {
  id: string;
  clientId: string;
  month: string; // AAAA-MM
  status: "draft" | "approved";
  approvedAt: string | null;
  approvedByName: string | null;
  fromAi: boolean;
  items: EditorialItem[];
}

const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.");
const toDate = (month: string) => `${month}-01`;

/** Mês corrente em São Paulo (AAAA-MM). */
export function currentMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Espaços do mês a partir do pacote: formatos intercalados (para não
 * concentrar vídeos ou carrosséis numa semana) e datas espalhadas em dias úteis.
 */
export function planSlots(pkg: Pick<ClientPackage, "posts" | "carousels" | "stories" | "videos">, month: string): Array<{ format: EditorialFormat; date: string }> {
  const queues: Array<[EditorialFormat, number]> = [
    ["carousel", pkg.carousels],
    ["video", pkg.videos],
    ["post", pkg.posts],
    ["story", pkg.stories],
  ];
  const total = queues.reduce((s, [, n]) => s + n, 0);
  if (total === 0) return [];
  // Distribuição proporcional: cada formato ocupa posições espaçadas ao longo do mês.
  const scored: Array<{ format: EditorialFormat; score: number }> = [];
  for (const [format, n] of queues) for (let k = 0; k < n; k++) scored.push({ format, score: (k + 0.5) / n });
  scored.sort((a, b) => a.score - b.score);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return scored.map((s, i) => {
    let day = Math.min(days, Math.max(1, Math.round(((i + 0.5) * days) / total)));
    const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (weekday === 6) day = day > 1 ? day - 1 : day + 2; // sábado → sexta
    if (weekday === 0) day = day < days ? day + 1 : day - 2; // domingo → segunda
    return { format: s.format, date: `${month}-${String(day).padStart(2, "0")}` };
  });
}

async function loadPlan(tx: Queryable, clientId: string, month: string): Promise<EditorialPlan | null> {
  const plan = await maybeOne<{ id: string; status: "draft" | "approved"; approved_at: Date | null; approver: string | null; ai_run_id: string | null }>(
    tx,
    `SELECT p.id, p.status, p.approved_at, u.name AS approver, p.ai_run_id
     FROM editorial_plans p LEFT JOIN users u ON u.id = p.approved_by
     WHERE p.client_id = $1 AND p.month = $2::date`,
    [clientId, toDate(month)],
  );
  if (!plan) return null;
  const rows = await many<{
    id: string; position: number; planned_date: Date | null; format: EditorialFormat; objective: Objective; title: string; brief: string; cta: string;
    status: EditorialItem["status"]; content_item_id: string | null; content_status: string | null;
  }>(
    tx,
    `SELECT i.id, i.position, i.planned_date, i.format, i.objective, i.title, i.brief, i.cta, i.status, i.content_item_id, c.status AS content_status
     FROM editorial_items i LEFT JOIN content_items c ON c.id = i.content_item_id
     WHERE i.plan_id = $1 ORDER BY i.position`,
    [plan.id],
  );
  return {
    id: plan.id,
    clientId,
    month,
    status: plan.status,
    approvedAt: plan.approved_at?.toISOString() ?? null,
    approvedByName: plan.approver,
    fromAi: plan.ai_run_id !== null,
    items: rows.map((r) => ({
      id: r.id,
      position: r.position,
      plannedDate: r.planned_date ? r.planned_date.toISOString().slice(0, 10) : null,
      format: r.format,
      objective: r.objective,
      title: r.title,
      brief: r.brief,
      cta: r.cta,
      status: r.status,
      contentItemId: r.content_item_id,
      contentStatus: r.content_status,
    })),
  };
}

export async function getEditorialPlan(auth: AuthContext, clientId: string, month: string): Promise<EditorialPlan | null> {
  const m = MonthSchema.parse(month);
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    return loadPlan(tx, clientId, m);
  });
}

/** Garante um rascunho vazio do mês (recusa se já aprovado). */
async function draftFor(tx: Queryable, auth: AuthContext, clientId: string, month: string): Promise<string> {
  const existing = await maybeOne<{ id: string; status: string }>(tx, "SELECT id, status FROM editorial_plans WHERE client_id = $1 AND month = $2::date FOR UPDATE", [clientId, toDate(month)]);
  if (existing?.status === "approved") throw new ConflictError("A linha editorial deste mês já foi aprovada. Edite os itens que ainda não viraram peça.");
  if (existing) return existing.id;
  const row = await one<{ id: string }>(
    tx,
    "INSERT INTO editorial_plans (organization_id, client_id, month, created_by) VALUES ($1, $2, $3::date, $4) RETURNING id",
    [auth.organizationId, clientId, toDate(month), auth.userId],
  );
  return row.id;
}

async function replaceItems(
  tx: Queryable,
  auth: AuthContext,
  clientId: string,
  planId: string,
  items: Array<{ format: EditorialFormat; date: string; objective: Objective; title: string; brief: string; cta: string }>,
) {
  await tx.query("DELETE FROM editorial_items WHERE plan_id = $1", [planId]);
  for (const [i, it] of items.entries()) {
    await tx.query(
      `INSERT INTO editorial_items (organization_id, client_id, plan_id, position, planned_date, format, objective, title, brief, cta)
       VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10)`,
      [auth.organizationId, clientId, planId, i, it.date, it.format, it.objective, it.title.slice(0, 200), it.brief.slice(0, 4000), it.cta.slice(0, 300)],
    );
  }
}

const BLANK_TITLE = "Pauta a definir";

/**
 * Propõe a linha editorial do mês. Com IA configurada, as pautas vêm do
 * planejador; sem IA (`useAi: false`), cria os espaços do pacote para a equipe
 * preencher. Substitui um rascunho existente; não mexe em linha aprovada.
 */
export async function proposeEditorialPlan(
  auth: AuthContext,
  clientId: string,
  input: { month: string; theme?: string; useAi: boolean },
): Promise<{ planId: string; items: number; isDemo: boolean }> {
  assertCan(auth.role, "content.create");
  const month = MonthSchema.parse(input.month);
  const { pkg, recent } = await withTx(userCtx(auth.userId), async (tx) => {
    const client = await requireClient(tx, auth, clientId);
    if (client.status === "archived") throw new ValidationError("Cliente arquivado não recebe linha editorial.");
    const pkg = await loadPackage(tx, clientId);
    const recent = await many<{ title: string }>(
      tx,
      `(SELECT title FROM content_items WHERE client_id = $1 ORDER BY created_at DESC LIMIT 20)
       UNION ALL
       (SELECT title FROM editorial_items WHERE client_id = $1 AND title <> $2 ORDER BY created_at DESC LIMIT 20)`,
      [clientId, BLANK_TITLE],
    );
    return { pkg, recent: [...new Set(recent.map((r) => r.title))].slice(0, 40) };
  });
  const slots = planSlots(pkg, month);
  if (slots.length === 0) throw new ValidationError("Defina o pacote mensal do cliente (quantos posts, carrosséis, stories e vídeos) antes de montar a linha editorial.");

  let items = slots.map((s) => ({ ...s, objective: "relationship" as Objective, title: BLANK_TITLE, brief: "", cta: "" }));
  let aiRunId: string | null = null;
  let isDemo = false;
  if (input.useAi) {
    if (!getProvider()) throw new ValidationError("A IA não está conectada. Use “Montar manualmente” ou conecte a chave em Integrações.");
    const out = await runAiSkill(editorialSkill, {
      auth,
      clientId,
      idempotencyKey: `editorial:${clientId}:${month}:${crypto.randomUUID()}`,
      input: { month, slots, theme: input.theme ?? "", recentTitles: recent },
    });
    aiRunId = out.runId;
    isDemo = out.isDemo;
    items = slots.map((s, i) => {
      const it = out.output.items[i];
      return it ? { ...s, objective: it.objective, title: it.title || BLANK_TITLE, brief: it.brief, cta: it.cta } : { ...s, objective: "relationship" as Objective, title: BLANK_TITLE, brief: "", cta: "" };
    });
  }
  const planId = await withTx(userCtx(auth.userId), async (tx) => {
    const id = await draftFor(tx, auth, clientId, month);
    await replaceItems(tx, auth, clientId, id, items);
    await tx.query("UPDATE editorial_plans SET ai_run_id = $2 WHERE id = $1", [id, aiRunId]);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "editorial.proposed",
      entityType: "editorial_plan",
      entityId: id,
      metadata: { month, items: items.length, ai: input.useAi, aiRunId },
    });
    return id;
  });
  return { planId, items: items.length, isDemo };
}

export const ItemUpdateSchema = z.object({
  title: z.string().trim().min(2, "Título com pelo menos 2 caracteres.").max(200),
  brief: z.string().trim().max(4000),
  cta: z.string().trim().max(300),
  objective: z.enum(OBJECTIVES),
  format: z.enum(EDITORIAL_FORMATS),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

async function lockItem(tx: Queryable, auth: AuthContext, itemId: string) {
  if (!z.string().uuid().safeParse(itemId).success) throw new NotFoundError("Pauta não encontrada.");
  const row = await maybeOne<{ id: string; client_id: string; plan_id: string; status: EditorialItem["status"]; format: EditorialFormat; month: Date; plan_status: string }>(
    tx,
    `SELECT i.id, i.client_id, i.plan_id, i.status, i.format, p.month, p.status AS plan_status
     FROM editorial_items i JOIN editorial_plans p ON p.id = i.plan_id
     WHERE i.id = $1 AND i.organization_id = $2 FOR UPDATE OF i`,
    [itemId, auth.organizationId],
  );
  if (!row) throw new NotFoundError("Pauta não encontrada.");
  return row;
}

export async function updateEditorialItem(auth: AuthContext, itemId: string, input: z.input<typeof ItemUpdateSchema>): Promise<void> {
  assertCan(auth.role, "content.create");
  const parsed = ItemUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    throw new ValidationError("Revise a pauta.", fieldErrors);
  }
  const d = parsed.data;
  await withTx(userCtx(auth.userId), async (tx) => {
    const item = await lockItem(tx, auth, itemId);
    if (item.status === "in_production" || item.status === "done") throw new ConflictError("Esta pauta já virou peça. Edite a peça em Conteúdos.");
    const month = item.month.toISOString().slice(0, 7);
    if (d.plannedDate && !d.plannedDate.startsWith(month)) throw new ValidationError("A data precisa estar no mês da linha editorial.", { plannedDate: "Fora do mês." });
    await tx.query(
      "UPDATE editorial_items SET title = $2, brief = $3, cta = $4, objective = $5, format = $6, planned_date = $7::date WHERE id = $1",
      [itemId, d.title, d.brief, d.cta, d.objective, d.format, d.plannedDate],
    );
  });
}

/** Marca um item como feito/pendente ou fora do mês (vídeos e peças feitas fora do sistema). */
export async function setEditorialItemStatus(auth: AuthContext, itemId: string, status: "planned" | "done" | "skipped"): Promise<void> {
  assertCan(auth.role, "content.create");
  await withTx(userCtx(auth.userId), async (tx) => {
    const item = await lockItem(tx, auth, itemId);
    if (item.status === "in_production" && status !== "done") throw new ConflictError("Esta pauta já virou peça; acompanhe em Conteúdos.");
    await tx.query("UPDATE editorial_items SET status = $2 WHERE id = $1", [itemId, status]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId: item.client_id, action: "editorial.item_status", entityType: "editorial_item", entityId: itemId, metadata: { status } });
  });
}

/** Escolhe fotos da biblioteca do cliente para as peças, alternando para não repetir a mesma foto. */
async function photoRotation(tx: Queryable, clientId: string): Promise<string[]> {
  const rows = await many<{ id: string }>(
    tx,
    `SELECT m.id FROM media_assets m
     WHERE m.client_id = $1 AND m.deleted_at IS NULL AND m.kind = 'image'
       AND m.mime_type IN ('image/png', 'image/jpeg', 'image/gif')
     ORDER BY (SELECT count(*) FROM content_versions v WHERE v.client_id = $1 AND v.document::text LIKE '%' || m.id::text || '%'), m.created_at DESC
     LIMIT 60`,
    [clientId],
  );
  return rows.map((r) => r.id);
}

export interface ApproveResult {
  created: number;
  pending: number;
  videos: number;
  stoppedBecause: string | null;
}

/**
 * Aprova a linha editorial e cria as peças das pautas (exceto vídeos). Pode
 * ser chamada de novo para criar as que ficaram pendentes (limite por minuto,
 * teto de custo): cada pauta usa o próprio id como chave, então nada duplica.
 */
export async function approveEditorialPlan(auth: AuthContext, planId: string): Promise<ApproveResult> {
  assertCan(auth.role, "content.approve");
  assertCan(auth.role, "content.create");
  if (!z.string().uuid().safeParse(planId).success) throw new NotFoundError("Linha editorial não encontrada.");
  const { clientId, items, photos, justApproved } = await withTx(userCtx(auth.userId), async (tx) => {
    const plan = await maybeOne<{ id: string; client_id: string; status: string }>(tx, "SELECT id, client_id, status FROM editorial_plans WHERE id = $1 AND organization_id = $2 FOR UPDATE", [planId, auth.organizationId]);
    if (!plan) throw new NotFoundError("Linha editorial não encontrada.");
    const blank = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM editorial_items WHERE plan_id = $1 AND status = 'planned' AND (title = $2 OR length(trim(brief)) < 10) AND format <> 'video'", [planId, BLANK_TITLE]);
    if (blank.n > 0) throw new ValidationError(`Complete ${blank.n === 1 ? "1 pauta" : `${blank.n} pautas`} (título e briefing com pelo menos 10 caracteres) antes de aprovar.`);
    const justApproved = plan.status === "draft";
    if (justApproved) {
      await tx.query("UPDATE editorial_plans SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1", [planId, auth.userId]);
      await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId: plan.client_id, action: "editorial.approved", entityType: "editorial_plan", entityId: planId });
    }
    const items = await many<{ id: string; format: EditorialFormat; objective: Objective; title: string; brief: string; cta: string }>(
      tx,
      "SELECT id, format, objective, title, brief, cta FROM editorial_items WHERE plan_id = $1 AND status = 'planned' ORDER BY position",
      [planId],
    );
    return { clientId: plan.client_id, items, photos: await photoRotation(tx, plan.client_id), justApproved };
  });
  if (justApproved) await emitEvent(auth.organizationId, "editorial.approved", { planId, clientId, items: items.length, by: auth.userName });

  const mode = getProvider() ? "ai" : "manual";
  let created = 0;
  let stoppedBecause: string | null = null;
  let photoCursor = 0;
  const pieces = items.filter((i) => i.format !== "video");
  for (const it of pieces) {
    const count = it.format === "carousel" ? Math.min(3, photos.length) : Math.min(1, photos.length);
    const imageAssetIds = Array.from({ length: count }, (_, k) => photos[(photoCursor + k) % photos.length]!);
    photoCursor += count;
    try {
      const r = await createContent(auth, {
        clientId,
        title: it.title,
        channel: "instagram",
        format: it.format as "post" | "carousel" | "story",
        objective: it.objective,
        briefing: { text: it.brief, cta: it.cta },
        slideCount: it.format === "carousel" ? 5 : 1,
        imageAssetIds,
        mode,
        // O id da pauta é a chave da criação: aprovar de novo não duplica a peça.
        requestId: it.id,
      });
      await withTx(userCtx(auth.userId), (tx) => tx.query("UPDATE editorial_items SET status = 'in_production', content_item_id = $2 WHERE id = $1", [it.id, r.contentId]));
      created++;
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof BudgetExceededError) {
        stoppedBecause = err.message;
        break;
      }
      if (err instanceof AppError) {
        stoppedBecause = `“${it.title}”: ${err.message}`;
        break;
      }
      throw err;
    }
  }
  return { created, pending: pieces.length - created, videos: items.length - pieces.length, stoppedBecause };
}
