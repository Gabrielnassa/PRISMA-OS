import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listPendingApprovals } from "@/server/services/content";
import { can } from "@/server/authz/permissions";
import { FORMAT_LABELS } from "@/lib/content/document";
import { Badge, Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Aprovações" };

export default async function ApprovalsPage() {
  const auth = await requireAuth();
  const items = await listPendingApprovals(auth);
  return (
    <>
      <PageHeader
        title="Aprovações"
        description={can(auth.role, "content.approve") ? "Peças aguardando sua decisão. Cada aprovação vale apenas para a versão exata enviada." : "Peças aguardando aprovação (seu papel permite acompanhar, não decidir)."}
      />
      {items.length === 0 ? (
        <EmptyState title="Nada aguardando aprovação" description="Quando a equipe enviar uma versão para aprovação, ela aparecerá aqui." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <li key={a.approvalId}>
              <Card className="flex h-full flex-col overflow-hidden">
                <Link href={`/conteudos/${a.contentId}`} className="block bg-ink-850">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/contents/${a.contentId}/versions/${a.versionId}/slides/0`} alt={`Capa de ${a.title}`} className="mx-auto max-h-72 w-auto" loading="lazy" />
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <Link href={`/conteudos/${a.contentId}`} className="font-medium text-ink-50 underline-offset-4 hover:underline">
                    {a.title}
                  </Link>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge>{a.clientName}</Badge>
                    <Badge>{FORMAT_LABELS[a.format]}</Badge>
                    <Badge tone="accent">v{a.versionNumber}</Badge>
                    {a.warningCount ? <Badge tone="warning">{a.warningCount} alerta(s) de qualidade</Badge> : null}
                  </div>
                  <p className="text-xs text-ink-400">
                    Pedido por {a.requestedByName ?? "—"} em {formatDateTime(a.requestedAt)}
                  </p>
                  {a.requestNote ? <p className="text-sm text-ink-200">“{a.requestNote}”</p> : null}
                  <div className="mt-auto pt-2">
                    <Link href={`/conteudos/${a.contentId}`} className="text-sm font-medium text-violet-300 hover:underline">
                      Revisar e decidir →
                    </Link>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
