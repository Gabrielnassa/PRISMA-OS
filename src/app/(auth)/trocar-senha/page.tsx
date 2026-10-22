import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/next";
import { PrismaWordmark } from "@/components/brand/logo";
import { PasswordForm } from "../../(app)/configuracoes/forms";
import { logoutAction } from "../../(app)/actions";

export const metadata: Metadata = { title: "Definir nova senha" };

/** Primeiro acesso com senha temporária: nada mais fica disponível até a troca. */
export default async function ChangePasswordPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.mustChangePassword) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex justify-center">
          <PrismaWordmark />
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl shadow-black/40">
          <div className="border-b border-ink-700 px-5 py-4">
            <h1 className="font-display text-xl font-bold text-ink-50">Defina sua senha</h1>
            <p className="mt-1 text-sm text-ink-400">
              Olá, {auth.userName}. Você entrou com uma senha temporária criada pelo administrador. Escolha uma senha pessoal para continuar.
            </p>
          </div>
          <PasswordForm redirectTo="/" />
          <form action={logoutAction} className="border-t border-ink-700 px-5 py-3 text-right">
            <button type="submit" className="text-sm text-ink-400 hover:text-ink-100">
              Sair
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
