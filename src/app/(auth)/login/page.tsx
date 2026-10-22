import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/next";
import { PrismaWordmark } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getAuth()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-80 w-[36rem] rounded-full bg-teal-500/10 blur-3xl" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <PrismaWordmark />
          <p className="text-xs uppercase tracking-[0.25em] text-ink-400">
            Sua agência no piloto automático. <span className="prisma-gradient-text font-semibold">Você no controle.</span>
          </p>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900/90 p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <h1 className="mb-1 font-display text-xl font-bold text-ink-50">Entrar</h1>
          <p className="mb-5 text-sm text-ink-400">Use o acesso fornecido pelo administrador da agência.</p>
          <LoginForm next={next ?? "/"} />
        </div>
        <p className="mt-6 text-center text-xs text-ink-500">
          Primeiro acesso? O administrador cria a organização com <code className="text-ink-300">npm run admin:create</code>.
        </p>
      </div>
    </main>
  );
}
