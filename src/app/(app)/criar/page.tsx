import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listClients } from "@/server/services/clients";
import { listMedia } from "@/server/services/media";
import { getCustomSkillRunText } from "@/server/services/custom-skills";
import { providerStatus } from "@/server/ai/gateway";
import { TEMPLATES } from "@/server/render/templates";
import { can } from "@/server/authz/permissions";
import { FAMILY_LABELS } from "@/lib/brand";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { CreateForm } from "./create-form";

export const metadata: Metadata = { title: "Criar" };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ cliente?: string; de?: string }> }) {
  const auth = await requireAuth();
  const { cliente: clienteParam, de } = await searchParams;
  if (!can(auth.role, "content.create")) {
    return <EmptyState title="Sem permissão para criar" description="Seu acesso permite revisar e consultar as peças." />;
  }
  const clients = (await listClients(auth)).filter((c) => c.status !== "archived");
  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Criar conteúdo" />
        <EmptyState title="Cadastre um cliente primeiro" action={can(auth.role, "client.create") ? <LinkButton href="/clientes">Ir para Clientes</LinkButton> : undefined} />
      </>
    );
  }
  // ?de=<execução>: o resultado de uma skill personalizada vira o briefing (no cliente dela).
  const fromSkill = de ? await getCustomSkillRunText(auth, de) : null;
  const cliente = fromSkill?.clientId ?? clienteParam;
  const clientId = clients.some((c) => c.id === cliente) ? cliente! : clients.length === 1 ? clients[0]!.id : null;
  const images = clientId ? await listMedia(auth, { clientId, imagesOnly: true, limit: 60 }) : { items: [] };
  const provider = providerStatus();
  return (
    <>
      <PageHeader title="Criar conteúdo" />
      <CreateForm
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        clientId={clientId}
        templates={TEMPLATES.map((t) => ({ id: t.id, name: t.name, familyLabel: FAMILY_LABELS[t.family], formats: t.formats, aspects: t.aspects, image: t.image }))}
        images={images.items.filter((i) => i.kind !== "logo").map((i) => ({ id: i.id, filename: i.filename, altText: i.altText }))}
        providerReady={provider.configured}
        providerDemo={provider.isDemo}
        initialBriefing={fromSkill && fromSkill.clientId === clientId ? fromSkill.text.slice(0, 6000) : undefined}
      />
    </>
  );
}
