"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth/next";
import { bool, runAction, str, type ActionState } from "@/server/actions";
import { updateOrganization } from "@/server/services/organizations";
import { changeOwnPassword } from "@/server/services/users";
import { ValidationError } from "@/server/errors";

export async function orgSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await updateOrganization(auth, { name: str(form, "name"), globalContext: str(form, "globalContext"), requireDistinctApprover: bool(form, "requireDistinctApprover") });
    refresh();
    return { message: "Configurações salvas." };
  });
}

export async function passwordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth({ allowPasswordChange: true });
  const result = await runAction<undefined>(async () => {
    if (str(form, "next") !== str(form, "confirm")) throw new ValidationError("A confirmação não confere com a nova senha.");
    await changeOwnPassword(auth, { current: str(form, "current"), next: str(form, "next") });
    return { message: "Senha alterada. Outras sessões foram encerradas." };
  });
  if (result.status === "ok" && str(form, "redirectTo") === "/") redirect("/");
  if (result.status === "ok") refresh();
  return result;
}
