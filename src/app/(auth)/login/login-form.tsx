"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="light" pendingText="Entrando..." className="mt-1 h-10 w-full">
        Entrar
      </SubmitButton>
    </ActionForm>
  );
}
