"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { addPriceAction } from "./actions";

export function PriceForm() {
  const [state, action] = useActionState(addPriceAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="grid gap-4 p-5 md:grid-cols-3">
      <Field label="Provedor" htmlFor="p-provider">
        <Input id="p-provider" name="provider" defaultValue="anthropic" required />
      </Field>
      <Field label="Modelo" htmlFor="p-model">
        <Input id="p-model" name="model" defaultValue="claude-opus-5-5" required />
      </Field>
      <Field label="Entrada (US$/milhão de tokens)" htmlFor="p-in">
        <Input id="p-in" name="input" inputMode="decimal" required />
      </Field>
      <Field label="Saída (US$/milhão)" htmlFor="p-out">
        <Input id="p-out" name="output" inputMode="decimal" required />
      </Field>
      <Field label="Leitura de cache (US$/milhão)" htmlFor="p-cr" hint="Opcional; sem valor, cobra como entrada.">
        <Input id="p-cr" name="cacheRead" inputMode="decimal" />
      </Field>
      <Field label="Escrita de cache (US$/milhão)" htmlFor="p-cw">
        <Input id="p-cw" name="cacheWrite" inputMode="decimal" />
      </Field>
      <Field label="Fonte da tarifa" htmlFor="p-source" hint="Link da tabela oficial ou contrato." className="md:col-span-3">
        <Input id="p-source" name="source" required minLength={3} />
      </Field>
      <div className="md:col-span-3">
        <FormMessage state={state} />
      </div>
      <div>
        <SubmitButton variant="secondary">Cadastrar tarifa</SubmitButton>
      </div>
    </ActionForm>
  );
}
