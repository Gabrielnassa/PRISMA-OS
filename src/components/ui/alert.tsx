import type { ReactNode } from "react";
import { cx } from "./cx";

const DOT = {
  info: "bg-faint",
  warning: "bg-warn",
  danger: "bg-danger",
  success: "bg-ok",
} as const;

/** Aviso em uma linha: ponto de estado, título e texto, sem cartão nem barra lateral. */
export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className="flex items-start gap-2 py-1 text-base text-muted">
      <span aria-hidden className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", DOT[tone])} />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        {title ? <span className="font-medium text-fg">{title}</span> : null}
        {title && children ? (
          <span aria-hidden className="text-faint">
            ·
          </span>
        ) : null}
        {children ? <div className="min-w-0">{children}</div> : null}
      </div>
    </div>
  );
}
