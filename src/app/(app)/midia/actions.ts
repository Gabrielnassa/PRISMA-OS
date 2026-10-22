"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { deleteMedia } from "@/server/services/media";
import { runAction, str, type ActionState } from "@/server/actions";

export async function deleteMediaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await deleteMedia(auth, str(form, "mediaId"));
    refresh();
  });
}
