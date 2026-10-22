import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="font-display text-5xl font-bold prisma-gradient-text">404</div>
      <h1 className="font-display text-xl font-semibold text-ink-50">Página não encontrada</h1>
      <p className="max-w-md text-sm text-ink-400">O registro não existe ou você não tem acesso a ele.</p>
      <Link href="/" className="text-sm font-medium text-violet-300 hover:underline">
        Voltar ao dashboard
      </Link>
    </main>
  );
}
