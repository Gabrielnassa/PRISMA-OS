"use client";

import { createContext, use, useActionState, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ActionState } from "@/server/actions";
import { cx } from "./ui";

type Toast = { id: number; tone: "success" | "error"; text: string };
const ToastContext = createContext<(tone: Toast["tone"], text: string) => void>(() => {});

/** Aviso rápido de resultado ("Salvo", "Excluído"). Some sozinho; erros ficam mais tempo. */
export function useToast() {
  return use(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    setToasts((t) => [...t.slice(-2), { id: Date.now() + Math.random(), tone, text }]);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => setToasts((all) => all.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, toast.tone === "error" ? 7000 : 4000);
    return () => clearTimeout(timer);
  }, [toast, onDone]);
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="toast-enter pointer-events-auto flex max-w-md items-start gap-2.5 rounded-full border border-ink-700 bg-ink-850 py-2.5 pl-4 pr-3 text-[13.5px] text-ink-50 shadow-[0_4px_16px_rgb(0_0_0/0.35)]"
    >
      <span aria-hidden className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", toast.tone === "error" ? "bg-red-400" : "bg-emerald-400")} />
      <span className="flex-1">{toast.text}</span>
      <button type="button" onClick={onDone} className="-my-0.5 rounded-full px-1.5 text-ink-400 hover:text-ink-50" aria-label="Fechar aviso">
        ×
      </button>
    </div>
  );
}

/**
 * useActionState que avisa o resultado (toast) assim que a ação termina. O
 * aviso sai do próprio retorno da ação: aparece mesmo quando o formulário some
 * da tela com a atualização (ex.: botão trocado depois de concluir).
 */
export function useToastAction<T>(serverAction: (prev: ActionState<T>, form: FormData) => Promise<ActionState<T>>) {
  const toast = useToast();
  return useActionState(async (prev: ActionState<T>, form: FormData) => {
    const r = await serverAction(prev, form);
    if (r.status === "ok" && r.message) toast("success", r.message);
    return r;
  }, { status: "idle" } as ActionState<T>);
}
