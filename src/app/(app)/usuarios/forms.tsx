"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { inviteAction, resetPasswordAction, updateMemberAction } from "./actions";

type RoleOption = { id: string; label: string; description: string };

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const [state, action] = useActionState(inviteAction, { status: "idle" });
  return (
    <ActionForm
      action={action}
      state={state}
      resetOnSuccess
      className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_200px_auto] md:items-end"
    >
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
          <div className="mt-2 rounded-md border border-warn/40 bg-warn/5 p-3 text-base text-fg">
            Senha temporária de <strong>{state.data.email}</strong>:{" "}
            <code className="rounded-sm bg-bg px-2 py-0.5 font-mono text-fg ring-1 ring-line select-all">
              {state.data.temporaryPassword}
            </code>
            <p className="mt-1 text-sm text-muted">
              Envie por um canal seguro. No primeiro acesso, a pessoa define uma senha nova.
            </p>
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
        <label className="flex items-center gap-2 text-base text-fg">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={member.isActive}
            disabled={isSelf}
            className="accent-accent"
          />
          Ativo
        </label>
        {isSelf ? <input type="hidden" name="isActive" value="on" /> : null}
      </div>
      {!["owner", "admin"].includes(member.role) ? (
        <fieldset>
          <legend className="mb-1 text-sm text-muted">Clientes com acesso</legend>
          <div className="flex flex-wrap gap-2">
            {clients.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-sm text-fg has-[:checked]:border-accent/70 has-[:checked]:bg-accent/5"
              >
                <input
                  type="checkbox"
                  name="clientIds"
                  value={c.id}
                  defaultChecked={member.clientIds.includes(c.id)}
                  className="accent-accent"
                />
                {c.name}
              </label>
            ))}
            {clients.length === 0 ? <span className="text-sm text-muted">Nenhum cliente cadastrado.</span> : null}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-muted">Proprietários e administradores acessam todos os clientes.</p>
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
        <div className="rounded-md border border-warn/40 bg-warn/5 p-3 text-base text-fg">
          Nova senha temporária:{" "}
          <code className="rounded-sm bg-bg px-2 py-0.5 font-mono text-fg ring-1 ring-line select-all">
            {state.data.temporaryPassword}
          </code>
          <p className="mt-1 text-sm text-muted">
            Exibida uma única vez. Envie por um canal seguro; ela expira em 7 dias e deve ser trocada no primeiro
            acesso.
          </p>
        </div>
      ) : null}
    </ActionForm>
  );
}
