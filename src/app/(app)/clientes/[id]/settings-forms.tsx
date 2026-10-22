"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { budgetAction, updateClientAction } from "../actions";

export function ClientSettingsForm({ client, canArchive }: { client: { id: string; name: string; segment: string; status: string }; canArchive: boolean }) {
  const [state, action] = useActionState(updateClientAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} className="grid gap-4 p-5">
      <input type="hidden" name="clientId" value={client.id} />
      <Field label="Nome" htmlFor="c-name">
        <Input id="c-name" name="name" defaultValue={client.name} required minLength={2} maxLength={120} />
      </Field>
      <Field label="Segmento" htmlFor="c-segment">
        <Input id="c-segment" name="segment" defaultValue={client.segment} maxLength={200} />
      </Field>
      <Field label="Situação" htmlFor="c-status">
        <Select id="c-status" name="status" defaultValue={client.status}>
          <option value="active">Ativo</option>
          <option value="paused">Pausado</option>
          {canArchive || client.status === "archived" ? <option value="archived">Arquivado</option> : null}
        </Select>
      </Field>
      <FormMessage state={state} />
      <div>
        <SubmitButton variant="secondary">Salvar dados</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function BudgetForm({ clientId, budget }: { clientId: string; budget: { limitUsd: number | null; alertPct: number | null; hardStop: boolean | null } }) {
  const [state, action] = useActionState(budgetAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} className="grid gap-4 p-5">
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Teto mensal de IA (US$)" htmlFor="b-limit" hint="Deixe vazio para não limitar.">
        <Input id="b-limit" name="monthlyLimitUsd" inputMode="decimal" defaultValue={budget.limitUsd ?? ""} placeholder="Ex.: 25" />
      </Field>
      <Field label="Alertar ao atingir (%)" htmlFor="b-alert">
        <Input id="b-alert" name="alertThresholdPct" type="number" min={1} max={100} defaultValue={budget.alertPct ?? 80} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-200">
        <input type="checkbox" name="hardStop" defaultChecked={budget.hardStop ?? true} className="accent-violet-500" />
        Interromper novas gerações ao atingir o teto
      </label>
      <FormMessage state={state} />
      <div>
        <SubmitButton variant="secondary">Salvar limite</SubmitButton>
      </div>
    </ActionForm>
  );
}
