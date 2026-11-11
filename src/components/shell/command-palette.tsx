"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { cx } from "../ui";

type Hit = { kind: "client" | "content" | "page"; id: string; title: string; detail: string; href: string };

const PAGES: Hit[] = [
  ["Início", "/"],
  ["Clientes", "/clientes"],
  ["Criar conteúdo", "/criar"],
  ["Calendário", "/calendario"],
  ["Conteúdos", "/conteudos"],
  ["Aprovações", "/aprovacoes"],
  ["Publicações", "/publicacoes"],
  ["Avisos", "/avisos"],
  ["Mídia", "/midia"],
  ["Layouts", "/templates"],
  ["Skills", "/skills"],
  ["Integrações", "/integracoes"],
  ["Custos", "/custos"],
  ["Equipe", "/usuarios"],
  ["Histórico", "/historico"],
  ["Configurações", "/configuracoes"],
].map(([title, href]) => ({ kind: "page" as const, id: href!, title: title!, detail: "Página", href: href! }));

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca rápida: Ctrl+K (ou ⌘K) em qualquer tela. */
export function CommandPalette() {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);

  const open = useCallback(() => {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    setTimeout(() => input.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    const onOpen = () => open();
    window.addEventListener("keydown", onKey);
    window.addEventListener("prisma:busca", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("prisma:busca", onOpen);
    };
  }, [open]);

  useEffect(() => {
    const pages = q.trim() ? PAGES.filter((p) => norm(p.title).includes(norm(q.trim()))) : PAGES.slice(0, 7);
    if (q.trim().length < 2) {
      const t = setTimeout(() => {
        setHits(pages);
        setActive(0);
      }, 0);
      return () => clearTimeout(t);
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/busca?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const json = (await res.json()) as { hits?: Hit[] };
        setHits([...(json.hits ?? []), ...pages]);
        setActive(0);
      } catch {
        // busca cancelada ou sem conexão: mantém o que já aparece
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function close() {
    ref.current?.close();
    setQ("");
  }
  function go(h: Hit | undefined) {
    if (!h) return;
    close();
    router.push(h.href);
  }

  return (
    <dialog
      ref={ref}
      aria-label="Busca rápida"
      onClose={() => setQ("")}
      onClick={(e) => e.target === ref.current && close()}
      className="mx-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-[14px] border border-ink-700 bg-ink-900 p-0 text-ink-100 shadow-[0_16px_48px_rgb(0_0_0/0.55)] backdrop:bg-black/60"
    >
      <div className="flex items-center gap-2.5 border-b border-ink-800 px-4">
        <Icon.search width={16} height={16} className="text-ink-400" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(hits[active]);
            }
          }}
          placeholder="Buscar clientes, peças ou páginas"
          aria-label="Buscar"
          className="h-12 flex-1 bg-transparent text-[15px] text-ink-50 placeholder:text-ink-500 focus:outline-none"
        />
        <kbd className="rounded border border-ink-700 px-1.5 text-[11px] text-ink-400">Esc</kbd>
      </div>
      <ul role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-y-auto py-1.5">
        {hits.length === 0 ? <li className="px-4 py-3 text-[13.5px] text-ink-400">Nada encontrado.</li> : null}
        {hits.map((h, i) => (
          <li key={`${h.kind}-${h.id}`} role="option" aria-selected={i === active}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
              className={cx(
                "flex w-full items-center gap-3 px-4 py-2 text-left",
                i === active ? "bg-white/[0.06]" : "",
              )}
            >
              <span className="w-16 shrink-0 text-[11.5px] text-ink-400">
                {h.kind === "client" ? "Cliente" : h.kind === "content" ? "Peça" : "Página"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-ink-50">{h.title}</span>
                {h.kind !== "page" ? <span className="block truncate text-[12px] text-ink-400">{h.detail}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

/** Botão que abre a busca (para quem não usa o atalho). */
export function SearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("prisma:busca"))}
      className={cx(
        "flex h-9 w-full items-center gap-2.5 rounded-full border border-ink-800 px-3 text-[13px] text-ink-400 hover:border-ink-700 hover:text-ink-200",
        className,
      )}
    >
      <Icon.search width={15} height={15} />
      <span className="flex-1 text-left">Buscar</span>
      <kbd className="text-[11px] text-ink-500">Ctrl K</kbd>
    </button>
  );
}
