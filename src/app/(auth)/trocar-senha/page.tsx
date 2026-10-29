import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/next";
import { AuthShell } from "../auth-shell";
import { PasswordForm } from "../../(app)/configuracoes/forms";
import { logoutAction } from "../../(app)/actions";

export const metadata: Metadata = { title: "Definir nova senha" };

/** Primeiro acesso com senha temporária: nada mais fica disponível até a troca. */
export default async function ChangePasswordPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.mustChangePassword) redirect("/");
  return (
    <AuthShell>
      <h1 className="font-display text-[34px] font-medium leading-tight tracking-[-0.04em] text-ink-50">Defina sua senha</h1>
      <p className="mb-6 mt-3 text-[14.5px] leading-relaxed text-ink-400">
        Olá, {auth.userName}. Você entrou com uma senha temporária criada pelo administrador. Escolha uma senha pessoal para continuar.
      </p>
      <div className="-mx-5 rounded-[var(--radius-card)] border border-ink-800 bg-ink-900">
        <PasswordForm redirectTo="/" stacked />
      </div>
      <form action={logoutAction} className="mt-6 text-right">
        <button type="submit" className="text-[13px] text-ink-400 hover:text-ink-100">
          Sair
        </button>
      </form>
    </AuthShell>
  );
}
