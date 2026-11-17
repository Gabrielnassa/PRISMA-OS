"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button, buttonClass } from "@/components/ui";
import { reportLinkAction } from "./actions";

/** Barra do relatório (some na impressão): mês, imprimir/PDF e link para o cliente. */
export function ReportToolbar({
  clientId,
  clientName,
  month,
  prevHref,
  nextHref,
  backHref,
  canShare,
}: {
  clientId: string;
  clientName: string;
  month: string;
  prevHref: string;
  nextHref: string;
  backHref: string;
  canShare: boolean;
}) {
  const [link, create, creating] = useActionState(reportLinkAction, { status: "idle" });
  const url = link.status === "ok" ? link.data?.url : undefined;
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
        <a href={backHref} className="mr-2 text-base text-muted hover:text-fg">
          ← {clientName}
        </a>
        <a href={prevHref} className={buttonClass("ghost", "sm")} aria-label="Mês anterior">
          ←
        </a>
        <a href={nextHref} className={buttonClass("ghost", "sm")} aria-label="Próximo mês">
          →
        </a>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="secondary" onClick={() => window.print()}>
          Imprimir ou salvar PDF
        </Button>
        {canShare ? (
          url ? (
            <>
              <CopyButton text={url} label="Copiar link" />
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Olá! Segue o relatório de ${month.split("-").reverse().join("/")}: ${url}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center rounded-sm border border-ok/40 px-3.5 text-base font-medium text-fg hover:bg-ok/10"
              >
                WhatsApp
              </a>
            </>
          ) : (
            <form action={create}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="month" value={month} />
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? "Gerando..." : "Link para o cliente"}
              </Button>
            </form>
          )
        ) : null}
      </div>
      {link.status === "error" ? <p className="mx-auto mt-2 max-w-4xl text-sm text-danger">{link.message}</p> : null}
      {url ? (
        <p className="mx-auto mt-2 max-w-4xl text-sm break-all text-muted">{url} · vale 30 dias, só leitura</p>
      ) : null}
    </div>
  );
}
