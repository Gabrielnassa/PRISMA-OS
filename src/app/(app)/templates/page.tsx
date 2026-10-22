import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { TEMPLATES } from "@/server/render/templates";
import { FAMILY_LABELS, TEMPLATE_FAMILIES } from "@/lib/brand";
import { FIELD_LABELS, FORMAT_LABELS, SLIDE_KIND_LABELS, type FieldKey, type SlideKind } from "@/lib/content/document";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Biblioteca de layouts" };

export default async function TemplatesPage() {
  await requireAuth();
  return (
    <>
      <PageHeader
        eyebrow="Sistema de design"
        title="Biblioteca de layouts"
        description="Templates originais e editáveis. As pré-visualizações usam texto e imagem de EXEMPLO; nas peças reais, cores, fontes e logotipo vêm da marca de cada cliente."
      />
      {TEMPLATE_FAMILIES.map((family) => {
        const items = TEMPLATES.filter((t) => t.family === family);
        return (
          <section key={family} className="mb-10">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink-50">
              {FAMILY_LABELS[family]} <span className="text-sm font-normal text-ink-400">({items.length})</span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((t) => (
                <Card key={t.id} className="overflow-hidden">
                  <div className="grid grid-cols-3 gap-1 bg-ink-850 p-2">
                    {[0, 1, 2].map((i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={`/api/templates/${t.id}?aspect=4:5&slide=${i}`} alt={`${t.name}, lâmina ${i + 1} (exemplo)`} className="w-full rounded" loading="lazy" />
                    ))}
                  </div>
                  <div className="space-y-2 p-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-ink-50">{t.name}</h3>
                      <Badge>v{t.version}</Badge>
                    </div>
                    <p className="text-ink-300">{t.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {t.formats.map((f) => (
                        <Badge key={f}>{FORMAT_LABELS[f]}</Badge>
                      ))}
                      {t.aspects.map((a) => (
                        <Badge key={a} tone="teal">
                          {a}
                        </Badge>
                      ))}
                      <Badge tone={t.image === "required" ? "warning" : "neutral"}>{t.image === "required" ? "Exige foto" : t.image === "optional" ? "Foto opcional" : "Sem foto"}</Badge>
                    </div>
                    <details className="text-xs text-ink-400">
                      <summary className="cursor-pointer text-ink-300">Metadados do template</summary>
                      <dl className="mt-2 space-y-2">
                        <div>
                          <dt className="font-semibold text-ink-300">Identificador</dt>
                          <dd className="font-mono">{t.id}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-ink-300">Finalidade</dt>
                          <dd>{t.purposes.join(", ")}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-ink-300">Campos editáveis (limite de caracteres)</dt>
                          <dd>
                            {(Object.keys(t.fieldLimits) as SlideKind[]).map((k) => (
                              <div key={k}>
                                {SLIDE_KIND_LABELS[k]}:{" "}
                                {(Object.entries(t.fieldLimits[k]) as Array<[FieldKey, number]>).map(([f, n]) => `${FIELD_LABELS[f]} (${n})`).join(", ")}
                              </div>
                            ))}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-ink-300">Regras de composição</dt>
                          <dd>{t.compositionRules.join(" · ")}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-ink-300">Critérios de qualidade</dt>
                          <dd>{t.qualityCriteria.join(" · ")}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-ink-300">Origem e licença</dt>
                          <dd>{t.origin}</dd>
                        </div>
                      </dl>
                    </details>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
