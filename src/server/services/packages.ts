import { z } from "zod";
import { maybeOne, one, userCtx, withTx, type Queryable } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ValidationError } from "../errors";
import { getProvider } from "../ai/gateway";
import { audit, userActor } from "./audit";
import { requireClient } from "./clients";
import { computeCostUsd, currentPrice } from "./costs";

/**
 * Pacote mensal do cliente (quantas peças por formato) e estimativa do custo
 * de IA para produzi-lo. A estimativa usa o custo médio real por peça quando
 * já houver execuções reais; antes disso, a tarifa vigente com um consumo
 * típico. É sempre apresentada como estimativa.
 */

export interface ClientPackage {
  posts: number;
  carousels: number;
  stories: number;
  videos: number;
  notes: string;
  updatedAt: string | null;
}

const count = z.coerce.number().int("Use números inteiros.").min(0, "Não pode ser negativo.").max(200, "Máximo de 200 por mês.");
export const PackageSchema = z.object({
  posts: count,
  carousels: count,
  stories: count,
  videos: count,
  notes: z.string().trim().max(1000).default(""),
});

export const EMPTY_PACKAGE: ClientPackage = { posts: 0, carousels: 0, stories: 0, videos: 0, notes: "", updatedAt: null };

export async function loadPackage(tx: Queryable, clientId: string): Promise<ClientPackage> {
  const r = await maybeOne<{ posts: number; carousels: number; stories: number; videos: number; notes: string; updated_at: Date }>(
    tx,
    "SELECT posts, carousels, stories, videos, notes, updated_at FROM client_packages WHERE client_id = $1",
    [clientId],
  );
  return r ? { posts: r.posts, carousels: r.carousels, stories: r.stories, videos: r.videos, notes: r.notes, updatedAt: r.updated_at.toISOString() } : EMPTY_PACKAGE;
}

export async function getPackage(auth: AuthContext, clientId: string): Promise<ClientPackage> {
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    return loadPackage(tx, clientId);
  });
}

export async function setPackage(auth: AuthContext, clientId: string, input: z.input<typeof PackageSchema>): Promise<void> {
  assertCan(auth.role, "client.package");
  const parsed = PackageSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    throw new ValidationError("Revise as quantidades do pacote.", fieldErrors);
  }
  const p = parsed.data;
  await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    await tx.query(
      `INSERT INTO client_packages (client_id, organization_id, posts, carousels, stories, videos, notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (client_id) DO UPDATE SET posts = $3, carousels = $4, stories = $5, videos = $6, notes = $7, updated_by = $8, updated_at = now()`,
      [clientId, auth.organizationId, p.posts, p.carousels, p.stories, p.videos, p.notes, auth.userId],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "client.package_updated",
      entityType: "client",
      entityId: clientId,
      metadata: { posts: p.posts, carousels: p.carousels, stories: p.stories, videos: p.videos },
    });
  });
}

/** Consumo típico de uma peça (texto por IA), usado só enquanto não há execuções reais para medir. */
export const TYPICAL_PIECE_TOKENS = { inputTokens: 6000, outputTokens: 4000, cacheReadTokens: 0, cacheWriteTokens: 0 };
/** Consumo típico da linha editorial do mês (uma execução). */
export const TYPICAL_PLAN_TOKENS = { inputTokens: 8000, outputTokens: 6000, cacheReadTokens: 0, cacheWriteTokens: 0 };

export interface PackageEstimate {
  /** Peças que usam IA no mês (posts, carrosséis e stories; vídeos ainda são feitos fora). */
  aiPieces: number;
  perPieceUsd: number | null;
  planUsd: number | null;
  totalUsd: number | null;
  /** "measured": média real das peças dos últimos 90 dias; "typical": tarifa vigente × consumo típico. */
  basis: "measured" | "typical" | null;
  sampleSize: number;
  model: string | null;
  note: string;
}

/** Custo médio real por peça (todas as execuções ligadas a peças, últimos 90 dias, sem demonstração). */
async function measuredPerPiece(tx: Queryable, organizationId: string, clientId: string): Promise<{ usd: number; pieces: number } | null> {
  const scoped = async (clientOnly: boolean) =>
    one<{ total: string | null; pieces: number }>(
      tx,
      `SELECT sum(coalesce(cost_usd, estimated_cost_usd))::text AS total, count(DISTINCT content_item_id)::int AS pieces
       FROM ai_runs
       WHERE organization_id = $1 AND content_item_id IS NOT NULL AND NOT is_demo AND created_at > now() - interval '90 days'
         AND ($3::boolean IS FALSE OR client_id = $2)`,
      [organizationId, clientId, clientOnly],
    );
  // Primeiro o próprio cliente (com amostra mínima); senão, a média da agência.
  for (const clientOnly of [true, false]) {
    const r = await scoped(clientOnly);
    if (r.pieces >= (clientOnly ? 3 : 1) && r.total !== null) return { usd: Number(r.total) / r.pieces, pieces: r.pieces };
  }
  return null;
}

