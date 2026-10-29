import { z } from "zod";
import { many, one, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import type { ContentStatus } from "@/lib/content/status";
import type { EditorialFormat } from "@/lib/content/editorial";
import { getProvider } from "../ai/gateway";
import { requireClient } from "./clients";

/**
 * Visão do mês da agência: pacote × produzido por cliente, o que está parado
 * esperando alguém (pendências), o calendário de pautas e a lista de
 * configuração de cada cliente. Tudo calculado dos registros do banco; o RLS
 * limita aos clientes a que a pessoa tem acesso.
 */

const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export interface ClientMonth {
  clientId: string;
  name: string;
  contracted: number;
  produced: number;
  plan: "none" | "draft" | "approved";
  awaitingApproval: number;
  inReview: number;
  generating: number;
  failed: number;
  approvedThisMonth: number;
}

/** Um registro por cliente ativo (ou pausado): pacote, produção e pendências do mês. */
export async function monthByClient(auth: AuthContext, month: string): Promise<ClientMonth[]> {
  const m = MonthSchema.parse(month);
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<{
      id: string; name: string; contracted: number; produced: number; videos_done: number; plan: string | null;
      awaiting: number; in_review: number; generating: number; failed: number; approved: number;
    }>(
      tx,
      `WITH mm AS (SELECT $2::date AS start, ($2::date + interval '1 month') AS stop)
       SELECT c.id, c.name,
              coalesce(p.posts + p.carousels + p.stories + p.videos, 0) AS contracted,
              (SELECT count(*)::int FROM content_items ci, mm WHERE ci.client_id = c.id AND ci.status <> 'archived' AND ci.created_at >= mm.start AND ci.created_at < mm.stop) AS produced,
              (SELECT count(*)::int FROM editorial_items i JOIN editorial_plans pl ON pl.id = i.plan_id, mm
                 WHERE i.client_id = c.id AND i.format = 'video' AND i.status = 'done' AND pl.month = mm.start) AS videos_done,
              (SELECT pl.status FROM editorial_plans pl, mm WHERE pl.client_id = c.id AND pl.month = mm.start) AS plan,
              (SELECT count(*)::int FROM approvals a WHERE a.client_id = c.id AND a.status = 'pending') AS awaiting,
              (SELECT count(*)::int FROM content_items ci WHERE ci.client_id = c.id AND ci.status IN ('in_review', 'draft', 'rejected')) AS in_review,
              (SELECT count(*)::int FROM content_items ci WHERE ci.client_id = c.id AND ci.status = 'generating') AS generating,
              (SELECT count(*)::int FROM content_items ci WHERE ci.client_id = c.id AND ci.status = 'failed') AS failed,
              (SELECT count(*)::int FROM approvals a, mm WHERE a.client_id = c.id AND a.status = 'approved' AND a.decided_at >= mm.start AND a.decided_at < mm.stop) AS approved
       FROM clients c LEFT JOIN client_packages p ON p.client_id = c.id
       WHERE c.organization_id = $1 AND c.status <> 'archived'
       ORDER BY lower(c.name)`,
      [auth.organizationId, `${m}-01`],
    );
    return rows.map((r) => ({
      clientId: r.id,
      name: r.name,
      contracted: r.contracted,
      produced: r.produced + r.videos_done,
      plan: (r.plan ?? "none") as ClientMonth["plan"],
      awaitingApproval: r.awaiting,
      inReview: r.in_review,
      generating: r.generating,
      failed: r.failed,
      approvedThisMonth: r.approved,
    }));
  });
}

export interface CalendarEntry {
  date: string; // AAAA-MM-DD
  clientId: string;
  clientName: string;
  title: string;
  format: EditorialFormat;
  /** Situação da pauta e, se já virou peça, da peça. */
  itemStatus: "planned" | "in_production" | "done" | "skipped";
  contentItemId: string | null;
  contentStatus: ContentStatus | null;
  planApproved: boolean;
}

/** Pautas das linhas editoriais do mês (todas as datas), de todos os clientes ou de um. */
export async function calendarEntries(auth: AuthContext, month: string, clientId?: string): Promise<CalendarEntry[]> {
  const m = MonthSchema.parse(month);
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<{
      planned_date: Date; client_id: string; client_name: string; title: string; format: EditorialFormat; status: CalendarEntry["itemStatus"];
      content_item_id: string | null; content_status: ContentStatus | null; plan_status: string;
    }>(
      tx,
      `SELECT i.planned_date, i.client_id, c.name AS client_name, i.title, i.format, i.status, i.content_item_id, ci.status AS content_status, pl.status AS plan_status
       FROM editorial_items i
       JOIN editorial_plans pl ON pl.id = i.plan_id
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN content_items ci ON ci.id = i.content_item_id
       WHERE i.organization_id = $1 AND pl.month = $2::date AND i.planned_date IS NOT NULL AND i.status <> 'skipped'
         AND ($3::uuid IS NULL OR i.client_id = $3) AND c.status <> 'archived'
       ORDER BY i.planned_date, lower(c.name), i.position`,
      [auth.organizationId, `${m}-01`, clientId ?? null],
    );
    return rows.map((r) => ({
      date: r.planned_date.toISOString().slice(0, 10),
      clientId: r.client_id,
      clientName: r.client_name,
      title: r.title,
      format: r.format,
      itemStatus: r.status,
      contentItemId: r.content_item_id,
      contentStatus: r.content_status,
      planApproved: r.plan_status === "approved",
    }));
  });
}

