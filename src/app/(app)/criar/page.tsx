import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listClients } from "@/server/services/clients";
import { listMedia } from "@/server/services/media";
import { providerStatus } from "@/server/ai/gateway";
import { TEMPLATES } from "@/server/render/templates";
import { can } from "@/server/authz/permissions";
import { FAMILY_LABELS } from "@/lib/brand";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { CreateForm } from "./create-form";

export const metadata: Metadata = { title: "Central de criação" };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const auth = await requireAuth();
  const { cliente } = await searchParams;
  if (!can(auth.role, "content.create")) {
    return <EmptyState title="Sem permissão de criação" description="Seu papel permite revisar e consultar conteúdos." />;
  }
  const clients = (await listClients(auth)).filter((c) => c.status !== "archived");
  if (clients.length === 0) {
    return (
      <>
        <PageHeader title="Central de criação" />
        <EmptyState title="Cadastre um cliente primeiro" action={can(auth.role, "client.create") ? <LinkButton href="/clientes">Ir para Clientes</LinkButton> : undefined} />
      </>
    );
  }
  const clientId = clients.some((c) => c.id === cliente) ? cliente! : clients.length === 1 ? clients[0]!.id : null;
  const images = clientId ? await listMedia(auth, { clientId, imagesOnly: true, limit: 60 }) : { items: [] };
  const provider = providerStatus();
  return (
    <>
      <PageHeader eyebrow="Motor de conteúdo" title="Central de criação" description="Do briefing à peça editável: texto, arte, revisão e aprovação no mesmo fluxo." />
      <CreateForm
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        clientId={clientId}
        templates={TEMPLATES.map((t) => ({ id: t.id, name: t.name, familyLabel: FAMILY_LABELS[t.family], formats: t.formats, aspects: t.aspects, image: t.image }))}
        images={images.items.filter((i) => i.kind !== "logo").map((i) => ({ id: i.id, filename: i.filename, altText: i.altText }))}
        providerReady={provider.configured}
        providerDemo={provider.isDemo}
      />
    </>
  );
}
