import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Estado: neutro para o que é normal; âmbar (warning) e vermelho (danger) só
 * para atraso e falha; verde (success) só no ponto de algo concluído. Sem fundo
 * colorido. `info`, `accent` e `ember` ficam por compatibilidade e saem neutros
 * (o ponto de `accent` usa o acento).
 */
export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "accent" | "ember";

const TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  info: "text-muted",
  warning: "text-warn",
  success: "text-muted",
  danger: "text-danger",
  accent: "text-muted",
  ember: "text-warn",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-faint",
  info: "bg-faint",
  warning: "bg-warn",
  success: "bg-ok",
  danger: "bg-danger",
  accent: "bg-accent",
  ember: "bg-warn",
};

/** Etiqueta curta (origem, papel, situação): texto com contorno fino. */
export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-5 items-center gap-1 rounded-sm border border-line px-1.5 text-sm font-medium whitespace-nowrap",
        TEXT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Estado em texto com um ponto de 6 px. */
export function Dot({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-2 text-base whitespace-nowrap text-fg", className)}>
      <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
