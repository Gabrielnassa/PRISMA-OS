/**
 * Marca do PRISMA OS: um prisma de duas faces (luz e íris) com a saída quente
 * em coral. A face clara usa a cor do texto, para aparecer nos dois temas.
 */
export function PrismaMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`text-fg ${className ?? ""}`}>
      <path d="M32 8 L8 55 H37.5 Z" fill="currentColor" />
      <path d="M33.6 8.6 L56 55 H40 Z" fill="#5683da" />
      <path d="M50.6 43.8 L56 55 H45.2 Z" fill="#ff8964" />
    </svg>
  );
}

export function PrismaWordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <PrismaMark size={20} />
      <span className="text-md font-semibold text-fg">Prisma</span>
    </span>
  );
}
