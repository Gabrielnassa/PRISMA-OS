import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/next";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getAuth()) redirect("/");
  const { next } = await searchParams;
  return (
    <AuthShell>
      <h1 className="text-lg leading-none font-semibold text-fg">Entrar</h1>
      <p className="mt-3 mb-8 text-md leading-relaxed text-muted">Use o e-mail e a senha da sua conta.</p>
      <LoginForm next={next ?? "/"} />
      <p className="mt-8 border-t border-line pt-5 text-base leading-relaxed text-muted">
        Esqueceu a senha? Peça uma nova ao administrador da agência.
      </p>
    </AuthShell>
  );
}
