"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ASPECTS,
  FIELD_KEYS,
  FIELD_LABELS,
  FIELD_MAX,
  FORMAT_ASPECTS,
  SLIDE_KIND_LABELS,
  SLIDE_KINDS,
  SLIDE_LIMITS,
  SLIDE_THEME_LABELS,
  SLIDE_THEMES,
  newSlideId,
  normalizeHashtag,
  type Aspect,
  type ContentDocument,
  type DocumentStyle,
  type FieldKey,
  type Slide,
  type SlideKind,
} from "@/lib/content/document";
import { effectiveLimits, type Capacity } from "@/lib/content/limits";
import { FONT_CATALOG, FONT_IDS, type FontId } from "@/lib/fonts";
import type { QualityReport } from "@/server/quality/checks";
import { Button, Card, CardHeader, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { QualityPanel } from "./quality-panel";
import { saveVersionAction } from "./actions";

export type EditorTemplate = {
  id: string;
  name: string;
  familyLabel: string;
  formats: string[];
  aspects: string[];
  image: "required" | "optional" | "none";
  fieldLimits: Record<SlideKind, Partial<Record<FieldKey, number>>>;
  capacity?: Capacity;
};

type PreviewSlide = { index: number; slideId: string; svg: string };

function svgUrl(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

function Counter({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return <span className={cx("tabular-nums", over ? "font-semibold text-red-300" : value.length > limit * 0.9 ? "text-amber-300" : "text-ink-400")}>{value.length}/{limit}</span>;
}

export function ContentEditor({
  contentId,
  baseVersionId,
  initialDocument,
  initialQuality,
  templates,
  images,
  brandStyle,
  canEdit,
}: {
  contentId: string;
  baseVersionId: string;
  initialDocument: ContentDocument;
  initialQuality: QualityReport | null;
  templates: EditorTemplate[];
  images: Array<{ id: string; filename: string }>;
  brandStyle: DocumentStyle;
  canEdit: boolean;
}) {
  const [doc, setDoc] = useState<ContentDocument>(initialDocument);
  const [selectedState, setSelected] = useState(0);
  // Sempre dentro do intervalo (ex.: após descartar lâminas adicionadas).
  const selected = Math.min(selectedState, doc.slides.length - 1);
  const [urls, setUrls] = useState<string[]>([]);
  const urlsRef = useRef<string[]>([]);
  const [quality, setQuality] = useState<QualityReport | null>(initialQuality);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [saveMessage, setSaveMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [hashtagText, setHashtagText] = useState(initialDocument.hashtags.join(" "));
  // Nova versão salva (ou restaurada): recomeça a partir dela sem desmontar o
  // editor, preservando a mensagem de confirmação.
  const [syncedVersionId, setSyncedVersionId] = useState(baseVersionId);
  if (syncedVersionId !== baseVersionId) {
    setSyncedVersionId(baseVersionId);
    setDoc(initialDocument);
    setHashtagText(initialDocument.hashtags.join(" "));
    setQuality(initialQuality);
  }
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(initialDocument), [doc, initialDocument]);
  const template = templates.find((t) => t.id === doc.templateId) ?? templates[0]!;
  const slide = doc.slides[Math.min(selected, doc.slides.length - 1)]!;
  const limits = effectiveLimits(template.fieldLimits[slide.kind], template.capacity, doc.aspect, slide.kind, Boolean(slide.imageAssetId) && template.image !== "none");
  const requestSeq = useRef(0);

  // Pré-visualização com atraso para não renderizar a cada tecla.
  useEffect(() => {
    const seq = ++requestSeq.current;
    // Cancela a requisição anterior (e a desta rodada, ao desmontar): respostas
    // atrasadas não criam URLs de imagem que nunca seriam liberadas.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRendering(true);
      try {
        const res = await fetch(`/api/contents/${contentId}/preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document: doc }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (seq !== requestSeq.current || controller.signal.aborted) return;
        if (!res.ok) {
          setPreviewError(json?.error?.message ?? "Falha na pré-visualização");
          return;
        }
        setPreviewError(null);
        const next = (json.slides as PreviewSlide[]).map((p) => svgUrl(p.svg));
        urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        urlsRef.current = next;
        setUrls(next);
        setQuality(json.quality);
      } catch {
        if (seq === requestSeq.current && !controller.signal.aborted) setPreviewError("Sem conexão para atualizar a prévia.");
      } finally {
        if (seq === requestSeq.current) setRendering(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [doc, contentId]);

  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    // Navegação interna (links do menu e da página) não dispara beforeunload:
    // confirma antes de sair com alterações não salvas.
    const guardLinks = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      if (!window.confirm("Há alterações não salvas no editor. Sair mesmo assim?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [dirty]);

  const updateSlide = useCallback(
    (patch: Partial<Slide> | ((s: Slide) => Partial<Slide>)) =>
      setDoc((d) => ({
        ...d,
        slides: d.slides.map((s, i) => (i === selected ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)),
      })),
    [selected],
  );
  const setField = (key: FieldKey, value: string) => updateSlide((s) => ({ fields: { ...s.fields, [key]: value.slice(0, FIELD_MAX[key]) } }));
  const setStyle = (patch: Partial<DocumentStyle>) => setDoc((d) => ({ ...d, style: { ...d.style, ...patch } }));

  const slideLimits = SLIDE_LIMITS[doc.format];
  function addSlide() {
    if (doc.slides.length >= slideLimits.max) return;
    setDoc((d) => {
      const slides = [...d.slides];
      const blank: Slide = {
        id: newSlideId(slides.length),
        kind: "content",
        fields: { kicker: "", title: "", body: "", highlight: "", footer: "" },
        imageAssetId: null,
        imageFocus: { x: 50, y: 50 },
        imageZoom: 1,
        align: "auto",
        theme: "auto",
        textScale: 1,
        alt: "",
      };
      slides.splice(selected + 1, 0, blank);
      return { ...d, slides };
    });
    setSelected(selected + 1);
  }
  function duplicateSlide() {
    if (doc.slides.length >= slideLimits.max) return;
    setDoc((d) => {
      const slides = [...d.slides];
      slides.splice(selected + 1, 0, { ...structuredClone(slide), id: newSlideId(slides.length) });
      return { ...d, slides };
    });
    setSelected(selected + 1);
  }
  function removeSlide() {
    if (doc.slides.length <= slideLimits.min) return;
    setDoc((d) => ({ ...d, slides: d.slides.filter((_, i) => i !== selected) }));
    setSelected(Math.max(0, selected - 1));
  }
  function moveSlide(dir: -1 | 1) {
    const to = selected + dir;
    if (to < 0 || to >= doc.slides.length) return;
    setDoc((d) => {
      const slides = [...d.slides];
      [slides[selected], slides[to]] = [slides[to]!, slides[selected]!];
      return { ...d, slides };
    });
    setSelected(to);
  }

  function save() {
    setSaveMessage(null);
    startSaving(async () => {
      const res = await saveVersionAction(contentId, baseVersionId, doc, changeNote);
      if (res.status === "error") {
        setSaveMessage({ tone: "error", text: res.message });
        return;
      }
      // A ação já atualiza a página (nova versão chega por baseVersionId).
      setSaveMessage({ tone: "ok", text: res.status === "ok" ? (res.message ?? "Salvo.") : "Salvo." });
      setChangeNote("");
    });
  }

  const compatibleTemplates = templates.filter((t) => t.formats.includes(doc.format) && t.aspects.includes(doc.aspect));
  const unusedWithText = FIELD_KEYS.filter((k) => limits[k] === undefined && slide.fields[k].trim());

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-ink-800 bg-ink-850" style={{ aspectRatio: `${ASPECTS[doc.aspect].width} / ${ASPECTS[doc.aspect].height}` }}>
                {urls[selected] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[selected]} alt={`Pré-visualização da lâmina ${selected + 1}`} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-ink-400">Renderizando...</div>
                )}
                {rendering ? <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">atualizando</span> : null}
              </div>
              {previewError ? (
                <p role="alert" className="text-xs text-red-300">
                  {previewError}
                </p>
              ) : null}
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Lâminas">
                {doc.slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={i === selected}
                    onClick={() => setSelected(i)}
                    className={cx("relative w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-ink-850", i === selected ? "border-iris-400" : "border-ink-700 hover:border-ink-500")}
                    style={{ aspectRatio: `${ASPECTS[doc.aspect].width} / ${ASPECTS[doc.aspect].height}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {urls[i] ? <img src={urls[i]} alt="" className="h-full w-full object-cover" /> : null}
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] text-white">{i + 1}</span>
                  </button>
                ))}
              </div>
              {canEdit && doc.format === "carousel" ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={addSlide} disabled={doc.slides.length >= slideLimits.max}>
                    + Lâmina
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={duplicateSlide} disabled={doc.slides.length >= slideLimits.max}>
                    Duplicar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => moveSlide(-1)} disabled={selected === 0} aria-label="Mover para a esquerda">
                    ←
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => moveSlide(1)} disabled={selected === doc.slides.length - 1} aria-label="Mover para a direita">
                    →
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={removeSlide} disabled={doc.slides.length <= slideLimits.min} className="text-red-300">
                    Remover
                  </Button>
                </div>
              ) : null}
            </div>

            <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="shrink-0 whitespace-nowrap text-[13.5px] font-semibold text-ink-100">Lâmina {selected + 1}</h3>
                <Select aria-label="Tipo da lâmina" value={slide.kind} onChange={(e) => updateSlide({ kind: e.target.value as SlideKind })} className="w-48">
                  {SLIDE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {SLIDE_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </div>
              {FIELD_KEYS.filter((k) => limits[k] !== undefined).map((k) => (
                <div key={k} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={`f-${k}`} className="font-medium text-ink-200">
                      {FIELD_LABELS[k]}
                    </label>
                    <Counter value={slide.fields[k]} limit={limits[k]!} />
                  </div>
                  {k === "body" || k === "title" ? (
                    <Textarea id={`f-${k}`} value={slide.fields[k]} onChange={(e) => setField(k, e.target.value)} className={k === "title" ? "min-h-16" : "min-h-24"} />
                  ) : (
                    <Input id={`f-${k}`} value={slide.fields[k]} onChange={(e) => setField(k, e.target.value)} />
                  )}
                </div>
              ))}
              {unusedWithText.length ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                  Campos com texto que este template não exibe: {unusedWithText.map((k) => FIELD_LABELS[k]).join(", ")}.{" "}
                  <button type="button" className="underline" onClick={() => updateSlide((s) => ({ fields: { ...s.fields, ...Object.fromEntries(unusedWithText.map((k) => [k, ""])) } }))}>
                    Limpar
                  </button>
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tema da lâmina" htmlFor="theme">
                  <Select id="theme" value={slide.theme} onChange={(e) => updateSlide({ theme: e.target.value as Slide["theme"] })}>
                    {SLIDE_THEMES.map((t) => (
                      <option key={t} value={t}>
                        {SLIDE_THEME_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Alinhamento" htmlFor="align">
                  <Select id="align" value={slide.align} onChange={(e) => updateSlide({ align: e.target.value as Slide["align"] })}>
                    <option value="auto">Padrão</option>
                    <option value="left">Esquerda</option>
                    <option value="center">Centro</option>
                  </Select>
                </Field>
              </div>
              <Field label={`Escala do texto (${Math.round(slide.textScale * 100)}%)`} htmlFor="scale">
                <input id="scale" type="range" min={0.7} max={1.3} step={0.05} value={slide.textScale} onChange={(e) => updateSlide({ textScale: Number(e.target.value) })} />
              </Field>
              {template.image !== "none" ? (
                <div className="flex flex-col gap-3 rounded-lg border border-ink-700 p-3">
                  <Field label={`Imagem${template.image === "required" ? " (obrigatória neste layout)" : ""}`} htmlFor="image">
                    <Select id="image" value={slide.imageAssetId ?? ""} onChange={(e) => updateSlide({ imageAssetId: e.target.value || null })}>
                      <option value="">Sem imagem</option>
                      {images.map((img) => (
                        <option key={img.id} value={img.id}>
                          {img.filename}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {slide.imageAssetId ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label={`Foco X ${slide.imageFocus.x}%`} htmlFor="fx">
                          <input id="fx" type="range" min={0} max={100} value={slide.imageFocus.x} onChange={(e) => updateSlide((s) => ({ imageFocus: { ...s.imageFocus, x: Number(e.target.value) } }))} />
                        </Field>
                        <Field label={`Foco Y ${slide.imageFocus.y}%`} htmlFor="fy">
                          <input id="fy" type="range" min={0} max={100} value={slide.imageFocus.y} onChange={(e) => updateSlide((s) => ({ imageFocus: { ...s.imageFocus, y: Number(e.target.value) } }))} />
                        </Field>
                        <Field label={`Zoom ${slide.imageZoom.toFixed(1)}×`} htmlFor="zoom">
                          <input id="zoom" type="range" min={1} max={2.5} step={0.1} value={slide.imageZoom} onChange={(e) => updateSlide({ imageZoom: Number(e.target.value) })} />
                        </Field>
                      </div>
                      <Field label="Texto alternativo da imagem" htmlFor="alt">
                        <Input id="alt" value={slide.alt} maxLength={400} onChange={(e) => updateSlide({ alt: e.target.value })} />
                      </Field>
                    </>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          </div>
        </Card>

        <Card>
          <CardHeader title="Legenda e CTA" />
          <fieldset disabled={!canEdit} className="grid gap-4 p-5">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <label htmlFor="caption" className="font-medium text-ink-200">
                  Legenda
                </label>
                <Counter value={doc.caption} limit={2200} />
              </div>
              <Textarea id="caption" value={doc.caption} onChange={(e) => setDoc((d) => ({ ...d, caption: e.target.value.slice(0, 2200) }))} className="min-h-32" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={`Hashtags (${doc.hashtags.length}/30)`} htmlFor="hashtags" hint="Separe por espaço. Hashtags inválidas são descartadas.">
                <Input
                  id="hashtags"
                  value={hashtagText}
                  onChange={(e) => setHashtagText(e.target.value)}
                  onBlur={() => {
                    const tags = [...new Set(hashtagText.split(/[\s,]+/).map(normalizeHashtag).filter((h): h is string => Boolean(h)))].slice(0, 30);
                    setHashtagText(tags.join(" "));
                    setDoc((d) => ({ ...d, hashtags: tags }));
                  }}
                />
              </Field>
              <Field label="CTA" htmlFor="cta">
                <Input id="cta" value={doc.cta} maxLength={200} onChange={(e) => setDoc((d) => ({ ...d, cta: e.target.value }))} />
              </Field>
            </div>
            <Field label="Notas de produção" htmlFor="notes" hint="Conceito, premissas e pontos a confirmar (não aparecem na peça).">
              <Textarea id="notes" value={doc.notes} maxLength={3000} onChange={(e) => setDoc((d) => ({ ...d, notes: e.target.value }))} />
            </Field>
          </fieldset>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {canEdit ? (
          <Card className={cx(dirty && "border-amber-400/40")}>
            <div className="flex flex-col gap-3 p-4">
              <Field label="Nota da alteração (opcional)" htmlFor="note">
                <Input id="note" value={changeNote} maxLength={500} onChange={(e) => setChangeNote(e.target.value)} placeholder="Ex.: título mais direto" />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={save} disabled={!dirty || saving}>
                  {saving ? "Salvando..." : "Salvar nova versão"}
                </Button>
                <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => {
                    setDoc(initialDocument);
                    setHashtagText(initialDocument.hashtags.join(" "));
                    setSelected((i) => Math.min(i, initialDocument.slides.length - 1));
                  }}>
                  Descartar alterações
                </Button>
              </div>
              {dirty ? <p className="text-xs text-amber-300">Alterações não salvas. Salvar cria uma nova versão e exige nova aprovação.</p> : <p className="text-xs text-ink-400">Sem alterações pendentes.</p>}
              {saveMessage ? (
                <p role={saveMessage.tone === "error" ? "alert" : "status"} className={cx("text-sm", saveMessage.tone === "error" ? "text-red-300" : "text-emerald-300")}>
                  {saveMessage.text}
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}

        <QualityPanel report={quality} live={dirty} />

        <Card>
          <CardHeader title="Layout e estilo" />
          <fieldset disabled={!canEdit} className="grid gap-4 p-5">
            <Field label="Template" htmlFor="template">
              <Select id="template" value={doc.templateId} onChange={(e) => setDoc((d) => ({ ...d, templateId: e.target.value }))}>
                {compatibleTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.familyLabel} — {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Proporção" htmlFor="aspect">
              <Select
                id="aspect"
                value={doc.aspect}
                onChange={(e) => {
                  const aspect = e.target.value as Aspect;
                  setDoc((d) => {
                    const t = templates.find((x) => x.id === d.templateId);
                    const ok = t?.aspects.includes(aspect);
                    const fallback = templates.find((x) => x.formats.includes(d.format) && x.aspects.includes(aspect));
                    return { ...d, aspect, templateId: ok ? d.templateId : (fallback?.id ?? d.templateId) };
                  });
                }}
              >
                {FORMAT_ASPECTS[doc.format].map((a) => (
                  <option key={a} value={a}>
                    {ASPECTS[a].label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-5 gap-2">
              {(["primary", "secondary", "accent", "background", "text"] as const).map((k) => (
                <label key={k} className="flex flex-col items-center gap-1 text-[11px] text-ink-400">
                  <input
                    type="color"
                    value={doc.style.colors[k]}
                    onChange={(e) => setStyle({ colors: { ...doc.style.colors, [k]: e.target.value } })}
                    className="h-9 w-full cursor-pointer rounded-md border border-ink-600 bg-transparent"
                    aria-label={`Cor ${k}`}
                  />
                  {{ primary: "Primária", secondary: "Secundária", accent: "Destaque", background: "Fundo", text: "Texto" }[k]}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fonte dos títulos" htmlFor="hf">
                <Select id="hf" value={doc.style.headingFont} onChange={(e) => setStyle({ headingFont: e.target.value as FontId })}>
                  {FONT_IDS.map((f) => (
                    <option key={f} value={f}>
                      {FONT_CATALOG[f].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fonte dos textos" htmlFor="bf">
                <Select id="bf" value={doc.style.bodyFont} onChange={(e) => setStyle({ bodyFont: e.target.value as FontId })}>
                  {FONT_IDS.map((f) => (
                    <option key={f} value={f}>
                      {FONT_CATALOG[f].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input type="checkbox" checked={doc.style.showLogo} onChange={(e) => setStyle({ showLogo: e.target.checked })} className="accent-iris-400" />
              Exibir logotipo / assinatura
            </label>
            <Field label="Assinatura (quando não há logotipo)" htmlFor="handle">
              <Input id="handle" value={doc.style.handle} maxLength={60} onChange={(e) => setStyle({ handle: e.target.value })} />
            </Field>
            <Button type="button" variant="secondary" size="sm" onClick={() => setStyle(structuredClone(brandStyle))}>
              Restaurar estilo da marca
            </Button>
          </fieldset>
        </Card>
      </div>
    </div>
  );
}
