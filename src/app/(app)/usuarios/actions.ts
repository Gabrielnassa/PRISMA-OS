"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { bool, runAction, str, type ActionState } from "@/server/actions";
import { inviteMember, resetTemporaryPassword, updateMember } from "@/server/services/users";
import type { Role } from "@/server/authz/permissions";

type PasswordResult = { temporaryPassword: string; email: string };

export async function inviteAction(_prev: ActionState<PasswordResult>, form: FormData): Promise<ActionState<PasswordResult>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const email = str(form, "email");
    const r = await inviteMember(auth, { name: str(form, "name"), email, role: str(form, "role") as Role });
    refresh();
    return {
      message: "Acesso criado. Copie a senha temporária agora: ela não será exibida de novo e expira em 7 dias.",
      data: { temporaryPassword: r.temporaryPassword, email },
    };
  });
}

export async function resetPasswordAction(_prev: ActionState<PasswordResult>, form: FormData): Promise<ActionState<PasswordResult>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const r = await resetTemporaryPassword(auth, str(form, "userId"));
    refresh();
    return { message: "Nova senha temporária gerada. As sessões da pessoa foram encerradas.", data: { temporaryPassword: r.temporaryPassword, email: str(form, "email") } };
  });
}

export async function updateMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await updateMember(auth, str(form, "userId"), {
      role: str(form, "role") as Role,
      isActive: bool(form, "isActive"),
      clientIds: form.getAll("clientIds").map(String),
    });
    refresh();
    return { message: "Permissões atualizadas." };
  });
}