export interface ChecklistStep {
  id: "brand" | "logo" | "photos" | "package" | "editorial" | "ai";
  label: string;
  done: boolean;
  hint: string;
  href: string;
}

/** O que falta para o cliente começar a produzir sem atrito (exibido até tudo estar pronto). */
export async function clientChecklist(auth: AuthContext, clientId: string, month: string, brandPercent: number): Promise<ChecklistStep[]> {
  const m = MonthSchema.parse(month);
  const r = await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    return one<{ logo: boolean; photos: number; pkg: number; plan: string | null }>(
      tx,
      `SELECT (SELECT coalesce(visual->>'logoAssetId', '') <> '' FROM brand_profiles WHERE client_id = $1) IS TRUE AS logo,
              (SELECT count(*)::int FROM media_assets WHERE client_id = $1 AND deleted_at IS NULL AND kind = 'image') AS photos,
              coalesce((SELECT posts + carousels + stories + videos FROM client_packages WHERE client_id = $1), 0) AS pkg,
              (SELECT status FROM editorial_plans WHERE client_id = $1 AND month = $2::date) AS plan`,
      [clientId, `${m}-01`],
    );
  });
  const base = `/clientes/${clientId}`;
  return [
    { id: "brand", label: "Perfil da marca", done: brandPercent === 100, hint: brandPercent === 100 ? "Completo" : `${brandPercent}% preenchido`, href: `${base}?aba=marca` },
    { id: "logo", label: "Logotipo", done: r.logo, hint: r.logo ? "Definido no perfil" : "Envie em Arquivos e escolha no perfil", href: r.logo ? `${base}?aba=marca` : `${base}?aba=arquivos` },
    { id: "photos", label: "Fotos do cliente", done: r.photos >= 3, hint: r.photos >= 3 ? `${r.photos} na biblioteca` : `${r.photos} de pelo menos 3 (envie ou importe do Drive)`, href: `${base}?aba=arquivos` },
    { id: "package", label: "Pacote mensal", done: r.pkg > 0, hint: r.pkg > 0 ? `${r.pkg} peças por mês` : "Quantas peças o cliente contratou", href: `${base}?aba=editorial` },
    { id: "editorial", label: "Linha editorial do mês", done: r.plan === "approved", hint: r.plan === "approved" ? "Aprovada" : r.plan === "draft" ? "Em rascunho: revise e aprove" : "Ainda não montada", href: `${base}?aba=editorial` },
    { id: "ai", label: "IA conectada", done: Boolean(getProvider() && !getProvider()!.isDemo), hint: getProvider() ? (getProvider()!.isDemo ? "Modo de demonstração" : "Pronta") : "Conecte a chave em Integrações", href: "/integracoes" },
  ];
}

/** Peças com versão aprovada no mês (aprovação decidida no mês), para a entrega em lote. */
export async function approvedInMonth(auth: AuthContext, clientId: string, month: string): Promise<Array<{ id: string; title: string; approvedVersionId: string; decidedAt: string; plannedDate: string | null }>> {
  const m = MonthSchema.parse(month);
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const rows = await many<{ id: string; title: string; approved_version_id: string; decided_at: Date; planned_date: Date | null }>(
      tx,
      `SELECT ci.id, ci.title, ci.approved_version_id, max(a.decided_at) AS decided_at,
              (SELECT i.planned_date FROM editorial_items i WHERE i.content_item_id = ci.id LIMIT 1) AS planned_date
       FROM content_items ci JOIN approvals a ON a.content_item_id = ci.id AND a.status = 'approved' AND a.content_version_id = ci.approved_version_id
       WHERE ci.client_id = $1 AND ci.approved_version_id IS NOT NULL AND ci.status <> 'archived'
         AND a.decided_at >= $2::date AND a.decided_at < ($2::date + interval '1 month')
       GROUP BY ci.id
       ORDER BY coalesce((SELECT i.planned_date FROM editorial_items i WHERE i.content_item_id = ci.id LIMIT 1), max(a.decided_at)::date), ci.title`,
      [clientId, `${m}-01`],
    );
    return rows.map((r) => ({ id: r.id, title: r.title, approvedVersionId: r.approved_version_id, decidedAt: r.decided_at.toISOString(), plannedDate: r.planned_date ? r.planned_date.toISOString().slice(0, 10) : null }));
  });
}
