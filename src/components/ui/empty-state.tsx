import type { ReactNode } from "react";

/** Lista vazia: uma linha de texto e a ação, sem caixa. `icon` é aceito e não aparece. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-base">
      <span className="text-fg">{title}</span>
      {description ? <span className="text-muted">{description}</span> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
