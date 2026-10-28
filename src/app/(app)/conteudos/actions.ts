"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { runAction, type ActionState } from "@/server/actions";
import { deleteContents } from "@/server/services/deletion";

/** Exclusão definitiva em lote (lista de conteúdos e aba Conteúdos do cliente). */
export async function deleteContentsAction(ids: string[]): Promise<ActionState<{ deleted: string[] }>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const r = await deleteContents(auth, Array.isArray(ids) ? ids.map(String) : []);
    refresh();
    const parts: string[] = [];
    if (r.deleted.length) parts.push(r.deleted.length === 1 ? "1 conteúdo excluído." : `${r.deleted.length} conteúdos excluídos.`);
    if (r.skipped.length) parts.push(r.skipped.length === 1 ? "1 conteúdo em geração ficou de fora: aguarde terminar." : `${r.skipped.length} conteúdos em geração ficaram de fora: aguarde terminar.`);
    if (!parts.length) parts.push("Nenhum conteúdo encontrado para excluir.");
    return { message: parts.join(" "), data: { deleted: r.deleted.map((d) => d.id) } };
  });
}
