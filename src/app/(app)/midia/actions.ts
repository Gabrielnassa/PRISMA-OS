"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { deleteMedia } from "@/server/services/media";
import { str } from "@/server/actions";

export async function deleteMediaAction(form: FormData): Promise<void> {
  const auth = await requireAuth();
  await deleteMedia(auth, str(form, "mediaId"));
  refresh();
}
