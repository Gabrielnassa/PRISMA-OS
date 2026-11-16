/** Esqueletos de carregamento, um por tipo de tela: lista, formulário e peça. */

function Bar({ className }: { className: string }) {
  return <div className={`rounded-sm bg-surface-2 ${className}`} />;
}

function TopBar() {
  return (
    <div className="-mx-4 mb-5 flex h-12 items-center border-b border-line px-4 md:-mx-7 md:px-7">
      <Bar className="h-3.5 w-40" />
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <TopBar />
      <div className="divide-y divide-line border-y border-line">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-[34px] items-center gap-6 px-2.5">
            <Bar className="h-3 w-1/3" />
            <Bar className="h-3 w-24" />
            <Bar className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <TopBar />
      <div className="flex max-w-xl flex-col gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Bar className="h-3 w-28" />
            <Bar className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PieceSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <TopBar />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Bar className="aspect-square w-full max-w-xl" />
        <div className="flex flex-col gap-3">
          <Bar className="h-3 w-1/2" />
          <Bar className="h-24 w-full" />
          <Bar className="h-8 w-32" />
        </div>
      </div>
    </div>
  );
}
