import type { ReactNode } from "react";
import Image from "next/image";
import { PrismaWordmark } from "@/components/brand/logo";

const HIGHLIGHTS: Array<[string, string]> = [
  ["Conteúdo", "Briefing, texto, arte, revisão e aprovação no mesmo fluxo"],
  ["Marca", "Perfil, memória e arquivos isolados por cliente"],
  ["Controle", "Versões, aprovação por versão e custos de IA por cliente"],
];

/**
 * Moldura das telas de acesso: formulário à esquerda e, no desktop, a vitrine
 * da marca. É o único lugar com o feixe de luz (íris → coral → branco): um
 * risco vertical estreito, nunca o fundo inteiro.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-ink-950 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <PrismaWordmark />
        <div className="page-enter mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-[11.5px] text-ink-400">Acesso restrito à equipe da agência.</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-ink-800 lg:block">
        {/* Feixe aurora */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-[58%] top-[-10%] h-[85%] w-[16%] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgb(86_131_218/0)_0%,rgb(86_131_218/0.55)_35%,rgb(255_137_100/0.75)_72%,rgb(255_255_255/0.9)_100%)] blur-[42px]" />
          <div className="absolute left-[58%] top-[-10%] h-[80%] w-[2px] -translate-x-1/2 bg-[linear-gradient(180deg,transparent,rgb(195_211_245/0.9)_40%,#ffffff)]" />
          <div className="absolute bottom-[-30%] left-[58%] size-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_170_129/0.38)_0%,rgb(255_218_159/0.12)_45%,transparent_70%)]" />
        </div>
        <div className="relative flex h-full flex-col justify-between px-12 py-10">
          <div className="max-w-lg">
            <p className="font-display text-[44px] font-medium leading-[0.98] tracking-[-0.05em] text-white">
              Do briefing à peça aprovada, sem perder o controle.
            </p>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-300">A central de conteúdo da agência: marca, criação com IA, aprovação e custos de cada cliente.</p>
          </div>
          {/* O próprio produto é a imagem: captura real da tela inicial. */}
          <figure className="relative -mr-24 mt-10 overflow-hidden rounded-[var(--radius-card)] border border-ink-700 shadow-[0_6px_25px_rgb(0_0_0/0.5)]">
            <Image src="/produto.png" alt="Tela inicial do PRISMA OS com indicadores de produção" width={1440} height={1000} className="h-auto w-full" priority />
          </figure>
          <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-ink-800 pt-5">
            {HIGHLIGHTS.map(([k, v]) => (
              <div key={k} className="text-[12.5px]">
                <dt className="font-medium text-ink-100">{k}</dt>
                <dd className="mt-1 leading-relaxed text-ink-400">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </main>
  );
}
