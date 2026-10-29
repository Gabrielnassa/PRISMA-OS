"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import {
  CHANNEL_LABELS,
  CHANNELS,
  CONTENT_FORMATS,
  FORMAT_ASPECTS,
  FORMAT_LABELS,
  OBJECTIVE_LABELS,
  OBJECTIVES,
  ASPECTS,
  type ContentFormat,
  type Objective,
} from "@/lib/content/document";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { uuid } from "@/lib/uuid";
import { createContentAction, suggestIdeasAction } from "./actions";

type TemplateOption = { id: string; name: string; familyLabel: string; formats: string[]; aspects: string[]; image: string };
type ImageOption = { id: string; filename: string; altText: string };

export function CreateForm({
  clients,
  clientId,
  templates,
  images,
  providerReady,
  providerDemo,
  initialBriefing,
}: {
  clients: Array<{ id: string; name: string }>;
  clientId: string | null;
  templates: TemplateOption[];
  images: ImageOption[];
  providerReady: boolean;
  providerDemo: boolean;
  /** Texto inicial do briefing (ex.: resultado de uma skill personalizada). */
  initialBriefing?: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(createContentAction, { status: "idle" });
  const [ideasState, ideasAction, ideasPending] = useActionState(suggestIdeasAction, { status: "idle" });
  const [requestId] = useState(() => uuid());
  const [format, setFormat] = useState<ContentFormat>("carousel");
  const [objective, setObjective] = useState<Objective>("education");
  const [title, setTitle] = useState("");
  const [briefing, setBriefing] = useState(initialBriefing ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const aspects = FORMAT_ASPECTS[format];
  const availableTemplates = templates.filter((t) => t.formats.includes(format));
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);

  if (!clientId) {
    return (
      <Card>
        <CardHeader title="Escolha o cliente" />
        <div className="p-5">
          <Select aria-label="Cliente" defaultValue="" onChange={(e) => e.target.value && router.push(`/criar?cliente=${e.target.value}`)}>
            <option value="" disabled>
              Selecione...
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <ActionForm action={action} state={state} className="flex flex-col gap-6">
        <input type="hidden" name="requestId" value={requestId} />
        <Card>
          <CardHeader title="1. Cliente, canal e formato" />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Cliente" htmlFor="clientId">
              <Select id="clientId" name="clientId" value={clientId} onChange={(e) => router.push(`/criar?cliente=${e.target.value}`)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Canal" htmlFor="channel">
              <Select id="channel" name="channel" defaultValue="instagram">
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Formato" htmlFor="format">
              <Select id="format" name="format" value={format} onChange={(e) => setFormat(e.target.value as ContentFormat)}>
                {CONTENT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Proporção" htmlFor="aspect">
              <Select id="aspect" name="aspect" key={format} defaultValue={aspects[0]}>
                {aspects.map((a) => (
                  <option key={a} value={a}>
                    {ASPECTS[a].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Objetivo" htmlFor="objective">
              <Select id="objective" name="objective" value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
                {OBJECTIVES.map((o) => (
                  <option key={o} value={o}>
                    {OBJECTIVE_LABELS[o]}
                  </option>
                ))}
              </Select>
            </Field>
            {format === "carousel" ? (
              <Field label="Número de lâminas" htmlFor="slideCount" hint="Inclui a capa e a chamada final." error={fe("slideCount")}>
                <Input id="slideCount" name="slideCount" type="number" min={2} max={10} defaultValue={5} />
              </Field>
            ) : (
              <input type="hidden" name="slideCount" value="1" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="2. Briefing" />
          <div className="grid gap-4 p-5">
            <Field label="Título interno da pauta" htmlFor="title" error={fe("title")}>
              <Input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={200} placeholder="Ex.: 3 cuidados com a saúde no inverno" />
            </Field>
            <Field label="Briefing" htmlFor="briefing" error={fe("briefing.text")} hint="Contexto, mensagem principal, informações confirmadas, o que evitar.">
              <Textarea id="briefing" name="briefing" value={briefing} onChange={(e) => setBriefing(e.target.value)} required minLength={10} maxLength={6000} className="min-h-36" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Mensagens-chave (uma por linha)" htmlFor="keyMessages">
                <Textarea id="keyMessages" name="keyMessages" maxLength={3000} />
              </Field>
              <Field label="Público desta peça" htmlFor="audience" hint="Se vazio, usa o público do perfil da marca.">
                <Textarea id="audience" name="audience" maxLength={1000} />
              </Field>
              <Field label="Oferta ou condição (confirmada)" htmlFor="offer">
                <Input id="offer" name="offer" maxLength={1000} placeholder="Ex.: 10% no primeiro mês, até 30/11" />
              </Field>
              <Field label="CTA desejado" htmlFor="cta">
                <Input id="cta" name="cta" maxLength={300} placeholder="Ex.: Agende pelo WhatsApp" />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="3. Direção visual" />
          <div className="grid gap-4 p-5">
            <Field label="Template" htmlFor="templatePreference">
              <Select id="templatePreference" name="templatePreference" key={format} defaultValue="auto">
                <option value="auto">Automático</option>
                {availableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.familyLabel} — {t.name}
                    {t.image === "required" ? " (exige foto)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-200">Fotos do cliente (até 10)</legend>
              {images.length === 0 ? (
                <p className="text-sm text-ink-400">Este cliente ainda não tem fotos. Sem foto, a peça usa um layout só com texto.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                  {images.map((img) => {
                    const on = selected.includes(img.id);
                    return (
                      <label
                        key={img.id}
                        className={cx(
                          "relative cursor-pointer overflow-hidden rounded-lg border-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-iris-400 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-ink-900",
                          on ? "border-iris-400" : "border-transparent",
                        )}
                      >
                        <input
                          type="checkbox"
                          name="imageAssetIds"
                          value={img.id}
                          checked={on}
                          onChange={() => setSelected((s) => (on ? s.filter((x) => x !== img.id) : s.length >= 10 ? s : [...s, img.id]))}
                          aria-label={img.altText || img.filename}
                          // Invisível, mas cobrindo a foto inteira: o clique e o foco caem sempre nela.
                          className="absolute inset-0 z-10 cursor-pointer appearance-none opacity-0"
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/media/${img.id}`} alt={img.altText || img.filename} className="aspect-square w-full bg-ink-850 object-cover" loading="lazy" />
                        {on ? <span className="absolute right-1 top-1 rounded-[4px] bg-ink-50 px-1.5 tabular text-[10px] font-medium text-ink-950">{selected.indexOf(img.id) + 1}</span> : null}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          </div>
        </Card>

        <FormMessage state={state} />
        <div className="flex flex-wrap gap-3">
          <SubmitButton name="mode" value="ai" disabled={!providerReady} pendingText="Enviando para a fila...">
            {providerDemo ? "Gerar rascunho" : "Gerar com IA"}
          </SubmitButton>
          <SubmitButton name="mode" value="manual" variant="secondary" pendingText="Criando...">
            Montar manualmente
          </SubmitButton>
        </div>
        {!providerReady ? <Alert tone="warning">IA não conectada. Monte a peça manualmente e escreva os textos no editor.</Alert> : null}
      </ActionForm>

      <aside className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Ideias de pauta" description="Com base no perfil da marca, sem repetir títulos recentes" />
          <ActionForm action={ideasAction} state={ideasState} className="flex flex-col gap-3 p-5">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="objective" value={objective} />
            <input type="hidden" name="format" value={format} />
            <input type="hidden" name="briefing" value={briefing} />
            <Button type="submit" variant="secondary" disabled={!providerReady || ideasPending}>
              {ideasPending ? "Gerando pautas..." : "Sugerir 5 pautas"}
            </Button>
            <FormMessage state={ideasState} />
          </ActionForm>
          {ideasState.status === "ok" && ideasState.data ? (
            <ul className="divide-y divide-ink-800 border-t border-ink-700">
              {ideasState.data.ideas.map((idea, i) => (
                <li key={i} className="px-5 py-3">
                  <div className="text-sm font-medium text-ink-100">{idea.title}</div>
                  <div className="mt-0.5 text-xs text-ink-400">{idea.angle}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge>{FORMAT_LABELS[idea.format]}</Badge>
                    <button
                      type="button"
                      className="text-xs font-medium text-iris-300 hover:underline"
                      onClick={() => {
                        setTitle(idea.title);
                        setBriefing(`${idea.hook}\n\n${idea.angle}\n\nJustificativa: ${idea.rationale}`);
                        setFormat(idea.format);
                        setObjective(idea.objective);
                      }}
                    >
                      Usar esta pauta
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </aside>
    </div>
  );
}
