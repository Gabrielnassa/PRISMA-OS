"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { bool, runAction, str, type ActionState } from "@/server/actions";
import { cancelPublication, refreshMetrics, retryPublication, schedulePublications } from "@/server/services/publications";
import { tiktokOptions } from "@/server/services/social-accounts";

/** "AAAA-MM-DDTHH:MM" do campo de data e hora, no horário de Brasília (sem horário de verão desde 2019). */
function brasiliaToIso(local: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00-03:00` : local;
}

export async function scheduleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const now = str(form, "when") === "now";
    const r = await schedulePublications(auth, {
      contentId: str(form, "contentId") || undefined,
      mediaAssetId: str(form, "mediaAssetId") || undefined,
      accountIds: form.getAll("accountIds").map(String),
      when: now ? "now" : brasiliaToIso(str(form, "scheduledAt")),
      caption: str(form, "caption"),
      title: str(form, "title"),
      tiktokPrivacy: str(form, "tiktokPrivacy") || undefined,
      youtubePrivacy: (str(form, "youtubePrivacy") || undefined) as "public" | "unlisted" | "private" | undefined,
      allowComments: bool(form, "allowComments"),
      madeForKids: bool(form, "madeForKids"),
      tiktokConsent: bool(form, "tiktokConsent"),
    });
    refresh();
    const n = r.ids.length;
    const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(r.scheduledAt));
    return { message: now ? `Publicação iniciada em ${n === 1 ? "1 conta" : `${n} contas`}. Acompanhe abaixo.` : `Agendado para ${when} em ${n === 1 ? "1 conta" : `${n} contas`}.` };
  });
}

export async function publicationOpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const id = str(form, "publicationId");
    const op = str(form, "op");
    if (op === "cancel") await cancelPublication(auth, id);
    else if (op === "retry") await retryPublication(auth, id);
    else await refreshMetrics(auth, id);
    refresh();
    return { message: op === "cancel" ? "Publicação cancelada." : op === "retry" ? "Nova tentativa na fila." : "Métricas atualizadas." };
  });
}

export async function tiktokOptionsAction(_prev: ActionState<{ privacyOptions: string[]; nickname: string }>, form: FormData): Promise<ActionState<{ privacyOptions: string[]; nickname: string }>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const r = await tiktokOptions(auth, str(form, "accountId"));
    return { data: { privacyOptions: r.privacyOptions, nickname: r.nickname } };
  });
}
