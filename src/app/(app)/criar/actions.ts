"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth/next";
import { runAction, str, type ActionState } from "@/server/actions";
import { createContent } from "@/server/services/content";
import { runAiSkill } from "@/server/orchestrator";
import { ideasSkill, type IdeasOutput } from "@/server/skills/ideas";
import { listContents } from "@/server/services/content";
import { assertCan } from "@/server/authz/permissions";
import type { CreateContentInput } from "@/lib/content/briefing";

export async function createContentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  let contentId = "";
  const result = await runAction(async () => {
    const input: CreateContentInput = {
      clientId: str(form, "clientId"),
      title: str(form, "title"),
      channel: str(form, "channel") as CreateContentInput["channel"],
      format: str(form, "format") as CreateContentInput["format"],
      aspect: (str(form, "aspect") || undefined) as CreateContentInput["aspect"],
      objective: str(form, "objective") as CreateContentInput["objective"],
      briefing: {
        text: str(form, "briefing"),
        audience: str(form, "audience"),
        keyMessages: str(form, "keyMessages"),
        offer: str(form, "offer"),
        cta: str(form, "cta"),
      },
      slideCount: Number(str(form, "slideCount") || 5),
      templatePreference: str(form, "templatePreference") || "auto",
      imageAssetIds: form.getAll("imageAssetIds").map(String).slice(0, 10),
      mode: str(form, "mode") === "manual" ? "manual" : "ai",
      requestId: str(form, "requestId"),
    };
    contentId = (await createContent(auth, input)).contentId;
  });
  if (result.status === "ok") redirect(`/conteudos/${contentId}`);
  return result;
}

export async function suggestIdeasAction(_prev: ActionState<IdeasOutput>, form: FormData): Promise<ActionState<IdeasOutput>> {
  const auth = await requireAuth();
  return runAction(async () => {
    assertCan(auth.role, "content.create");
    const clientId = str(form, "clientId");
    const recent = await listContents(auth, { clientId, limit: 20 });
    const out = await runAiSkill(ideasSkill, {
      auth,
      clientId,
      input: {
        objective: str(form, "objective") as never,
        format: str(form, "format") as never,
        theme: str(form, "briefing"),
        quantity: 5,
        recentTitles: recent.items.map((i) => i.title),
      },
    });
    return { data: out.output, message: out.isDemo ? "Pautas de demonstração." : undefined };
  });
}
