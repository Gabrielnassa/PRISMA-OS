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
      <h1 className="font-display text-[38px] leading-none font-medium tracking-[-0.05em] text-ink-50">Entrar</h1>
      <p className="mt-3 mb-8 text-[14.5px] leading-relaxed text-ink-400">Use o e-mail e a senha da sua conta.</p>
      <LoginForm next={next ?? "/"} />
      <p className="mt-8 border-t border-ink-800 pt-5 text-[13px] leading-relaxed text-ink-400">
        Esqueceu a senha? Peça uma nova ao administrador da agência.
      </p>
    </AuthShell>
  );
}
