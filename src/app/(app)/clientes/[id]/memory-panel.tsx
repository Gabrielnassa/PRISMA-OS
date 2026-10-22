"use client";

import { useActionState } from "react";
import { Field, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { addMemoryAction } from "../actions";

export function AddMemoryForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(addMemoryAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4 p-5 md:grid-cols-[200px_1fr_auto] md:items-end">
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Tipo" htmlFor="m-kind">
        <Select id="m-kind" name="kind" defaultValue="fact">
          <option value="fact">Fato confirmado</option>
          <option value="preference">Preferência</option>
          <option value="hypothesis">Hipótese</option>
          <option value="suggestion">Sugestão</option>
        </Select>
      </Field>
      <Field label="Informação" htmlFor="m-content">
        <Textarea id="m-content" name="content" required minLength={3} maxLength={2000} className="min-h-10" placeholder="Ex.: O cliente prefere fotos da equipe real em vez de banco de imagens." />
      </Field>
      <SubmitButton>Registrar</SubmitButton>
      <div className="md:col-span-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
