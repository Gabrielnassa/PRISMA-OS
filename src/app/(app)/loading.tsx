export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <div className="h-3 w-40 rounded bg-ink-850" />
      <div className="mt-4 h-9 w-72 max-w-full rounded bg-ink-850" />
      <div className="mt-3 h-3.5 w-[28rem] max-w-full rounded bg-ink-900" />
      <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-ink-800 bg-ink-800 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-ink-900" />
        ))}
      </div>
      <div className="mt-6 h-72 rounded-[var(--radius-card)] border border-ink-800 bg-ink-900" />
    </div>
  );
}
