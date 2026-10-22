"use server";

import { refresh } from "next/cache";
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
  const auth = await requireAuth();
  return runAction(async () => {
    if (str(form, "next") !== str(form, "confirm")) throw new ValidationError("A confirmação não confere com a nova senha.");
    await changeOwnPassword(auth, { current: str(form, "current"), next: str(form, "next") });
    refresh();
    return { message: "Senha alterada. Outras sessões foram encerradas." };
  });
}
