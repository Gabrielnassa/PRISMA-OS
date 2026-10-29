"use client";

import { Button } from "@/components/ui";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-[var(--radius-card)] border border-ink-800 bg-ink-900 p-8" role="alert">
      <p className="tabular text-[12px] text-red-300">Falha ao carregar{error.digest ? ` · código ${error.digest}` : ""}</p>
      <h1 className="mt-2 font-display text-[28px] font-medium leading-tight tracking-[-0.04em] text-ink-50">Algo deu errado ao carregar esta página</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-400">A falha foi registrada. Tente novamente; se persistir, avise o administrador.</p>
      {/* retry() busca a página de novo no servidor (reset() só repetiria o mesmo erro). */}
      <Button className="mt-6" variant="secondary" onClick={() => retry()}>
        Tentar novamente
      </Button>
    </div>
  );
}