export async function estimatePackageCost(tx: Queryable, organizationId: string, clientId: string, pkg: ClientPackage): Promise<PackageEstimate> {
  const aiPieces = pkg.posts + pkg.carousels + pkg.stories;
  const provider = getProvider();
  const price = provider && !provider.isDemo ? await currentPrice(tx, organizationId, provider.id, provider.model) : null;
  const planUsd = price ? computeCostUsd(TYPICAL_PLAN_TOKENS, price) : null;
  const measured = await measuredPerPiece(tx, organizationId, clientId);
  const round = (v: number) => Math.round(v * 10000) / 10000;
  if (measured) {
    const total = measured.usd * aiPieces + (planUsd ?? 0);
    return {
      aiPieces,
      perPieceUsd: round(measured.usd),
      planUsd: planUsd === null ? null : round(planUsd),
      totalUsd: round(total),
      basis: "measured",
      sampleSize: measured.pieces,
      model: provider?.model ?? null,
      note: `Média de ${measured.pieces === 1 ? "1 peça" : `${measured.pieces} peças`} dos últimos 90 dias${planUsd === null ? "" : ", mais a linha editorial do mês"}.`,
    };
  }
  if (price) {
    const perPiece = computeCostUsd(TYPICAL_PIECE_TOKENS, price);
    return {
      aiPieces,
      perPieceUsd: round(perPiece),
      planUsd: round(planUsd ?? 0),
      totalUsd: round(perPiece * aiPieces + (planUsd ?? 0)),
      basis: "typical",
      sampleSize: 0,
      model: provider!.model,
      note: `Estimativa pela tarifa de ${provider!.model} com consumo típico de uma peça. Passa a usar a média do histórico depois das primeiras peças.`,
    };
  }
  return {
    aiPieces,
    perPieceUsd: null,
    planUsd: null,
    totalUsd: null,
    basis: null,
    sampleSize: 0,
    model: provider?.model ?? null,
    note: provider?.isDemo
      ? "Modo de demonstração, sem custo. Conecte a chave da IA para estimar."
      : provider
        ? `Sem tarifa cadastrada para ${provider.model}. Cadastre em Custos.`
        : "Conecte a chave da IA (Claude ou ChatGPT) para estimar o custo.",
  };
}

export interface PackageOverview {
  pkg: ClientPackage;
  estimate: PackageEstimate;
  /** Produzido no mês corrente, por formato (peças criadas; vídeos marcados como feitos na linha editorial). */
  produced: { posts: number; carousels: number; stories: number; videos: number };
  monthSpendUsd: number;
}

export async function getPackageOverview(auth: AuthContext, clientId: string): Promise<PackageOverview> {
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const pkg = await loadPackage(tx, clientId);
    const estimate = await estimatePackageCost(tx, auth.organizationId, clientId, pkg);
    const p = await one<{ posts: number; carousels: number; stories: number; videos: number; spend: string }>(
      tx,
      `SELECT count(*) FILTER (WHERE format = 'post')::int AS posts,
              count(*) FILTER (WHERE format = 'carousel')::int AS carousels,
              count(*) FILTER (WHERE format = 'story')::int AS stories,
              (SELECT count(*)::int FROM editorial_items i JOIN editorial_plans pl ON pl.id = i.plan_id
                WHERE i.client_id = $1 AND i.format = 'video' AND i.status = 'done' AND pl.month = date_trunc('month', now())::date) AS videos,
              (SELECT coalesce(sum(coalesce(cost_usd, estimated_cost_usd)), 0)::text FROM ai_runs
                WHERE client_id = $1 AND created_at >= date_trunc('month', now())) AS spend
       FROM content_items
       WHERE client_id = $1 AND status <> 'archived' AND created_at >= date_trunc('month', now())`,
      [clientId],
    );
    return { pkg, estimate, produced: { posts: p.posts, carousels: p.carousels, stories: p.stories, videos: p.videos }, monthSpendUsd: Number(p.spend) };
  });
}
