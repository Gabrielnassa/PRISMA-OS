import { many, one, type Queryable } from "../db";
import { FONT_CATALOG } from "@/lib/fonts";
import type { BrandProfile } from "@/lib/brand";
import { loadBrandProfile } from "../services/clients";

export interface ClientContext {
  clientName: string;
  segment: string;
  brand: BrandProfile;
  /** Bloco textual enviado à IA, com camadas delimitadas. */
  text: string;
  memoryCount: number;
}

const line = (label: string, value: string | string[]) => {
  const v = Array.isArray(value) ? value.join(", ") : value.trim();
  return v ? `${label}: ${v}` : "";
};

/**
 * Monta as camadas de contexto (seção 8): global da agência, cliente (marca,
 * público, voz) e memória aprovada. Hipóteses e sugestões são rotuladas para
 * não serem tratadas como fatos.
 */
export async function buildClientContext(tx: Queryable, organizationId: string, clientId: string): Promise<ClientContext> {
  const org = await one<{ global_context: string }>(tx, "SELECT global_context FROM organizations WHERE id = $1", [organizationId]);
  const client = await one<{ name: string; segment: string }>(tx, "SELECT name, segment FROM clients WHERE id = $1 AND organization_id = $2", [clientId, organizationId]);
  const { brand } = await loadBrandProfile(tx, clientId);
  const memories = await many<{ kind: string; content: string }>(
    tx,
    `SELECT kind, content FROM client_memories
     WHERE client_id = $1 AND status = 'active' AND kind IN ('fact', 'preference', 'hypothesis')
     ORDER BY kind, created_at DESC LIMIT 60`,
    [clientId],
  );
  const kindLabel: Record<string, string> = { fact: "Fato confirmado", preference: "Preferência confirmada", hypothesis: "Hipótese (não afirmar como fato)" };
  const b = brand;
  const sections = [
    org.global_context.trim() ? `<contexto_global_da_agencia>\n${org.global_context.trim()}\n</contexto_global_da_agencia>` : "",
    `<contexto_do_cliente>
${[
  line("Cliente", client.name),
  line("Empresa", b.business.companyName),
  line("Segmento", b.business.segment || client.segment),
  line("Produtos", b.business.products),
  line("Serviços", b.business.services),
  line("Região", b.business.region),
  line("Objetivos comerciais", b.business.goals),
  line("Público-alvo", b.audience.targetAudience),
  line("Personas", b.audience.personas),
  line("Proposta de valor", b.audience.valueProposition),
  line("Diferenciais", b.audience.differentiators),
  line("Tom de voz", b.voice.tone),
  line("Restrições de comunicação", b.voice.restrictions),
  line("Termos preferidos", b.voice.preferredTerms),
  line("Termos proibidos (nunca usar)", b.voice.forbiddenTerms),
  line("Ofertas e condições confirmadas", b.channels.confirmedOffers),
  line("Instagram", b.channels.instagram),
  line("Site", b.channels.website),
  line("Estilo de títulos e CTAs", b.visual.titleCtaStyle),
  line("Estilo fotográfico", b.visual.photoStyle),
  line("Elementos proibidos", b.visual.restrictedElements),
  line("Fontes da marca", `${FONT_CATALOG[b.visual.headingFont].label} / ${FONT_CATALOG[b.visual.bodyFont].label}`),
]
  .filter(Boolean)
  .join("\n")}
</contexto_do_cliente>`,
    memories.length
      ? `<memoria_do_cliente>\n${memories.map((m) => `- [${kindLabel[m.kind] ?? m.kind}] ${m.content}`).join("\n")}\n</memoria_do_cliente>`
      : "",
  ].filter(Boolean);
  return { clientName: client.name, segment: b.business.segment || client.segment, brand, text: sections.join("\n\n"), memoryCount: memories.length };
}
