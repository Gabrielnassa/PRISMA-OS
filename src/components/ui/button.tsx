import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

/**
 * Botão. Principal: neutro invertido, um por tela. Secundário: contorno.
 * Fantasma: ação de linha. Perigo: só dentro do diálogo de confirmação.
 * Altura de 28 px (sm, barras e tabelas) ou 32 px (md, formulários); no
 * celular, alvo de toque de 44 px.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";
const BUTTON: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:opacity-90 disabled:bg-surface-2 disabled:text-faint disabled:opacity-100",
  secondary:
    "border border-control text-fg hover:bg-surface-2 disabled:border-line disabled:text-faint disabled:hover:bg-transparent",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg disabled:text-faint disabled:hover:bg-transparent",
  danger: "border border-danger/50 text-danger hover:bg-danger/10 disabled:border-line disabled:text-faint",
  // Antes era a pílula branca da tela de acesso; agora é o principal.
  light: "bg-fg text-bg hover:opacity-90 disabled:bg-surface-2 disabled:text-faint disabled:opacity-100",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-sm text-base font-medium whitespace-nowrap transition-colors duration-100 select-none disabled:cursor-not-allowed max-md:h-11",
    size === "sm" ? "h-7 px-2.5" : "h-8 px-3",
    BUTTON[variant],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}
