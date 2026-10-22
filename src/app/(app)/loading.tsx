export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-64 rounded-lg bg-ink-800" />
      <div className="h-4 w-96 max-w-full rounded bg-ink-800/70" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-ink-850" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-ink-850" />
    </div>
  );
}
