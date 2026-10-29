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
      <h1 className="font-display text-[38px] font-medium leading-none tracking-[-0.05em] text-ink-50">Entrar</h1>
      <p className="mb-8 mt-3 text-[14.5px] leading-relaxed text-ink-400">Use o e-mail e a senha fornecidos pelo administrador da agência.</p>
      <LoginForm next={next ?? "/"} />
      <p className="mt-8 border-t border-ink-800 pt-5 text-[13px] leading-relaxed text-ink-400">
        Esqueceu a senha? Peça ao administrador uma senha temporária nova em Usuários e permissões.
      </p>
    </AuthShell>
  );
}
