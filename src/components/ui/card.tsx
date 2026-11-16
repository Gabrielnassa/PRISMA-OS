import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/** Bloco com borda: só quando separa objetos de verdade. Sem fundo próprio. */
export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("min-w-0 rounded-md border border-line", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Título de seção fora de cartões (agrupa blocos da página). */
export function SectionTitle({
  children,
  aside,
  className,
}: {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex flex-wrap items-baseline justify-between gap-2", className)}>
      <h2 className="text-base font-semibold text-fg">{children}</h2>
      {aside ? <div className="text-sm text-muted">{aside}</div> : null}
    </div>
  );
}
