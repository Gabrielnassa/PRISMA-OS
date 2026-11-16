import type { ReactNode } from "react";
import Image from "next/image";
import { PrismaWordmark } from "@/components/brand/logo";

/**
 * Moldura das telas de acesso: formulário à esquerda e, no desktop, a própria
 * tela inicial do sistema como imagem, sobre um painel liso.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <PrismaWordmark />
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-xs text-muted">Acesso restrito à equipe da agência.</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:pl-14">
        <p className="max-w-md text-lg leading-[1.1] font-semibold text-fg">
          Pautas, peças, aprovações e publicações de todos os clientes num só lugar.
        </p>
        <figure className="mt-10 overflow-hidden rounded-l-[var(--radius-card)] border border-r-0 border-line">
          <Image
            src="/produto.png"
            alt="Tela inicial do PRISMA OS"
            width={1440}
            height={1000}
            className="h-auto w-full"
            priority
          />
        </figure>
      </aside>
    </main>
  );
}
