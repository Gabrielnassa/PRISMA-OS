"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status = { status: string; job: { status: string; attempts: number; maxAttempts: number; lastError: string | null } | null };

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
    <div className="relative flex items-start gap-4 overflow-hidden rounded-[var(--radius-card)] border border-ink-800 bg-ink-900 p-5 pl-6" role="status" aria-live="polite">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-sky-400" />
      <span className="mt-1 size-5 shrink-0 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" aria-hidden />
      <div className="text-sm">
        <div className="font-semibold text-sky-100">Gerando conteúdo</div>
        <p className="mt-1 text-sky-100/80">
          {job?.status === "queued" && job.attempts === 0
            ? "Na fila. O worker processa os pedidos em ordem."
            : job?.status === "queued"
              ? `Nova tentativa agendada (${job.attempts}/${job.maxAttempts}) após falha temporária: ${job.lastError ?? ""}`
              : job?.status === "running"
                ? `Em execução (tentativa ${job.attempts}/${job.maxAttempts}): direção de arte, texto, renderização e controle de qualidade.`
                : "Verificando o andamento..."}
        </p>
        <p className="mt-2 text-xs text-sky-100/60">Se nada acontecer, verifique se o worker está rodando (npm run worker).</p>
      </div>
    </div>
  );
}
