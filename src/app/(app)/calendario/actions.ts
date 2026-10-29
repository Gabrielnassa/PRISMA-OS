"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { runAction, type ActionState } from "@/server/actions";
import { createCalendarFeed, revokeCalendarFeed } from "@/server/services/calendar-feed";

export async function createFeedAction(_prev: ActionState<{ url: string }>, _form: FormData): Promise<ActionState<{ url: string }>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const url = await createCalendarFeed(auth);
    refresh();
    return { data: { url } };
  });
}

export async function revokeFeedAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await revokeCalendarFeed(auth);
    refresh();
    return { message: "Endereço da agenda desativado." };
  });
}
