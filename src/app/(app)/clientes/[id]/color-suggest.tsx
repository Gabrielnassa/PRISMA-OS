"use client";

import { useState, useTransition } from "react";
import type { BrandColors, PaletteSuggestion } from "@/server/brand/palette";
import type { InstagramColors } from "@/server/services/brand-colors";
import { Button, cx } from "@/components/ui";
import { plural } from "@/lib/text";
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
  const [selected, setSelected] = useState<string[]>(() =>
    images
      .filter((i) => i.kind === "logo")
      .map((i) => i.id)
      .slice(0, 3),
  );
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
          setResult({
            ...d,
            origin: `@${d.username}${d.name ? ` (${d.name})` : ""} · foto de perfil e ${plural(d.postsRead, "post", "posts")}`,
          });
          if (d.savedLogoId) onLogoSaved(d.savedLogoId);
        } else if (r.status === "error") setError(r.message);
      } else {
        const r = await suggestColorsFromMediaAction(clientId, selected);
        if (r.status === "ok" && r.data)
          setResult({ ...r.data, origin: `${plural(r.data.imagesUsed, "imagem", "imagens")} da biblioteca` });
        else if (r.status === "error") setError(r.message);
      }
      setBusy(null);
    });
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 12 ? s : [...s, id]));

  return (
    <div className="rounded-md border border-line bg-bg/40 md:col-span-2">
      <div className="border-b border-line px-4 py-3">
        <div className="text-base font-semibold text-fg">Sugerir cores</div>
        <p className="mt-0.5 text-sm text-muted">
          Pelo Instagram do cliente ou por imagens dele. A sugestão só preenche os campos abaixo; você revisa e salva.
        </p>
      </div>
      <div className="grid gap-px bg-surface-2 md:grid-cols-2">
        <div className="bg-surface p-4">
          <label htmlFor="ig-handle" className="text-base font-medium text-fg">
            Pelo @ do Instagram
          </label>
          <div className="mt-1.5 flex gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-md border border-line bg-bg/60 focus-within:border-accent/60">
              <span className="tabular pl-3 text-base text-muted">@</span>
              <input
                id="ig-handle"
                value={handle.replace(/^@/, "")}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="perfil.da.marca"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent px-1.5 py-[7px] text-base text-fg outline-none placeholder:text-muted"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!instagramReady || pending || !handle.trim()}
              onClick={() => run("instagram")}
            >
              {busy === "instagram" ? "Buscando..." : "Buscar cores"}
            </Button>
          </div>
          {canUpload && instagramReady ? (
            <label className="mt-2.5 flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={saveLogo} onChange={(e) => setSaveLogo(e.target.checked)} />
              Guardar a foto de perfil como logotipo na biblioteca
            </label>
          ) : null}
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            {instagramReady
              ? "Funciona com contas comerciais ou de criador."
              : "Para buscar pelo @, conecte a Meta em Integrações. Enquanto isso, use um print do perfil ou o logotipo."}
          </p>
        </div>

        <div className="bg-surface p-4">
          <div className="text-base font-medium text-fg">De imagens do cliente</div>
          {images.length === 0 ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Envie o logotipo, fotos ou um print do perfil do Instagram na aba Arquivos (PNG, JPEG ou SVG) e volte
              aqui.
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
                      className={cx(
                        "relative size-14 overflow-hidden rounded-md border bg-surface",
                        on ? "border-accent" : "border-line hover:border-control",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/media/${img.id}`}
                        alt={img.filename}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                      {img.kind === "logo" ? (
                        <span className="tabular absolute right-0 bottom-0 left-0 bg-bg/80 text-center text-xs text-fg">
                          logo
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || selected.length === 0}
                  onClick={() => run("images")}
                >
                  {busy === "images" ? "Lendo cores..." : `Extrair cores (${selected.length})`}
                </Button>
                <span className="text-sm text-muted">Logotipos pesam mais que fotos.</span>
              </div>
            </>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="border-t border-line px-4 py-3 text-base text-danger">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="border-t border-line p-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-base font-medium text-fg">Sugestão</div>
            <div className="tabular text-xs text-muted">{result.origin}</div>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {ROLES.map(([k, label]) => (
              <div key={k} className="min-w-0">
                <div
                  className="h-10 rounded-md ring-1 ring-line ring-inset"
                  style={{ backgroundColor: result.colors[k] }}
                />
                <div className="mt-1 truncate text-sm text-muted">{label}</div>
                <div className="tabular text-xs text-muted">{result.colors[k]}</div>
              </div>
            ))}
          </div>
          {result.swatches.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-sm text-muted">Cores encontradas:</span>
              {result.swatches.map((sw) => (
                <span
                  key={sw.hex}
                  title={`${sw.hex} · ${Math.round(sw.share * 100)}%`}
                  className="size-5 rounded-sm ring-1 ring-line ring-inset"
                  style={{ backgroundColor: sw.hex }}
                />
              ))}
            </div>
          ) : null}
          {result.notes.length ? (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-muted">
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
              <span className="text-sm text-ok">
                Cores aplicadas abaixo. Revise e salve o perfil; marque “Identidade visual definida” quando o cliente
                confirmar.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
