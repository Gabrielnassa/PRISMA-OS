import type { Metadata } from "next";
import { publicReport } from "@/server/services/reports";
import { ReportView } from "@/components/report/report-view";

export const metadata: Metadata = { title: "Relatório", robots: { index: false, follow: false } };

/** Relatório do mês pelo link enviado ao cliente (só leitura, 30 dias). */
export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await publicReport(token);
  return (
    <div className="min-h-dvh bg-white">
      {r ? (
        <ReportView r={r} coverSrc={(p) => `/api/publico/relatorio/${token}/${p.contentId}`} />
      ) : (
        <div className="mx-auto max-w-md px-6 py-24 text-zinc-800">
          <h1 className="font-display text-[28px] font-medium tracking-[-0.04em] text-zinc-950">
            Relatório indisponível
          </h1>
          <p className="mt-2 text-[14.5px] text-zinc-500">O link expirou ou não existe mais. Peça um novo à agência.</p>
        </div>
      )}
    </div>
  );
}
