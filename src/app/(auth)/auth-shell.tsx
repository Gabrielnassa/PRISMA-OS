import type { ReactNode } from "react";
import { PrismaWordmark } from "@/components/brand/logo";

/** Ilustração do painel de acesso: um feixe de luz atravessando o prisma e se abrindo em cor. */
function PrismDiagram() {
  return (
    <svg viewBox="0 0 560 420" className="h-auto w-full max-w-[560px]" aria-hidden>
      <defs>
        <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="#14171d" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="560" height="420" fill="url(#grid)" />
      {/* feixe de entrada */}
      <path d="M0 262 L214 214" stroke="#c9cdd6" strokeWidth="1.25" />
      {/* prisma */}
      <path d="M280 70 L170 330 H390 Z" fill="#0b0c0f" stroke="#4a5060" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M280 70 L304 330" stroke="#2e3340" strokeWidth="1" />
      <path d="M287.4 74 L390 330 H307.6 Z" fill="#8b5cf6" fillOpacity="0.16" />
      {/* percurso interno */}
      <path d="M214 214 L338 196" stroke="#7a8191" strokeWidth="1" strokeDasharray="2 4" />
      {/* feixes de saída */}
      <path d="M338 196 L560 132" stroke="#a78bfa" strokeWidth="1.25" />
      <path d="M338 196 L560 176" stroke="#c9cdd6" strokeWidth="1" strokeOpacity="0.55" />
      <path d="M338 196 L560 222" stroke="#2dd4bf" strokeWidth="1.25" />
      {/* marcações de desenho técnico */}
      <g fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="#4a5060">
        <text x="20" y="236">briefing</text>
        <text x="482" y="140">texto</text>
        <text x="482" y="174">arte</text>
        <text x="482" y="232">aprovação</text>
      </g>
      <g stroke="#4a5060" strokeWidth="1">
        <path d="M170 352 V362 M390 352 V362 M170 357 H390" />
      </g>
    </svg>
  );
}

const COLOPHON: Array<[string, string]> = [
  ["Conteúdo", "Briefing, texto, arte, revisão e aprovação no mesmo fluxo"],
  ["Marca", "Perfil, memória e arquivos isolados por cliente"],
  ["Controle", "Versões imutáveis, aprovação por versão e auditoria"],
];

/** Moldura das telas de acesso: formulário à esquerda e painel da marca à direita (desktop). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <PrismaWordmark />
        <div className="page-enter mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12">{children}</div>
        <p className="font-mono text-[11px] text-ink-400">Acesso restrito à equipe da agência.</p>
      </div>
      <aside className="relative hidden flex-col justify-between overflow-hidden border-l border-ink-800 bg-ink-900 px-12 py-10 lg:flex">
        <div className="flex flex-1 items-center justify-center">
          <PrismDiagram />
        </div>
        <div>
          <p className="max-w-md font-display text-[26px] leading-snug text-ink-100">
            A operação de conteúdo da agência, <span className="italic text-ink-300">do briefing à peça aprovada.</span>
          </p>
          <dl className="mt-8 grid gap-2.5 border-t border-ink-800 pt-5">
            {COLOPHON.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[96px_1fr] gap-4 text-[12.5px]">
                <dt className="font-mono text-ink-400">{k}</dt>
                <dd className="text-ink-300">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </main>
  );
}
