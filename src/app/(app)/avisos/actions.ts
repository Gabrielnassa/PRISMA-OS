"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { runAction, type ActionState } from "@/server/actions";
import { markInboxRead } from "@/server/services/inbox";

export async function readAllAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await markInboxRead(auth);
    refresh();
    return { message: "Tudo marcado como lido." };
  });
}
