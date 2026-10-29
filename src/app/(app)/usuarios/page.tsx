import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listMembers } from "@/server/services/users";
import { listClients } from "@/server/services/clients";
import { can, permissionsFor, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/server/authz/permissions";
import { Badge, Card, CardHeader, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import { InviteForm, MemberForm, ResetPasswordForm } from "./forms";

export const metadata: Metadata = { title: "Usuários e permissões" };

export default async function UsersPage() {
  const auth = await requireAuth();
  if (!can(auth.role, "users.manage")) return <EmptyState title="Acesso restrito" description="Somente proprietários e administradores gerenciam usuários." />;
  const [members, clients] = await Promise.all([listMembers(auth), listClients(auth, { includeArchived: true })]);
  const roles = ROLES.filter((r) => r !== "owner" || auth.role === "owner").map((r) => ({ id: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] }));
  return (
    <>
      <PageHeader title="Usuários e permissões" description="Permissões são verificadas no servidor e no banco (RLS), não apenas escondidas na interface." />
      <Card className="mb-6">
        <CardHeader title="Novo acesso" />
        <InviteForm roles={roles} />
      </Card>
      <Card className="mb-6">
        <CardHeader title="Membros" description={`${members.length} pessoa(s)`} />
        <ul className="divide-y divide-ink-800">
          {members.map((m) => (
            <li key={m.userId} className="grid gap-3 px-5 py-4 md:grid-cols-[260px_1fr]">
              <div>
                <div className="font-medium text-ink-100">
                  {m.name} {m.userId === auth.userId ? <Badge tone="accent">você</Badge> : null}
                </div>
                <div className="text-xs text-ink-400">{m.email}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge>{ROLE_LABELS[m.role]}</Badge>
                  {!m.isActive ? <Badge tone="danger">Inativo</Badge> : null}
                </div>
                <div className="mt-1 text-[11px] text-ink-400">Último acesso: {formatDateTime(m.lastLoginAt)}</div>
                {m.userId !== auth.userId && (m.role !== "owner" || auth.role === "owner") ? <ResetPasswordForm userId={m.userId} email={m.email} /> : null}
              </div>
              {m.role === "owner" && auth.role !== "owner" ? (
                <p className="text-xs text-ink-400">Somente proprietários alteram proprietários.</p>
              ) : (
                <MemberForm member={m} roles={roles} clients={clients.map((c) => ({ id: c.id, name: c.name }))} isSelf={m.userId === auth.userId} />
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Papéis" />
        <ul className="divide-y divide-ink-800">
          {ROLES.map((r) => (
            <li key={r} className="px-5 py-3 text-sm">
              <div className="font-medium text-ink-100">{ROLE_LABELS[r]}</div>
              <div className="text-ink-400">{ROLE_DESCRIPTIONS[r]}</div>
              <div className="mt-1 tabular text-[11px] text-ink-400">{permissionsFor(r).join(" · ")}</div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
