"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { createClientAction } from "./actions";

export function CreateClientForm() {
  const [state, action] = useActionState(createClientAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <Field label="Nome do cliente" htmlFor="name" error={state.status === "error" ? state.fieldErrors?.name : undefined}>
        <Input id="name" name="name" required minLength={2} maxLength={120} placeholder="Ex.: Clínica Bem Viver" />
      </Field>
      <Field label="Segmento" htmlFor="segment">
        <Input id="segment" name="segment" maxLength={200} placeholder="Ex.: Saúde, Arquitetura, Varejo" />
      </Field>
      <SubmitButton pendingText="Cadastrando...">Cadastrar cliente</SubmitButton>
      <div className="md:col-span-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
