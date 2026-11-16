"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { CopyButton } from "@/components/copy-button";
import { Button, Input } from "@/components/ui";
import { clientLinkAction, emailClientLinkAction } from "./actions";

/** Link do mês: o cliente vê e responde tudo o que está aguardando aprovação. */
export function ClientLinkPanel({
  clientId,
  clientName,
  pending,
}: {
  clientId: string;
  clientName: string;
  pending: number;
}) {
  const [link, create, creating] = useActionState(clientLinkAction, { status: "idle" });
  const [mail, send] = useActionState(emailClientLinkAction, { status: "idle" });
  const data = link.status === "ok" ? link.data : undefined;
  const message = data
    ? `Olá! Seguem ${data.pending === 1 ? "a peça" : `as ${data.pending} peças`} para aprovação. É só abrir o link, conferir e responder por lá: ${data.url}`
    : "";
  return (
    <div className="space-y-3 text-base">
      {data ? (
        <>
          <code className="block rounded-md bg-bg px-2.5 py-1.5 font-mono text-sm break-all text-fg ring-1 ring-line select-all">
            {data.url}
          </code>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={data.url} label="Copiar link" />
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-sm border border-ok/40 px-3.5 text-base font-medium text-fg hover:bg-ok/10"
            >
              Enviar pelo WhatsApp
            </a>
          </div>
          <ActionForm action={send} state={mail} resetOnSuccess className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="clientId" value={clientId} />
            <Input
              name="email"
              type="email"
              placeholder="e-mail do cliente"
              aria-label="E-mail do cliente"
              className="w-60"
              required
            />
            <SubmitButton size="sm" variant="secondary" pendingText="Enviando...">
              Enviar por e-mail
            </SubmitButton>
          </ActionForm>
          <FormMessage state={mail} />
          <p className="text-sm text-muted">
            Vale 14 dias. Peças enviadas para aprovação nesse período aparecem no mesmo link.
          </p>
        </>
      ) : (
        <form action={create} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <Button type="submit" size="sm" variant="secondary" disabled={creating || pending === 0}>
            {creating
              ? "Gerando..."
              : `Link para ${clientName} aprovar ${pending === 1 ? "a peça" : `as ${pending} peças`}`}
          </Button>
          {link.status === "error" ? <span className="text-sm text-danger">{link.message}</span> : null}
        </form>
      )}
    </div>
  );
}
