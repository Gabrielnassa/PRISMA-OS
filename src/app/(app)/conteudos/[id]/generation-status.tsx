"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status = {
  status: string;
  job: { status: string; attempts: number; maxAttempts: number; lastError: string | null } | null;
};

/** Acompanha a tarefa de geração e atualiza a página ao concluir. */
export function GenerationStatus({ contentId }: { contentId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Status | null>(null);
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/contents/${contentId}/status`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as Status;
          if (stop) return;
          setData(json);
          if (json.status !== "generating") {
            router.refresh();
            return;
          }
        }
      } catch {
        // rede instável: tenta de novo no próximo ciclo
      }
      if (!stop) setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, [contentId, router]);

  const job = data?.job;
  return (
    <div
      className="relative flex items-start gap-4 overflow-hidden rounded-md border border-line bg-surface p-5 pl-6"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-faint" />
      <span
        className="mt-1 size-5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent"
        aria-hidden
      />
      <div className="text-base">
        <div className="font-semibold text-fg">Gerando a peça</div>
        <p className="mt-1 text-muted">
          {job?.status === "queued" && job.attempts === 0
            ? "Na fila, aguardando a vez."
            : job?.status === "queued"
              ? `Falha temporária; nova tentativa em instantes (${job.attempts} de ${job.maxAttempts}). ${job.lastError ?? ""}`
              : job?.status === "running"
                ? job.attempts > 1
                  ? `Escrevendo os textos e montando a arte (tentativa ${job.attempts} de ${job.maxAttempts}).`
                  : "Escrevendo os textos e montando a arte."
                : "Verificando o andamento..."}
        </p>
        <p className="mt-2 text-sm text-muted">Costuma levar menos de um minuto.</p>
      </div>
    </div>
  );
}
