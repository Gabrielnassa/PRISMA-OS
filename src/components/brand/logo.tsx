/** Marca do PRISMA OS: um prisma de duas faces (luz e íris) com a saída quente em coral. */
export function PrismaMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <path d="M32 8 L8 55 H37.5 Z" fill="#ffffff" />
      <path d="M33.6 8.6 L56 55 H40 Z" fill="#5683da" />
      <path d="M50.6 43.8 L56 55 H45.2 Z" fill="#ff8964" />
    </svg>
  );
}

export function PrismaWordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <PrismaMark />
      <span className="font-display text-[18px] font-semibold tracking-[-0.04em] text-ink-50">Prisma</span>
      <span className="rounded-full border border-ink-600 px-1.5 text-[10px] font-medium leading-4 tracking-wide text-ink-300">OS</span>
    </span>
  );
}
