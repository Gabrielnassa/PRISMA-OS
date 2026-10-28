"use client";

import { useState, useTransition } from "react";
import type { BrandColors, PaletteSuggestion } from "@/server/brand/palette";
import type { InstagramColors } from "@/server/services/brand-colors";
import { Button, cx } from "@/components/ui";
import { suggestColorsFromInstagramAction, suggestColorsFromMediaAction } from "../actions";

const ROLES: Array<[keyof BrandColors, string]> = [
  ["primary", "Primária"],
  ["secondary", "Secundária"],
  ["accent", "Destaque"],
  ["background", "Fundo"],
  ["text", "Texto"],
];

type ImageOption = { id: string; filename: string; kind: string };
type Result = (PaletteSuggestion & { origin: string }) | null;

/**
 * Sugestão de cores a partir do Instagram do cliente (API oficial da Meta) ou
 * de imagens da biblioteca. Só preenche o formulário: nada é salvo sem clicar
 * em "Salvar perfil da marca".
 */
export function ColorSuggest({
  clientId,
  images,
  initialHandle,
  instagramReady,
  canUpload,
  onApply,
  onLogoSaved,
}: {
  clientId: string;
  images: ImageOption[];
  initialHandle: string;
  instagramReady: boolean;
  canUpload: boolean;
  onApply: (colors: BrandColors) => void;
  onLogoSaved: (mediaId: string) => void;
}) {
  const [handle, setHandle] = useState(initialHandle);
  const [saveLogo, setSaveLogo] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => images.filter((i) => i.kind === "logo").map((i) => i.id).slice(0, 3));
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"instagram" | "images" | null>(null);

  function run(kind: "instagram" | "images") {
    setError(null);
    setApplied(false);
    setBusy(kind);
    start(async () => {
      if (kind === "instagram") {
        const r = await suggestColorsFromInstagramAction(clientId, handle, saveLogo && canUpload);
        if (r.status === "ok" && r.data) {
          const d: InstagramColors = r.data;
          setResult({ ...d, origin: `@${d.username}${d.name ? ` (${d.name})` : ""} · foto de perfil e ${d.postsRead} post(s)` });
          if (d.savedLogoId) onLogoSaved(d.savedLogoId);
        } else if (r.status === "error") setError(r.message);
      } else {
        const r = await suggestColorsFromMediaAction(clientId, selected);
        if (r.status === "ok" && r.data) setResult({ ...r.data, origin: `${r.data.imagesUsed} imagem(ns) da biblioteca` });
        else if (r.status === "error") setError(r.message);
      }
      setBusy(null);
    });
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 12 ? s : [...s, id]));

  return (
    <div className="rounded-[var(--radius-card)] border border-ink-800 bg-ink-950/40 md:col-span-2">
      <div className="border-b border-ink-800 px-4 py-3">
        <div className="text-[14px] font-semibold text-ink-50">Sugerir cores</div>
        <p className="mt-0.5 text-[12.5px] text-ink-400">Pelo Instagram do cliente ou por imagens dele. A sugestão só preenche os campos abaixo; você revisa e salva.</p>
      </div>
      <div className="grid gap-px bg-ink-800 md:grid-cols-2">
        <div className="bg-ink-900 p-4">
          <label htmlFor="ig-handle" className="text-[13px] font-medium text-ink-200">
            Pelo @ do Instagram
          </label>
          <div className="mt-1.5 flex gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-md border border-ink-700 bg-ink-950/60 focus-within:border-violet-400/60">
              <span className="pl-3 font-mono text-[13px] text-ink-400">@</span>
              <input
                id="ig-handle"
                value={handle.replace(/^@/, "")}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="perfil.da.marca"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent px-1.5 py-[7px] text-[14px] text-ink-50 outline-none placeholder:text-ink-400"
              />
            </div>
            <Button type="button" variant="secondary" disabled={!instagramReady || pending || !handle.trim()} onClick={() => run("instagram")}>
              {busy === "instagram" ? "Buscando..." : "Buscar cores"}
            </Button>
          </div>
          {canUpload && instagramReady ? (
            <label className="mt-2.5 flex items-center gap-2 text-[12.5px] text-ink-300">
              <input type="checkbox" checked={saveLogo} onChange={(e) => setSaveLogo(e.target.checked)} />
              Guardar a foto de perfil como logotipo na biblioteca
            </label>
          ) : null}
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-400">
            {instagramReady
              ? "Usa a API oficial da Meta: funciona com contas comerciais ou de criador. Lê a foto de perfil e os posts recentes."
              : "Para buscar pelo @, conecte a API oficial da Meta (veja Integrações). Enquanto isso, use um print do perfil ou o logotipo ao lado."}
          </p>
        </div>

        <div className="bg-ink-900 p-4">
          <div className="text-[13px] font-medium text-ink-200">De imagens do cliente</div>
          {images.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
              Envie o logotipo, fotos ou um print do perfil do Instagram na aba Arquivos (PNG, JPEG ou SVG) e volte aqui.
            </p>
          ) : (
            <>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {images.slice(0, 18).map((img) => {
                  const on = selected.includes(img.id);
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => toggle(img.id)}
                      aria-pressed={on}
                      title={img.filename}
                      className={cx("relative size-14 overflow-hidden rounded-md border bg-ink-850", on ? "border-violet-400" : "border-ink-700 hover:border-ink-500")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/media/${img.id}`} alt={img.filename} className="h-full w-full object-contain" loading="lazy" />
                      {img.kind === "logo" ? <span className="absolute bottom-0 left-0 right-0 bg-ink-950/80 text-center font-mono text-[9px] text-ink-200">logo</span> : null}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                <Button type="button" variant="secondary" disabled={pending || selected.length === 0} onClick={() => run("images")}>
                  {busy === "images" ? "Lendo cores..." : `Extrair cores (${selected.length})`}
                </Button>
                <span className="text-[12px] text-ink-400">Logotipos pesam mais que fotos.</span>
              </div>
            </>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="border-t border-ink-800 px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="border-t border-ink-800 p-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[13px] font-medium text-ink-100">Sugestão</div>
            <div className="font-mono text-[11.5px] text-ink-400">{result.origin}</div>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {ROLES.map(([k, label]) => (
              <div key={k} className="min-w-0">
                <div className="h-10 rounded-md ring-1 ring-inset ring-white/10" style={{ backgroundColor: result.colors[k] }} />
                <div className="mt-1 truncate text-[12px] text-ink-300">{label}</div>
                <div className="font-mono text-[11px] text-ink-400">{result.colors[k]}</div>
              </div>
            ))}
          </div>
          {result.swatches.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] text-ink-400">Cores encontradas:</span>
              {result.swatches.map((sw) => (
                <span key={sw.hex} title={`${sw.hex} · ${Math.round(sw.share * 100)}%`} className="size-5 rounded-[4px] ring-1 ring-inset ring-white/10" style={{ backgroundColor: sw.hex }} />
              ))}
            </div>
          ) : null}
          {result.notes.length ? (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-400">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => {
                onApply(result.colors);
                setApplied(true);
              }}
            >
              Usar estas cores
            </Button>
            {applied ? (
              <span className="text-[12.5px] text-emerald-300">Cores aplicadas abaixo. Revise e salve o perfil; marque “Identidade visual definida” quando o cliente confirmar.</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
