"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { buttonClass, cx } from "./ui";
import type { ActionState } from "@/server/actions";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={cx(buttonClass(variant, size), className)} {...props}>
      {pending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
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
      <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-200">
        {state.message}
      </p>
    );
  }
  if (state.status === "ok" && state.message) {
    return (
      <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200">
        {state.message}
      </p>
    );
  }
  return null;
}
