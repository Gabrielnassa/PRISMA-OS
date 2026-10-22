"use client";

import { Button } from "@/components/ui";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center" role="alert">
      <h1 className="font-display text-lg font-semibold text-red-100">Algo deu errado ao carregar esta página</h1>
      <p className="mt-2 text-sm text-red-100/80">A falha foi registrada{error.digest ? ` (código ${error.digest})` : ""}. Tente novamente; se persistir, avise o administrador.</p>
      {/* retry() busca a página de novo no servidor (reset() só repetiria o mesmo erro). */}
      <Button className="mt-4" variant="secondary" onClick={() => retry()}>
        Tentar novamente
      </Button>
    </div>
  );
}
