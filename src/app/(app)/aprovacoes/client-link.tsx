"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { CopyButton } from "@/components/copy-button";
import { Button, Input } from "@/components/ui";
import { clientLinkAction, emailClientLinkAction } from "./actions";

/** Link do mês: o cliente vê e responde tudo o que está aguardando aprovação. */
export function ClientLinkPanel({ clientId, clientName, pending }: { clientId: string; clientName: string; pending: number }) {
  const [link, create, creating] = useActionState(clientLinkAction, { status: "idle" });
  const [mail, send] = useActionState(emailClientLinkAction, { status: "idle" });
  const data = link.status === "ok" ? link.data : undefined;
  const message = data ? `Olá! Seguem ${data.pending === 1 ? "a peça" : `as ${data.pending} peças`} para aprovação. É só abrir o link, conferir e responder por lá: ${data.url}` : "";
  return (
    <div className="space-y-3 text-[13.5px]">
      {data ? (
        <>
          <code className="block select-all break-all rounded-[6px] bg-ink-950 px-2.5 py-1.5 font-mono text-[12px] text-ink-100 ring-1 ring-ink-700">{data.url}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={data.url} label="Copiar link" />
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-full border border-emerald-400/40 px-3.5 text-[13px] font-medium text-emerald-200 hover:bg-emerald-400/10">
              Enviar pelo WhatsApp
            </a>
          </div>
          <ActionForm action={send} state={mail} resetOnSuccess className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="clientId" value={clientId} />
            <Input name="email" type="email" placeholder="e-mail do cliente" aria-label="E-mail do cliente" className="w-60" required />
            <SubmitButton size="sm" variant="secondary" pendingText="Enviando...">
              Enviar por e-mail
            </SubmitButton>
          </ActionForm>
          <FormMessage state={mail} />
          <p className="text-[12px] text-ink-400">Vale 14 dias. Peças enviadas para aprovação nesse período aparecem no mesmo link.</p>
        </>
      ) : (
        <form action={create} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <Button type="submit" size="sm" variant="secondary" disabled={creating || pending === 0}>
            {creating ? "Gerando..." : `Link para ${clientName} aprovar ${pending === 1 ? "a peça" : `as ${pending} peças`}`}
          </Button>
          {link.status === "error" ? <span className="text-[12.5px] text-red-300">{link.message}</span> : null}
        </form>
      )}
    </div>
  );
}
