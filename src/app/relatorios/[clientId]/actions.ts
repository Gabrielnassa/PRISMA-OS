"use server";

import { requireAuth } from "@/server/auth/next";
import { runAction, str, type ActionState } from "@/server/actions";
import { createReportLink } from "@/server/services/reports";

export async function reportLinkAction(_prev: ActionState<{ url: string; expiresAt: string }>, form: FormData): Promise<ActionState<{ url: string; expiresAt: string }>> {
  const auth = await requireAuth();
  return runAction(async () => ({ data: await createReportLink(auth, str(form, "clientId"), str(form, "month")) }));
}
