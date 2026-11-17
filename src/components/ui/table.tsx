import type { ReactNode } from "react";
import { cx } from "./cx";

/** Tabela sem moldura: linha de 34 px, células com 10 px nas laterais, divisória de 1 px. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cx(
        "h-8 border-b border-line px-2.5 text-xs font-medium tracking-[0.05em] whitespace-nowrap text-muted uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cx("h-[34px] border-b border-line px-2.5 py-1.5 align-middle text-fg", className)}>{children}</td>
  );
}
