"use server";

import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { bool, runAction, str, type ActionState } from "@/server/actions";
import { inviteMember, updateMember } from "@/server/services/users";
import type { Role } from "@/server/authz/permissions";

export async function inviteAction(_prev: ActionState<{ temporaryPassword: string | null; email: string }>, form: FormData): Promise<ActionState<{ temporaryPassword: string | null; email: string }>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const email = str(form, "email");
    const r = await inviteMember(auth, { name: str(form, "name"), email, role: str(form, "role") as Role });
    refresh();
    return {
      message: r.existingUser ? "Usuário existente adicionado à organização." : "Acesso criado. Copie a senha temporária agora: ela não será exibida de novo.",
      data: { temporaryPassword: r.temporaryPassword, email },
    };
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
