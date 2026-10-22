"use server";

import { redirect } from "next/navigation";
import { login } from "@/server/auth/service";
import { requestMeta, setSessionCookie } from "@/server/auth/next";
import { runAction, str, type ActionState } from "@/server/actions";
import { safeNextPath } from "@/lib/safe-redirect";

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const meta = await requestMeta();
  const result = await runAction(async () => {
    const { token, expiresAt } = await login({ email: str(form, "email"), password: str(form, "password"), ip: meta.ip, userAgent: meta.userAgent });
    await setSessionCookie(token, expiresAt);
  });
  if (result.status === "ok") redirect(safeNextPath(str(form, "next")));
  return result;
}
