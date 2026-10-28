"use client";

import { useActionState, useState } from "react";
import type { BrandProfile } from "@/lib/brand";
import { FAMILY_LABELS, TEMPLATE_FAMILIES } from "@/lib/brand";
import { FONT_CATALOG, FONT_IDS } from "@/lib/fonts";
import { contrastRatio } from "@/lib/color";
import { Card, CardHeader, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { saveBrandAction } from "../actions";

type LogoOption = { id: string; filename: string };

const COLOR_FIELDS = [
  ["primary", "Primária"],
  ["secondary", "Secundária"],
  ["accent", "Destaque"],
  ["background", "Fundo"],
  ["text", "Texto"],
] as const;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="grid gap-4 p-5 md:grid-cols-2">{children}</div>
    </Card>
  );
}

export function BrandForm({ clientId, brand, revision, logos, canEdit }: { clientId: string; brand: BrandProfile; revision: number; logos: LogoOption[]; canEdit: boolean }) {
  const [state, action] = useActionState(saveBrandAction, { status: "idle" });
  const [colors, setColors] = useState(brand.visual.colors);
  const [fonts, setFonts] = useState({ heading: brand.visual.headingFont, body: brand.visual.bodyFont });
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  const textContrast = contrastRatio(colors.text, colors.background);

  return (
    <ActionForm action={action} state={state} className="flex flex-col gap-6">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="revision" value={revision} />
      <fieldset disabled={!canEdit} className="flex flex-col gap-6">
        <Section title="Negócio" description="Empresa, oferta e objetivos comerciais.">
          <Field label="Nome da empresa" htmlFor="b-company">
            <Input id="b-company" name="business.companyName" defaultValue={brand.business.companyName} maxLength={200} />
          </Field>
          <Field label="Segmento" htmlFor="b-segment">
            <Input id="b-segment" name="business.segment" defaultValue={brand.business.segment} maxLength={200} />
          </Field>
          <Field label="Produtos" htmlFor="b-products">
            <Textarea id="b-products" name="business.products" defaultValue={brand.business.products} maxLength={3000} />
          </Field>
          <Field label="Serviços" htmlFor="b-services">
            <Textarea id="b-services" name="business.services" defaultValue={brand.business.services} maxLength={3000} />
          </Field>
          <Field label="Região de atuação" htmlFor="b-region">
            <Input id="b-region" name="business.region" defaultValue={brand.business.region} maxLength={300} />
          </Field>
          <Field label="Objetivos comerciais" htmlFor="b-goals">
            <Textarea id="b-goals" name="business.goals" defaultValue={brand.business.goals} maxLength={2000} />
          </Field>
        </Section>

        <Section title="Público e posicionamento">
          <Field label="Público-alvo" htmlFor="a-target">
            <Textarea id="a-target" name="audience.targetAudience" defaultValue={brand.audience.targetAudience} maxLength={2000} />
          </Field>
          <Field label="Personas" htmlFor="a-personas" hint="Descreva perfis reais atendidos pelo cliente.">
            <Textarea id="a-personas" name="audience.personas" defaultValue={brand.audience.personas} maxLength={4000} />
          </Field>
          <Field label="Proposta de valor" htmlFor="a-value">
            <Textarea id="a-value" name="audience.valueProposition" defaultValue={brand.audience.valueProposition} maxLength={2000} />
          </Field>
          <Field label="Diferenciais" htmlFor="a-diff">
            <Textarea id="a-diff" name="audience.differentiators" defaultValue={brand.audience.differentiators} maxLength={2000} />
          </Field>
        </Section>

        <Section title="Tom de voz" description="Usado por todas as skills de texto deste cliente.">
          <Field label="Tom de voz" htmlFor="v-tone">
            <Textarea id="v-tone" name="voice.tone" defaultValue={brand.voice.tone} maxLength={2000} placeholder="Ex.: acolhedor, direto, sem jargão técnico" />
          </Field>
          <Field label="Restrições de comunicação" htmlFor="v-restr">
            <Textarea id="v-restr" name="voice.restrictions" defaultValue={brand.voice.restrictions} maxLength={2000} placeholder="Ex.: não prometer resultados de tratamento" />
          </Field>
          <Field label="Termos preferidos" htmlFor="v-pref" hint="Separe por vírgula.">
            <Input id="v-pref" name="voice.preferredTerms" defaultValue={brand.voice.preferredTerms.join(", ")} />
          </Field>
          <Field label="Termos proibidos" htmlFor="v-forb" hint="Separe por vírgula. O controle de qualidade bloqueia peças que os usem.">
            <Input id="v-forb" name="voice.forbiddenTerms" defaultValue={brand.voice.forbiddenTerms.join(", ")} />
          </Field>
        </Section>

        <Card>
          <CardHeader title="Identidade visual" description="Cores, fontes e logotipo aplicados às peças. A paleta do PRISMA OS não é imposta aos clientes." />
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 md:col-span-2">
                {COLOR_FIELDS.map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={`c-${key}`} error={err(`visual.colors.${key}`)}>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`${label} (seletor)`}
                        value={colors[key]}
                        onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                        className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-ink-700 bg-transparent"
                      />
                      <Input
                        id={`c-${key}`}
                        name={`visual.colors.${key}`}
                        value={colors[key]}
                        onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                        pattern="#[0-9a-fA-F]{6}"
                        className="font-mono"
                      />
                    </div>
                  </Field>
                ))}
              </div>
              <Field label="Fonte dos títulos" htmlFor="f-heading">
                <Select id="f-heading" name="visual.headingFont" value={fonts.heading} onChange={(e) => setFonts((f) => ({ ...f, heading: e.target.value as typeof f.heading }))}>
                  {FONT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {FONT_CATALOG[id].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fonte dos textos" htmlFor="f-body">
                <Select id="f-body" name="visual.bodyFont" value={fonts.body} onChange={(e) => setFonts((f) => ({ ...f, body: e.target.value as typeof f.body }))}>
                  {FONT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {FONT_CATALOG[id].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Logotipo" htmlFor="logo" hint={logos.length === 0 ? "Envie o logotipo na aba Arquivos (tipo Logotipo)." : undefined}>
                <Select id="logo" name="visual.logoAssetId" defaultValue={brand.visual.logoAssetId ?? ""}>
                  <option value="">Sem logotipo (usa o @ do Instagram)</option>
                  {logos.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.filename}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset className="md:col-span-2">
                <legend className="mb-2 text-sm font-medium text-ink-200">Famílias de layout preferidas</legend>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_FAMILIES.map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-700 px-3 py-1.5 text-[13px] has-[:checked]:border-violet-400/70 has-[:checked]:bg-violet-400/[0.06] has-[:checked]:bg-violet-500/10">
                      <input type="checkbox" name="visual.preferredFamilies" value={f} defaultChecked={brand.visual.preferredFamilies.includes(f)} className="accent-violet-400" />
                      {FAMILY_LABELS[f]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Estilo fotográfico" htmlFor="v-photo">
                <Textarea id="v-photo" name="visual.photoStyle" defaultValue={brand.visual.photoStyle} maxLength={1000} />
              </Field>
              <Field label="Tratamento de imagens" htmlFor="v-treat">
                <Textarea id="v-treat" name="visual.imageTreatment" defaultValue={brand.visual.imageTreatment} maxLength={500} />
              </Field>
              <Field label="Estilo de ícones e ilustrações" htmlFor="v-icons">
                <Textarea id="v-icons" name="visual.iconStyle" defaultValue={brand.visual.iconStyle} maxLength={500} />
              </Field>
              <Field label="Estilo de títulos, legendas e CTAs" htmlFor="v-cta">
                <Textarea id="v-cta" name="visual.titleCtaStyle" defaultValue={brand.visual.titleCtaStyle} maxLength={1000} />
              </Field>
              <Field label="Referências aprovadas" htmlFor="v-refs">
                <Textarea id="v-refs" name="visual.approvedReferences" defaultValue={brand.visual.approvedReferences} maxLength={2000} />
              </Field>
              <Field label="Elementos proibidos ou restritos" htmlFor="v-restricted">
                <Textarea id="v-restricted" name="visual.restrictedElements" defaultValue={brand.visual.restrictedElements} maxLength={2000} />
              </Field>
              <label className="flex items-start gap-3 rounded-md border border-ink-700 p-3 text-[13.5px] md:col-span-2">
                <input type="checkbox" name="visual.configured" defaultChecked={brand.visual.configured} className="mt-0.5 accent-violet-400" />
                <span>
                  <span className="font-medium text-ink-100">Identidade visual definida</span>
                  <span className="block text-ink-400">Marque quando cores e fontes estiverem confirmadas com o cliente. Antes disso, as peças são sinalizadas como provisórias.</span>
                </span>
              </label>
            </div>

            <div className="rounded-[var(--radius-card)] border border-ink-800 p-4" aria-label="Pré-visualização da identidade">
              <div className="mb-3 text-[12px] font-medium text-ink-400">Pré-visualização</div>
              <div className="overflow-hidden rounded-lg" style={{ backgroundColor: colors.background }}>
                <div className="h-2" style={{ backgroundColor: colors.accent }} />
                <div className="p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: colors.accent }}>
                    Exemplo
                  </div>
                  <div className="mt-1 text-2xl font-bold leading-tight" style={{ color: colors.text, fontFamily: FONT_CATALOG[fonts.heading].label }}>
                    Título da peça
                  </div>
                  <p className="mt-2 text-sm" style={{ color: colors.text, fontFamily: FONT_CATALOG[fonts.body].label }}>
                    Texto de apoio com a fonte de corpo.
                  </p>
                </div>
                <div className="p-5" style={{ backgroundColor: colors.primary }}>
                  <div className="text-lg font-bold" style={{ color: colors.background }}>
                    Lâmina na cor primária
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                {COLOR_FIELDS.map(([k]) => (
                  <div key={k} className="h-6 flex-1 rounded" style={{ backgroundColor: colors[k] }} title={k} />
                ))}
              </div>
              <p className={cx("mt-3 text-xs", textContrast >= 4.5 ? "text-emerald-300" : "text-amber-300")}>
                Contraste texto/fundo: {textContrast.toFixed(1)}:1 {textContrast >= 4.5 ? "(adequado)" : "(abaixo de 4,5:1; o motor ajusta automaticamente)"}
              </p>
              <p className="mt-2 text-xs text-ink-400">A pré-visualização usa fontes do navegador; as peças finais usam as fontes empacotadas.</p>
            </div>
          </div>
        </Card>

        <Section title="Canais e ofertas">
          <Field label="Instagram" htmlFor="ch-ig" hint="Ex.: @suamarca. Aparece nas peças quando não há logotipo.">
            <Input id="ch-ig" name="channels.instagram" defaultValue={brand.channels.instagram} maxLength={200} />
          </Field>
          <Field label="Site" htmlFor="ch-site">
            <Input id="ch-site" name="channels.website" defaultValue={brand.channels.website} maxLength={300} />
          </Field>
          <Field label="Facebook" htmlFor="ch-fb">
            <Input id="ch-fb" name="channels.facebook" defaultValue={brand.channels.facebook} maxLength={200} />
          </Field>
          <Field label="LinkedIn" htmlFor="ch-li">
            <Input id="ch-li" name="channels.linkedin" defaultValue={brand.channels.linkedin} maxLength={200} />
          </Field>
          <Field label="TikTok" htmlFor="ch-tt">
            <Input id="ch-tt" name="channels.tiktok" defaultValue={brand.channels.tiktok} maxLength={200} />
          </Field>
          <Field label="Frequência editorial" htmlFor="ch-freq">
            <Input id="ch-freq" name="channels.frequency" defaultValue={brand.channels.frequency} maxLength={500} />
          </Field>
          <Field label="Ofertas e condições confirmadas" htmlFor="ch-offers" hint="Somente condições confirmadas pelo cliente. A IA não usa preços fora desta lista ou do briefing." className="md:col-span-2">
            <Textarea id="ch-offers" name="channels.confirmedOffers" defaultValue={brand.channels.confirmedOffers} maxLength={3000} />
          </Field>
        </Section>

        <Section title="Referências e responsáveis">
          <Field label="Concorrentes" htmlFor="r-comp" hint="URLs usadas apenas para análise autorizada.">
            <Textarea id="r-comp" name="references.competitors" defaultValue={brand.references.competitors} maxLength={3000} />
          </Field>
          <Field label="URLs de referência" htmlFor="r-urls">
            <Textarea id="r-urls" name="references.referenceUrls" defaultValue={brand.references.referenceUrls} maxLength={3000} />
          </Field>
          <Field label="Responsáveis e contatos" htmlFor="r-resp" className="md:col-span-2">
            <Textarea id="r-resp" name="references.responsibles" defaultValue={brand.references.responsibles} maxLength={2000} />
          </Field>
        </Section>
      </fieldset>

      {canEdit ? (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-ink-800 bg-ink-950/90 px-1 py-3 backdrop-blur">
          <SubmitButton pendingText="Salvando...">Salvar perfil da marca</SubmitButton>
          <div className="min-w-0 flex-1">
            <FormMessage state={state} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-400">Seu papel permite apenas consultar o perfil.</p>
      )}
    </ActionForm>
  );
}
