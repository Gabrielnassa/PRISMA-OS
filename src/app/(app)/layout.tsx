import { requireAuth } from "@/server/auth/next";
import { providerStatus } from "@/server/ai/gateway";
import { can, ROLE_LABELS } from "@/server/authz/permissions";
import { Sidebar, type ShellInfo } from "@/components/shell/sidebar";
import { ToastProvider } from "@/components/toast";
import { unreadCount } from "@/server/services/inbox";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  const provider = providerStatus();
  const info: ShellInfo = {
    organizationName: auth.organizationName,
    userName: auth.userName,
    roleLabel: ROLE_LABELS[auth.role],
    isAdmin: can(auth.role, "users.manage"),
    unread: await unreadCount(auth),
    ai: provider.configured
      ? provider.isDemo
        ? { state: "demo", label: "IA em demonstração", detail: provider.detail }
        : { state: "ready", label: `IA conectada · ${provider.model}`, detail: provider.detail }
      : { state: "off", label: "IA não conectada", detail: provider.detail },
  };
  return (
    <ToastProvider>
      <div className="min-h-dvh lg:flex">
        <Sidebar info={info} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pt-7 pb-16 sm:px-6 md:px-10 md:pt-10">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
