import { z } from "zod";
import { many, maybeOne, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan, can } from "../authz/permissions";
import { NotFoundError, ValidationError } from "../errors";
import type { ContentStatus } from "@/lib/content/status";
import { audit, userActor } from "./audit";
import { notifyUsers } from "./inbox";

/**
 * Responsável e prazo de cada peça, e a lista "Minhas tarefas" de cada pessoa:
 * peças atribuídas a ela que ainda não foram aprovadas e, para quem aprova,
 * os pedidos de aprovação esperando decisão.
 */

const OPEN: ContentStatus[] = ["draft", "generating", "in_review", "awaiting_approval", "rejected", "failed"];

/** Pessoas que podem cuidar de uma peça deste cliente (acesso ao cliente e papel que cria ou aprova). */
export async function assignableMembers(
  auth: AuthContext,
  clientId: string,
): Promise<Array<{ id: string; name: string }>> {
  return withTx(userCtx(auth.userId), (tx) =>
    many<{ id: string; name: string }>(
      tx,
      `SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id AND u.is_active
       WHERE m.organization_id = $1 AND m.deactivated_at IS NULL AND m.role <> 'viewer'
         AND (m.role IN ('owner', 'admin') OR EXISTS (SELECT 1 FROM client_access ca WHERE ca.client_id = $2 AND ca.user_id = u.id))
       ORDER BY lower(u.name)`,
      [auth.organizationId, clientId],
    ),
  );
}

const AssignSchema = z.object({
  assigneeId: z.string().uuid().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .nullable(),
});

export async function setAssignment(
  auth: AuthContext,
  contentId: string,
  raw: { assigneeId: string | null; dueDate: string | null },
): Promise<void> {
  assertCan(auth.role, "content.edit");
  if (!z.string().uuid().safeParse(contentId).success) throw new NotFoundError("Peça não encontrada.");
  const parsed = AssignSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]!.message);
  const { assigneeId, dueDate } = parsed.data;
  const r = await withTx(userCtx(auth.userId), async (tx) => {
    const item = await maybeOne<{ client_id: string; title: string; assignee_id: string | null }>(
      tx,
      "SELECT client_id, title, assignee_id FROM content_items WHERE id = $1 AND organization_id = $2 FOR UPDATE",
      [contentId, auth.organizationId],
    );
    if (!item) throw new NotFoundError("Peça não encontrada.");
    if (assigneeId) {
      const ok = await maybeOne(
        tx,
        `SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id AND u.is_active
         WHERE m.organization_id = $1 AND m.user_id = $2 AND m.deactivated_at IS NULL AND m.role <> 'viewer'
           AND (m.role IN ('owner', 'admin') OR EXISTS (SELECT 1 FROM client_access ca WHERE ca.client_id = $3 AND ca.user_id = $2))`,
        [auth.organizationId, assigneeId, item.client_id],
      );
      if (!ok) throw new ValidationError("Essa pessoa não tem acesso a este cliente.");
    }
    await tx.query("UPDATE content_items SET assignee_id = $2, due_date = $3 WHERE id = $1", [
      contentId,
      assigneeId,
      dueDate,
    ]);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: item.client_id,
      action: "content.assigned",
      entityType: "content_item",
      entityId: contentId,
      metadata: { assigneeId, dueDate },
    });
    return { title: item.title, changed: assigneeId !== item.assignee_id };
  });
  if (assigneeId && r.changed && assigneeId !== auth.userId) {
    await notifyUsers(auth.organizationId, [assigneeId], {
      kind: "content.assigned",
      title: `Nova peça para você: ${r.title}`,
      body: `${auth.userName} passou a peça para você${dueDate ? `, prazo ${dueDate.split("-").reverse().join("/")}` : ""}.`,
      href: `/conteudos/${contentId}`,
    });
  }
}

export interface MyTask {
  kind: "piece" | "approval";
  contentId: string;
  title: string;
  clientName: string;
  status: ContentStatus;
  dueDate: string | null;
  overdue: boolean;
}

/** O que está com a pessoa agora, do prazo mais próximo para o mais distante. */
export async function myTasks(auth: AuthContext, limit = 12): Promise<MyTask[]> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const pieces = await many<{
      id: string;
      title: string;
      client_name: string;
      status: ContentStatus;
      due_date: Date | null;
      overdue: boolean;
    }>(
      tx,
      `SELECT ci.id, ci.title, c.name AS client_name, ci.status, ci.due_date, (ci.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS overdue
       FROM content_items ci JOIN clients c ON c.id = ci.client_id
       WHERE ci.organization_id = $1 AND ci.assignee_id = $2 AND ci.status = ANY($3::text[]) AND c.status <> 'archived'
       ORDER BY ci.due_date NULLS LAST, ci.updated_at DESC LIMIT $4`,
      [auth.organizationId, auth.userId, OPEN, limit],
    );
    const approvals = can(auth.role, "content.approve")
      ? await many<{ id: string; title: string; client_name: string; due_date: Date | null; overdue: boolean }>(
          tx,
          `SELECT ci.id, ci.title, c.name AS client_name, ci.due_date, (ci.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS overdue
           FROM approvals a JOIN content_items ci ON ci.id = a.content_item_id JOIN clients c ON c.id = a.client_id
           WHERE a.organization_id = $1 AND a.status = 'pending' AND (a.requested_by IS DISTINCT FROM $2) AND c.status <> 'archived'
           ORDER BY ci.due_date NULLS LAST, a.requested_at LIMIT $3`,
          [auth.organizationId, auth.userId, limit],
        )
      : [];
    const out: MyTask[] = [
      ...approvals.map((a) => ({
        kind: "approval" as const,
        contentId: a.id,
        title: a.title,
        clientName: a.client_name,
        status: "awaiting_approval" as ContentStatus,
        dueDate: a.due_date?.toISOString().slice(0, 10) ?? null,
        overdue: Boolean(a.overdue),
      })),
      ...pieces
        .filter((p) => !approvals.some((a) => a.id === p.id))
        .map((p) => ({
          kind: "piece" as const,
          contentId: p.id,
          title: p.title,
          clientName: p.client_name,
          status: p.status,
          dueDate: p.due_date?.toISOString().slice(0, 10) ?? null,
          overdue: Boolean(p.overdue),
        })),
    ];
    return out.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")).slice(0, limit);
  });
}
