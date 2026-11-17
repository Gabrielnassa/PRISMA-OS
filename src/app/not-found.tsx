import Link from "next/link";
import { PrismaMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <PrismaMark size={28} />
      <p className="tabular mt-6 text-sm text-muted">Erro 404</p>
      <h1 className="mt-2 text-lg leading-tight font-semibold text-fg">Página não encontrada</h1>
      <p className="mt-2 max-w-md text-md leading-relaxed text-muted">
        O endereço não existe ou você não tem acesso a ele.
      </p>
      <Link href="/" className="mt-6 text-base font-medium text-accent underline-offset-4 hover:underline">
        Voltar ao início
      </Link>
    </main>
  );
}
