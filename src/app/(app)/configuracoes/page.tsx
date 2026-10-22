import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { getOrganization } from "@/server/services/organizations";
import { can } from "@/server/authz/permissions";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { OrgSettingsForm, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const auth = await requireAuth();
  const org = await getOrganization(auth);
  return (
    <>
      <PageHeader title="Configurações" />
      <Card className="mb-6">
        <CardHeader title="Organização" />
        <OrgSettingsForm org={{ name: org.name, globalContext: org.globalContext, requireDistinctApprover: org.settings.requireDistinctApprover }} canEdit={can(auth.role, "org.manage")} />
      </Card>
      <Card id="senha">
        <CardHeader title="Minha senha" description={auth.email} />
        <PasswordForm />
      </Card>
    </>
  );
}
