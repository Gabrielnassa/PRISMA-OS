import { z } from "zod";
import { many, one, userCtx, withTx, type Queryable } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { confirmsName } from "@/lib/confirm-name";
import { storage } from "../storage";
import { audit, userActor } from "./audit";
import { requireClient } from "./clients";

/**
 * Exclusão definitiva de conteúdos e de clientes. Arquivar continua sendo o
 * caminho reversível; excluir apaga de vez:
 * - Versões são imutáveis no banco: a exclusão liga `app.allow_purge` só
 *   dentro da transação que apaga.
 * - O consumo de IA continua nos totais de custos (o provedor já cobrou), mas
 *   sem vínculo com o conteúdo e sem o texto gerado.
 * - A auditoria é somente inserção: registra quem excluiu o quê.
 */

async function allowPurge(tx: Queryable): Promise<void> {
  await tx.query("SELECT set_config('app.allow_purge', 'on', true)");
}

const IdsSchema = z
  .array(z.string().uuid("Seleção inválida."))
  .min(1, "Selecione pelo menos um conteúdo.")
  .max(200, "Exclua no máximo 200 conteúdos por vez.");

export interface DeleteContentsResult {
  deleted: Array<{ id: string; clientId: string; title: string }>;
  /** Conteúdos em geração: a tarefa ainda vai gravar neles. */
  skipped: Array<{ id: string; title: string }>;
}

export async function deleteContents(auth: AuthContext, ids: string[]): Promise<DeleteContentsResult> {
  assertCan(auth.role, "content.delete");
  const parsed = IdsSchema.safeParse([...new Set(ids)]);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Seleção inválida.");
  const org = auth.organizationId;
  return withTx(userCtx(auth.userId), async (tx) => {
    // RLS: só aparecem conteúdos de clientes que a pessoa acessa.
    const rows = await many<{ id: string; client_id: string; title: string; status: string }>(
      tx,
      "SELECT id, client_id, title, status FROM content_items WHERE id = ANY($1::uuid[]) AND organization_id = $2 ORDER BY id FOR UPDATE",
      [parsed.data, org],
    );
    const deletable = rows.filter((r) => r.status !== "generating");
    const skipped = rows.filter((r) => r.status === "generating").map((r) => ({ id: r.id, title: r.title }));
    if (deletable.length === 0) return { deleted: [], skipped };

    const delIds = deletable.map((r) => r.id);
    const versions = await many<{ id: string; n: number }>(
      tx,
      "SELECT content_item_id AS id, count(*)::int AS n FROM content_versions WHERE content_item_id = ANY($1::uuid[]) GROUP BY content_item_id",
      [delIds],
    );
    const versionCount = new Map(versions.map((v) => [v.id, v.n]));
    await tx.query(
      "UPDATE ai_runs SET content_item_id = NULL, input_summary = '{}'::jsonb, output = NULL WHERE organization_id = $1 AND content_item_id = ANY($2::uuid[])",
      [org, delIds],
    );
    // Pauta da linha editorial volta a ficar planejada (a peça pode ser criada de novo).
    await tx.query("UPDATE editorial_items SET status = 'planned', content_item_id = NULL WHERE content_item_id = ANY($1::uuid[])", [delIds]);
    await allowPurge(tx);
    await tx.query("DELETE FROM content_items WHERE id = ANY($1::uuid[]) AND organization_id = $2", [delIds, org]);
    for (const r of deletable) {
      await audit(tx, userActor(auth), {
        organizationId: org,
        clientId: r.client_id,
        action: "content.deleted",
        entityType: "content_item",
        entityId: r.id,
        metadata: { title: r.title, status: r.status, versions: versionCount.get(r.id) ?? 0 },
      });
    }
    return { deleted: deletable.map((r) => ({ id: r.id, clientId: r.client_id, title: r.title })), skipped };
  });
}

export async function deleteContent(auth: AuthContext, contentId: string): Promise<{ id: string; clientId: string; title: string }> {
  if (!z.string().uuid().safeParse(contentId).success) throw new NotFoundError("Conteúdo não encontrado.");
  const r = await deleteContents(auth, [contentId]);
  if (r.skipped.length) throw new ConflictError("Aguarde o fim da geração para excluir.");
  const done = r.deleted[0];
  if (!done) throw new NotFoundError("Conteúdo não encontrado.");
  return done;
}

export interface ClientDeletionSummary {
  name: string;
  contents: number;
  versions: number;
  media: number;
  memories: number;
  skills: number;
  aiRuns: number;
  /** Gerações na fila ou em andamento: a exclusão espera por elas. */
  inProgress: boolean;
}

