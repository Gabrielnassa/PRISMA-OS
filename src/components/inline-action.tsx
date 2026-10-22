"use client";

import { useActionState } from "react";
import type { ActionState } from "@/server/actions";
import { ActionForm, useFormPending } from "./form";
import { cx } from "./ui";

function InlineButton({ label, pendingText, tone }: { label: string; pendingText: string; tone: "neutral" | "danger" }) {
  const pending = useFormPending();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cx("text-xs hover:underline disabled:cursor-wait disabled:opacity-60", tone === "danger" ? "text-red-300" : "text-ink-300 hover:text-ink-50")}
    >
      {pending ? pendingText : label}
    </button>
  );
}

/**
 * Botão de ação em linha (remover, arquivar, restaurar...). Erros esperados
 * aparecem ao lado do botão, sem trocar a página pela tela de erro, e ações
 * irreversíveis pedem confirmação.
 */
export function InlineAction({
  action,
  fields,
  label,
  pendingText,
  confirmMessage,
  tone = "neutral",
  className,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  pendingText?: string;
  confirmMessage?: string;
  tone?: "neutral" | "danger";
  className?: string;
}) {
  const [state, dispatch] = useActionState(action, { status: "idle" });
  return (
    <ActionForm action={dispatch} state={state} confirmMessage={confirmMessage} className={className}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <InlineButton label={label} pendingText={pendingText ?? "Aguarde..."} tone={tone} />
      {state.status === "error" ? (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {state.message}
        </p>
      ) : null}
    </ActionForm>
  );
}
