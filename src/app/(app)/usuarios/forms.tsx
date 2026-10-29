"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { inviteAction, resetPasswordAction, updateMemberAction } from "./actions";

type RoleOption = { id: string; label: string; description: string };

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const [state, action] = useActionState(inviteAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_200px_auto] md:items-end">
      <Field label="Nome" htmlFor="i-name">
        <Input id="i-name" name="name" required minLength={2} maxLength={120} />
      </Field>
      <Field label="E-mail" htmlFor="i-email">
        <Input id="i-email" name="email" type="email" required />
      </Field>
      <Field label="Papel" htmlFor="i-role">
        <Select id="i-role" name="role" defaultValue="editor">
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton>Criar acesso</SubmitButton>
      <div className="md:col-span-4">
        <FormMessage state={state} />
        {state.status === "ok" && state.data?.temporaryPassword ? (
          <div className="mt-2 rounded-md border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[13.5px] text-ink-200">
            Senha temporária de <strong>{state.data.email}</strong>: <code className="select-all rounded-[4px] bg-ink-950 px-2 py-0.5 font-mono text-ink-50 ring-1 ring-ink-700">{state.data.temporaryPassword}</code>
            <p className="mt-1 text-xs text-ink-400">Envie por um canal seguro. No primeiro acesso, a pessoa define uma senha nova.</p>
          </div>
        ) : null}
      </div>
    </ActionForm>
  );
}

export function MemberForm({
  member,
  roles,
  clients,
  isSelf,
}: {
  member: { userId: string; role: string; isActive: boolean; clientIds: string[] };
  roles: RoleOption[];
  clients: Array<{ id: string; name: string }>;
  isSelf: boolean;
}) {
  const [state, action] = useActionState(updateMemberAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={member.userId} />
      <div className="flex flex-wrap items-center gap-3">
        <Select name="role" defaultValue={member.role} disabled={isSelf} aria-label="Papel" className="w-44">
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
        {isSelf ? <input type="hidden" name="role" value={member.role} /> : null}
        <label className="flex items-center gap-2 text-sm text-ink-200">
          <input type="checkbox" name="isActive" defaultChecked={member.isActive} disabled={isSelf} className="accent-iris-400" />
          Ativo
        </label>
        {isSelf ? <input type="hidden" name="isActive" value="on" /> : null}
      </div>
      {!["owner", "admin"].includes(member.role) ? (
        <fieldset>
          <legend className="mb-1 text-xs text-ink-400">Clientes com acesso</legend>
          <div className="flex flex-wrap gap-2">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-200 has-[:checked]:border-iris-400/70 has-[:checked]:bg-iris-400/[0.06]">
                <input type="checkbox" name="clientIds" value={c.id} defaultChecked={member.clientIds.includes(c.id)} className="accent-iris-400" />
                {c.name}
              </label>
            ))}
            {clients.length === 0 ? <span className="text-xs text-ink-400">Nenhum cliente cadastrado.</span> : null}
          </div>
        </fieldset>
      ) : (
        <p className="text-xs text-ink-400">Proprietários e administradores acessam todos os clientes.</p>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" size="sm">
          Salvar
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </ActionForm>
  );
}

/** Gera nova senha temporária (troca obrigatória no próximo acesso; sessões atuais são encerradas). */
export function ResetPasswordForm({ userId, email }: { userId: string; email: string }) {
  const [state, action] = useActionState(resetPasswordAction, { status: "idle" });
  return (
    <ActionForm
      action={action}
      state={state}
      confirmMessage={`Gerar uma nova senha temporária para ${email}? A senha atual deixa de funcionar e as sessões abertas são encerradas.`}
      className="mt-2 flex flex-col gap-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="email" value={email} />
      <div>
        <SubmitButton variant="ghost" size="sm" pendingText="Gerando...">
          Gerar nova senha temporária
        </SubmitButton>
      </div>
      <FormMessage state={state} />
      {state.status === "ok" && state.data?.temporaryPassword ? (
        <div className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[13.5px] text-ink-200">
          Nova senha temporária: <code className="select-all rounded-[4px] bg-ink-950 px-2 py-0.5 font-mono text-ink-50 ring-1 ring-ink-700">{state.data.temporaryPassword}</code>
          <p className="mt-1 text-xs text-ink-400">Exibida uma única vez. Envie por um canal seguro; ela expira em 7 dias e deve ser trocada no primeiro acesso.</p>
        </div>
      ) : null}
    </ActionForm>
  );
}
