"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { runAction, str, type ActionState } from "@/server/actions";
import { addPrice } from "@/server/services/costs";

export async function addPriceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const num = (k: string) => {
      const v = str(form, k).replace(",", ".").trim();
      return v === "" ? undefined : Number(v);
    };
    await addPrice(auth, {
      provider: str(form, "provider"),
      model: str(form, "model"),
      input: num("input") ?? NaN,
      output: num("output") ?? NaN,
      cacheRead: num("cacheRead"),
      cacheWrite: num("cacheWrite"),
      source: str(form, "source"),
    });
    refresh();
    return { message: "Tarifa cadastrada. Ela vale para as próximas execuções." };
  });
}
