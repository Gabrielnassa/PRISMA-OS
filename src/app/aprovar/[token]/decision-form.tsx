"use client";

import { useActionState, useEffect, useRef } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { Field, Input, Textarea } from "@/components/ui";
import { decideByLinkAction } from "./actions";

const NAME_KEY = "prisma-aprovacao-nome";

export function DecisionForm({ token, approvalId }: { token: string; approvalId: string }) {
  const [state, action] = useActionState(decideByLinkAction, { status: "idle" });
  const nameRef = useRef<HTMLInputElement>(null);
  // O nome digitado numa peça vale para as outras da mesma página.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved && nameRef.current && !nameRef.current.value) nameRef.current.value = saved;
    } catch {
      // navegador sem armazenamento: a pessoa digita o nome
    }
  }, []);
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  if (state.status === "ok") return <FormMessage state={state} />;
  return (
    <ActionForm
      action={(fd) => {
        try {
          localStorage.setItem(NAME_KEY, String(fd.get("name") ?? ""));
        } catch {
          // ignora
        }
        action(fd);
      }}
      state={state}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="approvalId" value={approvalId} />
      <Field label="Seu nome" htmlFor={`d-name-${approvalId}`} error={err("name")}>
        <Input id={`d-name-${approvalId}`} name="name" required minLength={2} maxLength={120} autoComplete="name" ref={nameRef} />
      </Field>
      <Field label="Comentário" htmlFor={`d-note-${approvalId}`} error={err("note")} hint="Obrigatório se pedir ajuste: diga o que precisa mudar.">
        <Textarea id={`d-note-${approvalId}`} name="note" maxLength={2000} className="min-h-20" />
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
