"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Field, Input, Select, cx } from "./ui";
import { Icon } from "./icons";

type Result = { filename: string; id?: string; duplicate?: boolean; error?: string };

export function MediaUploader({ clientId, defaultKind = "image" }: { clientId: string; defaultKind?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  const syncPicked = () => setPicked(Array.from(inputRef.current?.files ?? []).map((f) => f.name));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!inputRef.current?.files?.length) {
      setError("Selecione ao menos um arquivo.");
      return;
    }
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/media", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Falha no envio");
      setResults(json.results);
      if (inputRef.current) inputRef.current.value = "";
      setPicked([]);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 p-5 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Arquivos" htmlFor="files" hint="PNG, JPEG, GIF, SVG, PDF, MP4 ou MOV. O tipo real é verificado no servidor.">
        {/* Área de soltar: arraste fotos e vídeos ou clique para escolher. */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (inputRef.current && e.dataTransfer.files.length) {
              inputRef.current.files = e.dataTransfer.files;
              syncPicked();
            }
          }}
          className={cx(
            "flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-dashed px-4 py-3 text-center text-[13px] transition-colors has-[:focus-visible]:border-iris-400",
            over ? "border-iris-400 bg-iris-400/[0.07] text-ink-50" : "border-ink-600 text-ink-300 hover:border-ink-400",
          )}
        >
          <input
            ref={inputRef}
            id="files"
            name="files"
            type="file"
            multiple
            onChange={syncPicked}
            accept="image/png,image/jpeg,image/gif,image/svg+xml,application/pdf,video/mp4,video/quicktime"
            className="sr-only"
          />
          {picked.length ? (
            <span className="text-ink-50">{picked.length === 1 ? picked[0] : `${picked.length} arquivos selecionados`}</span>
          ) : (
            <>
              <span className="font-medium text-ink-100">Arraste fotos e vídeos aqui</span>
              <span className="text-ink-400">ou clique para escolher</span>
            </>
          )}
        </label>
      </Field>
      <Field label="Tipo" htmlFor="kind">
        <Select id="kind" name="kind" defaultValue={defaultKind}>
          <option value="image">Imagem</option>
          <option value="logo">Logotipo</option>
          <option value="document">Documento</option>
          <option value="video">Vídeo</option>
          <option value="other">Outro</option>
        </Select>
      </Field>
      <Field label="Descrição (texto alternativo)" htmlFor="altText">
        <Input id="altText" name="altText" maxLength={500} placeholder="O que aparece na imagem" />
      </Field>
      <Button type="submit" disabled={busy}>
        <Icon.upload /> {busy ? "Enviando..." : "Enviar"}
      </Button>
      <div className="md:col-span-4">
        <Field label="Origem / licença" htmlFor="licenseNote" hint="Ex.: foto própria do cliente, banco licenciado (nº da licença).">
          <Input id="licenseNote" name="licenseNote" maxLength={500} />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-300 md:col-span-4">
          {error}
        </p>
      ) : null}
      {results.length ? (
        <ul className="space-y-1 text-sm md:col-span-4" role="status">
          {results.map((r) => (
            <li key={r.filename} className={r.error ? "text-red-300" : "text-emerald-300"}>
              {r.filename}: {r.error ?? (r.duplicate ? "já existia na biblioteca (reaproveitado)" : "enviado")}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
