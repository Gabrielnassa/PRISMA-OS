"use client";

import { useFormStatus } from "react-dom";
import { createContext, use, useEffect, useRef, useTransition, type ComponentProps } from "react";
import { buttonClass, cx } from "./ui";
import type { ActionState } from "@/server/actions";

const PendingContext = createContext(false);

/**
 * Formulário de Server Action que NÃO é limpo automaticamente pelo React 19 ao
 * terminar a ação: em caso de erro, tudo que a pessoa digitou continua no
 * formulário. Use `resetOnSuccess` para limpar depois de um envio bem-sucedido
 * e `confirmMessage` para pedir confirmação antes de ações irreversíveis.
 * Sem JavaScript, o envio continua funcionando pela própria Server Action.
 */
export function ActionForm({
  action,
  state,
  resetOnSuccess = false,
  confirmMessage,
  children,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
  state?: ActionState<unknown>;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
}) {
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.status === "ok") ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <PendingContext value={pending}>
      <form
        {...props}
        ref={ref}
        action={action}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          if (confirmMessage && !window.confirm(confirmMessage)) return;
          const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => action(formData));
        }}
      >
        {children}
      </form>
    </PendingContext>
  );
}

/** Se o formulário em volta está enviando (ação do React ou ActionForm). */
export function useFormPending(): boolean {
  const status = useFormStatus();
  return status.pending || use(PendingContext);
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  disabled,
  ...props
}: Omit<ComponentProps<"button">, "type"> & { pendingText?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const pending = useFormPending();
  return (
    <button {...props} type="submit" disabled={pending || disabled} aria-busy={pending} className={cx(buttonClass(variant, size), className)}>
      {pending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" aria-hidden />
          {pendingText ?? "Salvando..."}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState<unknown> }) {
  if (state.status === "error") {
    return (
      <p role="alert" className="flex items-start gap-2.5 rounded-md border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-[13.5px] leading-relaxed text-red-200">
        <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-red-400" />
        {state.message}
      </p>
    );
  }
  if (state.status === "ok" && state.message) {
    return (
      <p role="status" className="flex items-start gap-2.5 rounded-md border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-[13.5px] leading-relaxed text-emerald-100">
        <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-emerald-400" />
        {state.message}
      </p>
    );
  }
  return null;
}
