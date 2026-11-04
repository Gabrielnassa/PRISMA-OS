import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth/next";
import { can } from "@/server/authz/permissions";
import { NotFoundError } from "@/server/errors";
import { assertMonth, monthlyReport } from "@/server/services/reports";
import { currentMonth, shiftMonth } from "@/server/services/editorial";
import { ReportView } from "@/components/report/report-view";
import { ReportToolbar } from "./toolbar";

export const metadata: Metadata = { title: "Relatório" };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ mes?: string }> }) {
  const auth = await requireAuth();
  const { clientId } = await params;
  const month = assertMonth((await searchParams).mes, currentMonth());
  const r = await monthlyReport(auth, clientId, month).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const href = (m: string) => `/relatorios/${clientId}?mes=${m}`;
  return (
    <div className="min-h-dvh bg-white print:bg-white">
      <ReportToolbar
        clientId={clientId}
        clientName={r.clientName}
        month={month}
        prevHref={href(shiftMonth(month, -1))}
        nextHref={href(shiftMonth(month, 1))}
        backHref={`/clientes/${clientId}`}
        canShare={can(auth.role, "approval.share")}
      />
      <ReportView r={r} coverSrc={(p) => `/api/contents/${p.contentId}/versions/${p.versionId}/slides/0`} />
    </div>
  );
}
