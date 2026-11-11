import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listInbox } from "@/server/services/inbox";
import { Card, EmptyState, PageHeader, cx, formatDateTime, formatRelative } from "@/components/ui";
import { InlineAction } from "@/components/inline-action";
import { readAllAction } from "./actions";

export const metadata: Metadata = { title: "Avisos" };

export default async function InboxPage() {
  const auth = await requireAuth();
  const { items, unread } = await listInbox(auth, 100);
  return (
    <>
      <PageHeader
        title="Avisos"
        description={unread ? (unread === 1 ? "1 não lido" : `${unread} não lidos`) : undefined}
        actions={unread ? <InlineAction action={readAllAction} fields={{}} label="Marcar tudo como lido" /> : null}
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum aviso"
          description="Pedidos de aprovação, decisões dos clientes, peças passadas para você e publicações aparecem aqui."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-800">
            {items.map((n) => (
              <li key={n.id}>
                <a
                  href={`/avisos/${n.id}`}
                  className={cx(
                    "flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-ink-850/60",
                    n.read && "opacity-70",
                  )}
                >
                  <span
                    aria-hidden
                    className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-iris-400")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-[14px]", n.read ? "text-ink-200" : "font-medium text-ink-50")}>
                      {n.title}
                    </span>
                    {n.body ? <span className="mt-0.5 block truncate text-[12.5px] text-ink-400">{n.body}</span> : null}
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-400" title={formatDateTime(n.createdAt)}>
                    {formatRelative(n.createdAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
