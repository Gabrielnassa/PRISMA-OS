import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listClients } from "@/server/services/clients";
import { can } from "@/server/authz/permissions";
import { EmptyState, PageHeader } from "@/components/ui";
import { SkillForm } from "../skill-form";

export const metadata: Metadata = { title: "Nova skill" };

export default async function NewSkillPage() {
  const auth = await requireAuth();
  if (!can(auth.role, "skills.manage")) {
    return <EmptyState title="Sem permissão" description="Só proprietários e administradores criam skills. As existentes podem ser usadas em Skills." />;
  }
  const clients = (await listClients(auth)).filter((c) => c.status !== "archived");
  return (
    <>
      <PageHeader eyebrow="Skills" title="Nova skill" />
      <SkillForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
