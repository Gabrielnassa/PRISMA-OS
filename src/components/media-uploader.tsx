"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Field, Input, Select } from "./ui";
import { Icon } from "./icons";

type Result = { filename: string; id?: string; duplicate?: boolean; error?: string };

export function MediaUploader({ clientId, defaultKind = "image" }: { clientId: string; defaultKind?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        <input
          ref={inputRef}
          id="files"
          name="files"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/svg+xml,application/pdf,video/mp4,video/quicktime"
          className="block w-full text-sm text-ink-300 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-700 file:px-3 file:py-2 file:text-sm file:text-ink-100 hover:file:bg-ink-600"
        />
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
