"use client";

import { useActionState } from "react";
import { Field, Input, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { orgSettingsAction, passwordAction } from "./actions";

export function OrgSettingsForm({ org, canEdit }: { org: { name: string; globalContext: string; requireDistinctApprover: boolean }; canEdit: boolean }) {
  const [state, action] = useActionState(orgSettingsAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4 p-5">
      <fieldset disabled={!canEdit} className="grid gap-4">
        <Field label="Nome da agência" htmlFor="o-name">
          <Input id="o-name" name="name" defaultValue={org.name} required minLength={2} maxLength={120} />
        </Field>
        <Field
          label="Contexto global da agência"
          htmlFor="o-context"
          hint="Políticas e processos que valem para todos os clientes (ex.: linguagem inclusiva, regras de saúde). Enviado à IA como dado de referência."
        >
          <Textarea id="o-context" name="globalContext" defaultValue={org.globalContext} maxLength={20000} className="min-h-40" />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="requireDistinctApprover" defaultChecked={org.requireDistinctApprover} className="mt-0.5 accent-violet-500" />
          <span>
            <span className="font-medium text-ink-100">Exigir aprovador diferente de quem solicitou</span>
            <span className="block text-ink-400">Impede que a mesma pessoa envie e aprove a própria peça.</span>
          </span>
        </label>
      </fieldset>
      <FormMessage state={state} />
      {canEdit ? (
        <div>
          <SubmitButton>Salvar configurações</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function PasswordForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action] = useActionState(passwordAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4 p-5 md:grid-cols-3">
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
      <Field label="Senha atual" htmlFor="pw-current">
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nova senha" htmlFor="pw-next" hint="Mínimo 10 caracteres, com letras e números.">
        <Input id="pw-next" name="next" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirmar nova senha" htmlFor="pw-confirm">
        <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <div className="md:col-span-3">
        <FormMessage state={state} />
      </div>
      <div>
        <SubmitButton variant="secondary">Alterar senha</SubmitButton>
      </div>
    </form>
  );
}
