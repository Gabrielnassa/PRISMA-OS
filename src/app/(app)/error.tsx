"use client";

import { Button } from "@/components/ui";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-md border border-line p-6" role="alert">
      <p className="tabular text-sm text-danger">Falha ao carregar{error.digest ? ` · código ${error.digest}` : ""}</p>
      <h1 className="mt-2 text-lg leading-tight font-semibold text-fg">Algo deu errado ao carregar esta página</h1>
      <p className="mt-2 text-base leading-relaxed text-muted">
        A falha foi registrada. Tente novamente; se persistir, avise o administrador.
      </p>
      {/* retry() busca a página de novo no servidor (reset() só repetiria o mesmo erro). */}
      <Button className="mt-6" variant="secondary" onClick={() => retry()}>
        Tentar novamente
      </Button>
    </div>
  );
}