async function summarize(tx: Queryable, client: { id: string; name: string }): Promise<ClientDeletionSummary> {
  const r = await one<{ contents: number; versions: number; media: number; memories: number; skills: number; ai_runs: number; busy: boolean }>(
    tx,
    `SELECT (SELECT count(*)::int FROM content_items WHERE client_id = $1) AS contents,
            (SELECT count(*)::int FROM content_versions WHERE client_id = $1) AS versions,
            (SELECT count(*)::int FROM media_assets WHERE client_id = $1 AND deleted_at IS NULL) AS media,
            (SELECT count(*)::int FROM client_memories WHERE client_id = $1) AS memories,
            (SELECT count(*)::int FROM custom_skills WHERE client_id = $1) AS skills,
            (SELECT count(*)::int FROM ai_runs WHERE client_id = $1) AS ai_runs,
            EXISTS (SELECT 1 FROM content_items WHERE client_id = $1 AND status = 'generating')
              OR EXISTS (SELECT 1 FROM jobs WHERE client_id = $1 AND status IN ('queued', 'running')) AS busy`,
    [client.id],
  );
  return {
    name: client.name,
    contents: r.contents,
    versions: r.versions,
    media: r.media,
    memories: r.memories,
    skills: r.skills,
    aiRuns: r.ai_runs,
    inProgress: r.busy,
  };
}

/** O que será apagado (para a tela de confirmação). */
export async function getClientDeletionSummary(auth: AuthContext, clientId: string): Promise<ClientDeletionSummary> {
  assertCan(auth.role, "client.delete");
  return withTx(userCtx(auth.userId), async (tx) => summarize(tx, await requireClient(tx, auth, clientId)));
}

/**
 * Exclui o cliente e tudo dele: perfil da marca, memória, arquivos, conteúdos
 * (versões, aprovações, comentários), limite de custos, tarefas e skills
 * exclusivas. A pessoa confirma digitando o nome do cliente.
 */
export async function deleteClient(
  auth: AuthContext,
  clientId: string,
  confirmation: string,
): Promise<{ name: string; summary: ClientDeletionSummary; filesFailed: number }> {
  assertCan(auth.role, "client.delete");
  const org = auth.organizationId;
  const { summary, keys } = await withTx(userCtx(auth.userId), async (tx) => {
    const client = await requireClient(tx, auth, clientId);
    // Trava o cliente: novos conteúdos, arquivos e tarefas esperam e depois falham (cliente inexistente).
    // Sem linha travada, outra pessoa acabou de excluí-lo.
    const locked = await tx.query("SELECT 1 FROM clients WHERE id = $1 FOR UPDATE", [clientId]);
    if (locked.rowCount === 0) throw new NotFoundError("Cliente não encontrado.");
    if (!confirmsName(confirmation, client.name)) {
      throw new ValidationError(`Para confirmar, digite o nome do cliente: ${client.name}`, { confirmation: "O nome não confere." });
    }
    const summary = await summarize(tx, client);
    if (summary.inProgress) {
      throw new ConflictError("Há gerações na fila ou em andamento para este cliente. Aguarde terminarem e tente de novo.");
    }
    // Inclui arquivos já removidos da biblioteca (guardados para reproduzir versões antigas).
    const keys = (await many<{ storage_key: string }>(tx, "SELECT storage_key FROM media_assets WHERE client_id = $1", [clientId])).map((r) => r.storage_key);
    await tx.query(
      `UPDATE ai_runs SET client_id = NULL, content_item_id = NULL, output = NULL, input_summary = jsonb_build_object('deletedClient', $2::text)
       WHERE client_id = $1 AND organization_id = $3`,
      [clientId, client.name, org],
    );
    await allowPurge(tx);
    await tx.query("DELETE FROM clients WHERE id = $1 AND organization_id = $2", [clientId, org]);
    await audit(tx, userActor(auth), {
      organizationId: org,
      action: "client.deleted",
      entityType: "client",
      entityId: clientId,
      metadata: {
        name: client.name,
        contents: summary.contents,
        versions: summary.versions,
        media: summary.media,
        memories: summary.memories,
        skills: summary.skills,
        aiRuns: summary.aiRuns,
      },
    });
    return { summary, keys };
  });

  // Os arquivos só saem depois que o banco confirmou a exclusão.
  let filesFailed = 0;
  for (const key of keys) {
    try {
      await storage().delete(key);
    } catch (err) {
      filesFailed++;
      console.error(JSON.stringify({ level: "error", msg: "client.delete_file_failed", clientId, key, error: (err as Error).message }));
    }
  }
  return { name: summary.name, summary, filesFailed };
}
