import Link from "next/link";
import { PrismaMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <PrismaMark size={28} />
      <p className="mt-6 font-mono text-[12px] text-ink-400">Erro 404</p>
      <h1 className="mt-2 font-display text-[34px] font-medium leading-tight text-ink-50">Página não encontrada</h1>
      <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-400">O registro não existe ou você não tem acesso a ele.</p>
      <Link href="/" className="mt-6 text-[13.5px] font-medium text-violet-300 underline-offset-4 hover:underline">
        Voltar ao dashboard
      </Link>
    </main>
  );
}
