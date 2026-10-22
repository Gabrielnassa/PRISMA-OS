import Link from "next/link";
import { requireAuth } from "@/server/auth/next";
import { providerStatus } from "@/server/ai/gateway";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { Sidebar } from "@/components/shell/sidebar";
import { Badge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  const provider = providerStatus();
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-950/85 pl-14 pr-4 backdrop-blur md:pr-6 lg:pl-6">
          <div className="min-w-0 flex-1 truncate text-sm text-ink-300">
            <span className="font-medium text-ink-100">{auth.organizationName}</span>
          </div>
          <Link href="/integracoes" className="hidden sm:block" title={provider.detail}>
            {provider.configured ? (
              provider.isDemo ? (
                <Badge tone="warning">IA: modo demonstração</Badge>
              ) : (
                <Badge tone="teal">IA: {provider.model}</Badge>
              )
            ) : (
              <Badge tone="danger">IA não configurada</Badge>
            )}
          </Link>
          <div className="hidden text-right text-xs leading-tight md:block">
            <div className="font-medium text-ink-100">{auth.userName}</div>
            <div className="text-ink-400">{ROLE_LABELS[auth.role]}</div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="inline-flex size-9 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-800 hover:text-ink-50" title="Sair" aria-label="Sair">
              <Icon.logout />
            </button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
