"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { CopyButton } from "@/components/copy-button";
import { Field, Input } from "@/components/ui";
import { useToastAction } from "@/components/toast";
import type { ActionState } from "@/server/actions";
import { createWebhookAction, saveAppAction, saveSmtpAction, testSmtpAction } from "./actions";

export function AppKeysForm({
  provider,
  publicLabel,
  secretLabel,
  publicId,
  secretHint,
}: {
  provider: string;
  publicLabel: string;
  secretLabel: string;
  publicId: string | null;
  secretHint: string | null;
}) {
  const [state, action] = useToastAction(saveAppAction);
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="provider" value={provider} />
      <Field label={publicLabel} htmlFor={`${provider}-id`} error={err("publicId")}>
        <Input id={`${provider}-id`} name="publicId" defaultValue={publicId ?? ""} autoComplete="off" spellCheck={false} required />
      </Field>
      <Field label={secretLabel} htmlFor={`${provider}-secret`} error={err("secret")} hint={secretHint ? `Salva: ${secretHint}. Deixe vazio para manter.` : undefined}>
        <Input id={`${provider}-secret`} name="secret" type="password" autoComplete="new-password" spellCheck={false} placeholder={secretHint ?? ""} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton size="sm" variant="secondary">
          Salvar chaves
        </SubmitButton>
        {state.status === "error" && !state.fieldErrors ? <span className="text-[12.5px] text-red-300">{state.message}</span> : null}
      </div>
    </ActionForm>
  );
}

export function SmtpForm({ initial }: { initial: { host: string; port: number; secure: boolean; user: string; from: string; passwordHint: string | null } }) {
  const [state, action] = useToastAction(saveSmtpAction);
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
      <Field label="Servidor SMTP" htmlFor="smtp-host" error={err("host")} hint="Hostinger: smtp.hostinger.com · Gmail: smtp.gmail.com">
        <Input id="smtp-host" name="host" defaultValue={initial.host} autoComplete="off" spellCheck={false} required />
      </Field>
      <Field label="Porta" htmlFor="smtp-port" error={err("port")}>
        <Input id="smtp-port" name="port" type="number" min={1} max={65535} defaultValue={initial.port} required />
      </Field>
      <Field label="Usuário (e-mail)" htmlFor="smtp-user" error={err("user")}>
        <Input id="smtp-user" name="user" defaultValue={initial.user} autoComplete="off" required />
      </Field>
      <Field label="Senha" htmlFor="smtp-pass" error={err("password")} hint={initial.passwordHint ? "Deixe vazio para manter." : undefined}>
        <Input id="smtp-pass" name="password" type="password" autoComplete="new-password" placeholder={initial.passwordHint ?? ""} />
      </Field>
      <Field label="Remetente" htmlFor="smtp-from" error={err("from")} className="sm:col-span-2">
        <Input id="smtp-from" name="from" defaultValue={initial.from} placeholder="Agência <contato@suaagencia.com.br>" required />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-ink-200 sm:col-span-2">
        <input type="checkbox" name="secure" defaultChecked={initial.secure} />
        Conexão segura (SSL, porta 465). Desmarque para STARTTLS na porta 587.
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton size="sm" variant="secondary">
          Salvar e-mail
        </SubmitButton>
        {state.status === "error" && !state.fieldErrors ? <span className="text-[12.5px] text-red-300">{state.message}</span> : null}
      </div>
    </ActionForm>
  );
}

export function SmtpTestButton() {
  const [state, action] = useActionState(testSmtpAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} className="flex flex-col gap-2">
      <div>
        <SubmitButton size="sm" variant="ghost" pendingText="Enviando...">
          Enviar teste
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </ActionForm>
  );
}

export function WebhookForm({ events }: { events: Array<[string, string]> }) {
  const [state, action] = useActionState<ActionState<{ secret: string }>, FormData>(createWebhookAction, { status: "idle" });
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="flex flex-col gap-3">
      <Field label="Endereço" htmlFor="wh-url" error={err("url")} hint="O endereço que o n8n, o Zapier ou o Make mostra para receber webhooks.">
        <Input id="wh-url" name="url" type="url" placeholder="https://" required />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink-200">Avisar quando</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {events.map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 text-[13px] text-ink-200">
              <input type="checkbox" name="events" value={id} defaultChecked />
              {label}
            </label>
          ))}
        </div>
        {err("events") ? <p className="mt-1 text-[12.5px] text-red-300">{err("events")}</p> : null}
      </fieldset>
      <div>
        <SubmitButton size="sm" variant="secondary">
          Adicionar webhook
        </SubmitButton>
      </div>
      {state.status === "ok" && state.data ? (
        <div className="rounded-[10px] border border-emerald-400/25 bg-emerald-400/[0.05] p-3 text-[13px] text-ink-100">
          <p>Segredo de assinatura (aparece só agora). Use para conferir o cabeçalho X-Prisma-Signature:</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="select-all break-all rounded-[4px] bg-ink-950 px-2 py-1 font-mono text-[12px] ring-1 ring-ink-700">{state.data.secret}</code>
            <CopyButton text={state.data.secret} />
          </div>
        </div>
      ) : state.status === "error" && !state.fieldErrors ? (
        <FormMessage state={state} />
      ) : null}
    </ActionForm>
  );
}
