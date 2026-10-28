/** Marca do PRISMA OS: um prisma de duas faces (luz e cor), sem degradês. */
export function PrismaMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <path d="M32 8 L8 55 H37.5 Z" fill="#f4f5f8" />
      <path d="M33.6 8.6 L56 55 H40 Z" fill="#8b5cf6" />
    </svg>
  );
}

export function PrismaWordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <PrismaMark />
      <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink-50">Prisma</span>
      <span className="rounded-[4px] border border-ink-600 px-1 font-mono text-[10px] font-medium leading-4 tracking-wide text-ink-400">OS</span>
    </span>
  );
}
