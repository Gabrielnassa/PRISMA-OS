"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revokeSession, SESSION_COOKIE } from "@/server/auth/service";
import { clearSessionCookie } from "@/server/auth/next";

export async function logoutAction(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  await clearSessionCookie();
  redirect("/login");
}
