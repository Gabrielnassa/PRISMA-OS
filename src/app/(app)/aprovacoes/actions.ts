"use server";

import { requireAuth } from "@/server/auth/next";
import { runAction, str, type ActionState } from "@/server/actions";
import { ValidationError } from "@/server/errors";
import { createClientApprovalLink } from "@/server/services/approval-links";
import { queueEmail } from "@/server/services/email";

type LinkData = { url: string; expiresAt: string; clientName: string; pending: number };

export async function clientLinkAction(_prev: ActionState<LinkData>, form: FormData): Promise<ActionState<LinkData>> {
  const auth = await requireAuth();
  return runAction(async () => ({ data: await createClientApprovalLink(auth, str(form, "clientId")) }));
}

export async function emailClientLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const email = str(form, "email").trim();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new ValidationError("Informe um e-mail válido.");
    const link = await createClientApprovalLink(auth, str(form, "clientId"));
    const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(link.expiresAt));
    const sent = await queueEmail(auth.organizationId, {
      to: [email],
      replyTo: auth.email,
      subject: `Peças para aprovar (${link.pending})`,
      text: `Olá!\n\n${auth.userName}, da ${auth.organizationName}, enviou ${link.pending === 1 ? "1 peça" : `${link.pending} peças`} para a sua aprovação.\n\nVeja e responda por aqui, sem login: ${link.url}\n\nO link vale até ${when} e mostra também as próximas peças que a agência enviar.`,
    });
    if (!sent) throw new ValidationError("O e-mail ainda não está configurado em Integrações. Copie o link ou envie pelo WhatsApp.");
    return { message: `Link enviado para ${email}.` };
  });
}
