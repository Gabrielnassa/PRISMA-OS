import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { TEMPLATES } from "@/server/render/templates";
import { FAMILY_LABELS, TEMPLATE_FAMILIES } from "@/lib/brand";
import { FIELD_LABELS, FORMAT_LABELS, SLIDE_KIND_LABELS, type FieldKey, type SlideKind } from "@/lib/content/document";
import { Card, PageHeader, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Biblioteca de layouts" };

export default async function TemplatesPage() {
  await requireAuth();
  return (
    <>
      <PageHeader
        title="Biblioteca de layouts"
        description="Templates originais e editáveis. As pré-visualizações usam texto e imagem de EXEMPLO; nas peças reais, cores, fontes e logotipo vêm da marca de cada cliente."
      />
      {TEMPLATE_FAMILIES.map((family) => {
        const items = TEMPLATES.filter((t) => t.family === family);
        return (
          <section key={family} className="mb-12">
            <SectionTitle aside={<span className="font-mono text-[12px] text-ink-400">{items.length} layouts</span>}>{FAMILY_LABELS[family]}</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((t) => (
                <Card key={t.id} className="overflow-hidden">
                  <div className="grid grid-cols-3 gap-1.5 border-b border-ink-800 bg-ink-950 p-3">
                    {[0, 1, 2].map((i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={`/api/templates/${t.id}?aspect=4:5&slide=${i}`} alt={`${t.name}, lâmina ${i + 1} (exemplo)`} className="w-full rounded-[3px] ring-1 ring-white/5" loading="lazy" />
                    ))}
                  </div>
                  <div className="space-y-3 p-4 text-[13.5px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[15px] font-semibold text-ink-50">{t.name}</h3>
                      <span className="font-mono text-[11.5px] text-ink-400">v{t.version}</span>
                    </div>
                    <p className="leading-relaxed text-ink-300">{t.description}</p>
                    <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 border-t border-ink-800 pt-3 text-[12.5px]">
                      <dt className="text-ink-400">Formatos</dt>
                      <dd className="text-ink-300">{t.formats.map((f) => FORMAT_LABELS[f]).join(" · ")}</dd>
                      <dt className="text-ink-400">Proporções</dt>
                      <dd className="font-mono text-[12px] text-ink-300">{t.aspects.join("  ")}</dd>
                      <dt className="text-ink-400">Foto</dt>
                      <dd className={t.image === "required" ? "text-amber-300" : "text-ink-300"}>{t.image === "required" ? "Exige foto" : t.image === "optional" ? "Opcional" : "Sem foto"}</dd>
                    </dl>
                    <details className="text-xs text-ink-400">
                      <summary className="cursor-pointer text-ink-400 hover:text-ink-200">Metadados do template</summary>
                      <dl className="mt-2 space-y-2">
                        <div>
                          <dt className="font-medium text-ink-300">Identificador</dt>
                          <dd className="font-mono">{t.id}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-ink-300">Finalidade</dt>
                          <dd>{t.purposes.join(", ")}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-ink-300">Campos editáveis (limite de caracteres)</dt>
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
                          <dt className="font-medium text-ink-300">Regras de composição</dt>
                          <dd>{t.compositionRules.join(" · ")}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-ink-300">Critérios de qualidade</dt>
                          <dd>{t.qualityCriteria.join(" · ")}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-ink-300">Origem e licença</dt>
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
