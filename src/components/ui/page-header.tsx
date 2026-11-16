import type { ReactNode } from "react";

/**
 * Barra de topo da página: 48 px, fixa no alto, com o contexto (`eyebrow`,
 * ex.: "Clientes / Café da Esquina"), o título e as ações. A descrição, quando
 * existe, fica logo abaixo, no corpo da página.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <>
      <header className="sticky top-12 z-30 -mx-4 mb-5 flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-bg px-4 py-2 md:-mx-7 md:px-7 lg:top-0">
        <div className="flex min-w-0 items-baseline gap-2">
          {eyebrow ? (
            <>
              <span className="truncate text-base text-muted">{eyebrow}</span>
              <span aria-hidden className="text-faint">
                /
              </span>
            </>
          ) : null}
          <h1 className="truncate text-md font-semibold text-fg">{title}</h1>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {description ? <p className="-mt-1 mb-5 max-w-3xl text-base text-muted">{description}</p> : null}
    </>
  );
}
