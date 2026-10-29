"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import type { ActionState } from "@/server/actions";
import type { ContentStatus } from "@/lib/content/status";
import { FORMAT_LABELS, type ContentFormat } from "@/lib/content/document";
import { StatusBadge } from "./status";
import { Button, Table, Td, Th, cx } from "./ui";
import { useToast } from "./toast";

export interface ContentRow {
  id: string;
  title: string;
  clientName: string;
  format: ContentFormat;
  status: ContentStatus;
  currentVersion: number | null;
  hasApprovedVersion: boolean;
  /** Já formatado no servidor (evita diferença de fuso/ICU na hidratação). */
  updatedLabel: string;
  /** Data e hora completas (dica ao passar o mouse). */
  updatedTitle: string;
}

const checkbox = "size-4 cursor-pointer accent-iris-400 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Tabela de conteúdos. Com `onDelete` (só para quem pode excluir), ganha
 * seleção e exclusão definitiva em lote, com confirmação na própria barra.
 */
export function ContentTable({
  items,
  showClient = true,
  onDelete,
  footer,
}: {
  items: ContentRow[];
  showClient?: boolean;
  onDelete?: (ids: string[]) => Promise<ActionState<{ deleted: string[] }>>;
  footer?: ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  const selectable = items.filter((i) => i.status !== "generating").map((i) => i.id);
  // Só conta o que ainda está na lista (após excluir ou mudar de página).
  const chosen = selected.filter((id) => selectable.includes(id));
  const allOn = selectable.length > 0 && selectable.every((id) => chosen.includes(id));

  const toggle = (id: string) => {
    setConfirming(false);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const toggleAll = () => {
    setConfirming(false);
    setSelected(allOn ? [] : selectable);
  };
  const remove = () => {
    if (!onDelete || chosen.length === 0) return;
    start(async () => {
      const r = await onDelete(chosen);
      if (r.status === "ok") {
        toast("success", r.message ?? "Conteúdos excluídos.");
        setSelected([]);
      } else if (r.status === "error") {
        toast("error", r.message);
      }
      setConfirming(false);
    });
  };

  return (
    <>
      {onDelete && chosen.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-800 bg-ink-850/60 px-5 py-2.5 text-[13px]" role="region" aria-label="Ações para os selecionados">
          {confirming ? (
            <>
              <span className="text-ink-100">
                Excluir {chosen.length === 1 ? "1 conteúdo" : `${chosen.length} conteúdos`} de vez? Versões, aprovações e comentários também serão apagados. Não dá para desfazer.
              </span>
              <span className="ml-auto flex gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" variant="danger" disabled={pending} aria-busy={pending} onClick={remove}>
                  {pending ? "Excluindo..." : "Sim, excluir"}
                </Button>
              </span>
            </>
          ) : (
            <>
              <span className="font-medium text-ink-100">{chosen.length === 1 ? "1 selecionado" : `${chosen.length} selecionados`}</span>
              <button type="button" className="text-ink-400 hover:text-ink-100" onClick={() => setSelected([])}>
                Limpar seleção
              </button>
              <Button type="button" size="sm" variant="danger" className="ml-auto" onClick={() => setConfirming(true)}>
                Excluir definitivamente
              </Button>
            </>
          )}
        </div>
      ) : null}
      {/* Celular: cartões em vez de tabela com rolagem lateral. */}
      <ul className="divide-y divide-ink-800 md:hidden">
        {items.map((c) => {
          const on = chosen.includes(c.id);
          return (
            <li key={c.id} className={cx("flex gap-3 px-4 py-3.5", on && "bg-iris-400/[0.05]")}>
              {onDelete ? (
                <input type="checkbox" className={cx(checkbox, "mt-1")} aria-label={`Selecionar ${c.title} (lista)`} checked={on} disabled={c.status === "generating"} onChange={() => toggle(c.id)} />
              ) : null}
              <div className="min-w-0 flex-1">
                <Link href={`/conteudos/${c.id}`} className="block font-medium leading-snug text-ink-50">
                  {c.title}
                </Link>
                <div className="mt-1 text-[12.5px] text-ink-400">
                  {[showClient ? c.clientName : null, FORMAT_LABELS[c.format], c.currentVersion ? `v${c.currentVersion}` : null].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <StatusBadge status={c.status} />
                  <span className="text-[12.5px] text-ink-400" title={c.updatedTitle}>
                    {c.updatedLabel}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              {onDelete ? (
                <Th className="w-10 pr-0">
                  <input type="checkbox" className={checkbox} aria-label="Selecionar todos desta página" checked={allOn} disabled={selectable.length === 0} onChange={toggleAll} />
                </Th>
              ) : null}
              <Th>Título</Th>
              {showClient ? <Th>Cliente</Th> : null}
              <Th>Formato</Th>
              <Th>Status</Th>
              <Th>Versão</Th>
              <Th>Atualizado</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const on = chosen.includes(c.id);
              return (
                <tr key={c.id} className={cx("transition-colors hover:bg-ink-850/50", on && "bg-iris-400/[0.05]")}>
                  {onDelete ? (
                    <Td className="w-10 pr-0">
                      <input
                        type="checkbox"
                        className={checkbox}
                        aria-label={`Selecionar ${c.title}`}
                        title={c.status === "generating" ? "Em geração: aguarde terminar para excluir" : undefined}
                        checked={on}
                        disabled={c.status === "generating"}
                        onChange={() => toggle(c.id)}
                      />
                    </Td>
                  ) : null}
                  <Td>
                    <Link href={`/conteudos/${c.id}`} className="font-medium text-ink-50 underline-offset-4 hover:underline">
                      {c.title}
                    </Link>
                  </Td>
                  {showClient ? <Td>{c.clientName}</Td> : null}
                  <Td>{FORMAT_LABELS[c.format]}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td>
                    {c.currentVersion ? `v${c.currentVersion}` : "—"}
                    {c.hasApprovedVersion ? <span className="ml-1 text-xs text-emerald-300">(aprovada)</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-ink-400">
                    <span title={c.updatedTitle}>{c.updatedLabel}</span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
      {footer}
    </>
  );
}
