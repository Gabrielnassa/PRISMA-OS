export function PrismaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="pm-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="pm-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <path d="M32 8 L9 53 H55 Z" fill="none" stroke="url(#pm-a)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M32 8 L42 53" stroke="url(#pm-b)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function PrismaWordmark() {
  return (
    <span className="flex items-center gap-2">
      <PrismaMark />
      <span className="font-display text-lg font-bold tracking-wide text-ink-50">
        PRISMA <span className="prisma-gradient-text">OS</span>
      </span>
    </span>
  );
}
