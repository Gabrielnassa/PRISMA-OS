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
      <h1 className="text-lg leading-tight font-semibold text-fg">Defina sua senha</h1>
      <p className="mt-3 mb-6 text-md leading-relaxed text-muted">
        Olá, {auth.userName}. Você entrou com uma senha temporária criada pelo administrador. Escolha uma senha pessoal
        para continuar.
      </p>
      <div className="-mx-5 rounded-md border border-line bg-surface">
        <PasswordForm redirectTo="/" stacked />
      </div>
      <form action={logoutAction} className="mt-6 text-right">
        <button type="submit" className="text-base text-muted hover:text-fg">
          Sair
        </button>
      </form>
    </AuthShell>
  );
}
