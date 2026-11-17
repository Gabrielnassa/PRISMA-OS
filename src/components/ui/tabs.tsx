import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Abas com sublinhado. */
export function TabLinks({
  tabs,
  active,
}: {
  tabs: Array<{ id: string; label: ReactNode; href: string }>;
  active: string;
}) {
  return (
    <nav className="mb-6 flex gap-5 overflow-x-auto border-b border-line" aria-label="Seções">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={cx(
            "-mb-px flex h-9 items-center border-b-2 text-base font-medium whitespace-nowrap transition-colors",
            t.id === active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
