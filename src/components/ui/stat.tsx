import type { ReactNode } from "react";
import { cx } from "./cx";

const STAT_TONES = {
  iris: "text-accent",
  ember: "text-warn",
  success: "text-ok",
  warning: "text-warn",
  danger: "text-danger",
} as const;

/** Número em linha: rótulo e valor em fonte mono, sem destaque de tamanho. */
export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof STAT_TONES;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 items-baseline gap-2 py-1", className)}>
      <span className="text-sm text-muted">{label}</span>
      <span className={cx("tabular font-mono text-base font-medium", tone ? STAT_TONES[tone] : "text-fg")}>
        {value}
      </span>
      {hint ? <span className="tabular truncate text-sm text-muted">{hint}</span> : null}
    </div>
  );
}

/** Faixa de números em uma linha, entre divisórias finas. */
export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-wrap gap-x-6 gap-y-1 border-y border-line py-1.5", className)}>{children}</div>;
}
