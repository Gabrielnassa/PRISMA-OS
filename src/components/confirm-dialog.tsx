"use client";

import { useEffect, useRef } from "react";
import { Button } from "./ui";

/**
 * Janela de confirmação do sistema (no lugar de window.confirm). Usa o
 * elemento <dialog> nativo em modo modal: foco preso dentro dela, Esc cancela
 * e o fundo fica inerte. O botão de confirmar recebe o foco ao abrir.
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel = "Confirmar",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      confirmRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Confirmação"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // Clique fora do conteúdo (no fundo) cancela.
        if (e.target === ref.current) onCancel();
      }}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[var(--radius-card)] border border-ink-700 bg-ink-900 p-0 text-ink-100 shadow-[0_6px_25px_rgb(0_0_0/0.5)] backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5">
        <p className="text-[14.5px] leading-relaxed text-ink-100">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button ref={confirmRef} type="button" variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
