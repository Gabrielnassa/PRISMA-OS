"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { inviteAction, updateMemberAction } from "./actions";

type RoleOption = { id: string; label: string; description: string };

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const [state, action] = useActionState(inviteAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_200px_auto] md:items-end">
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
          <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-sm">
            Senha temporária de <strong>{state.data.email}</strong>: <code className="select-all rounded bg-ink-900 px-2 py-0.5 font-mono text-violet-200">{state.data.temporaryPassword}</code>
            <p className="mt-1 text-xs text-ink-400">Envie por um canal seguro. A pessoa deverá trocá-la no primeiro acesso. O envio por e-mail depende da integração de e-mail (fase 3).</p>
          </div>
        ) : null}
      </div>
    </form>
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
    <form action={action} className="flex flex-col gap-3">
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
          <input type="checkbox" name="isActive" defaultChecked={member.isActive} disabled={isSelf} className="accent-violet-500" />
          Ativo
        </label>
        {isSelf ? <input type="hidden" name="isActive" value="on" /> : null}
      </div>
      {!["owner", "admin"].includes(member.role) ? (
        <fieldset>
          <legend className="mb-1 text-xs text-ink-400">Clientes com acesso</legend>
          <div className="flex flex-wrap gap-2">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-200 has-[:checked]:border-violet-500">
                <input type="checkbox" name="clientIds" value={c.id} defaultChecked={member.clientIds.includes(c.id)} className="accent-violet-500" />
                {c.name}
              </label>
            ))}
            {clients.length === 0 ? <span className="text-xs text-ink-500">Nenhum cliente cadastrado.</span> : null}
          </div>
        </fieldset>
      ) : (
        <p className="text-xs text-ink-500">Proprietários e administradores acessam todos os clientes.</p>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" size="sm">
          Salvar
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
