"use server";

import { refresh } from "next/cache";
import { runAction, str, type ActionState } from "@/server/actions";
import { decideByLink } from "@/server/services/approval-links";

/** Decisão do cliente pelo link (sem login; o token é a autorização). */
export async function decideByLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const r = await decideByLink(str(form, "token"), { decision: str(form, "decision"), name: str(form, "name"), note: str(form, "note") });
    refresh();
    return { message: r.status === "approved" ? "Aprovação registrada. Obrigado!" : "Pedido de ajuste enviado para a agência." };
  });
}
