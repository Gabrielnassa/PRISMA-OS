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
    return <EmptyState title="Sem permissão" description="Só proprietários e administradores criam skills. Você pode usar as skills existentes em Agentes e skills." />;
  }
  const clients = (await listClients(auth)).filter((c) => c.status !== "archived");
  return (
    <>
      <PageHeader eyebrow="Agentes e skills" title="Nova skill" description="Uma skill ensina a IA a fazer um tipo de trabalho do jeito da sua agência." />
      <SkillForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
