"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { Field, Input, Textarea } from "@/components/ui";
import { decideByLinkAction } from "./actions";

export function DecisionForm({ token }: { token: string }) {
  const [state, action] = useActionState(decideByLinkAction, { status: "idle" });
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  if (state.status === "ok") return <FormMessage state={state} />;
  return (
    <ActionForm action={action} state={state} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Seu nome" htmlFor="d-name" error={err("name")}>
        <Input id="d-name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
      </Field>
      <Field label="Comentário" htmlFor="d-note" error={err("note")} hint="Obrigatório se pedir ajuste: diga o que precisa mudar.">
        <Textarea id="d-note" name="note" maxLength={2000} className="min-h-24" />
      </Field>
      {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approved" pendingText="Enviando...">
          Aprovar
        </SubmitButton>
        <SubmitButton name="decision" value="rejected" variant="secondary" pendingText="Enviando...">
          Pedir ajuste
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
