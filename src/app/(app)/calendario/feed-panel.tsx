"use client";

import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/form";
import { CopyButton } from "@/components/copy-button";
import { InlineAction } from "@/components/inline-action";
import { createFeedAction, revokeFeedAction } from "./actions";

/** Endereço privado para assinar a agenda no Google Agenda, Apple Calendário ou Outlook. */
export function FeedPanel({ active }: { active: boolean }) {
  const [state, action] = useActionState(createFeedAction, { status: "idle" });
  const url = state.status === "ok" ? state.data?.url : undefined;
  return (
    <details className="group mt-6 rounded-md border border-line bg-surface px-5 py-4 text-base">
      <summary className="cursor-pointer font-medium text-fg">Ver no Google Agenda ou no celular</summary>
      <div className="mt-3 space-y-3 text-muted">
        <p>
          Gere um endereço privado e assine no Google Agenda (Outras agendas, Do URL), no Apple Calendário (Nova
          assinatura) ou no Outlook. Aparecem as pautas e as publicações agendadas dos clientes que você acessa.
        </p>
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-sm bg-bg px-2 py-1 font-mono text-sm break-all text-fg ring-1 ring-line select-all">
              {url}
            </code>
            <CopyButton text={url} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <ActionForm
            action={action}
            state={state}
            confirmMessage={active && !url ? "Gerar um endereço novo? O anterior deixa de funcionar." : undefined}
            confirmLabel="Gerar"
          >
            <SubmitButton size="sm" variant="secondary" pendingText="Gerando...">
              {active || url ? "Gerar novo endereço" : "Gerar endereço da agenda"}
            </SubmitButton>
          </ActionForm>
          {active ? (
            <InlineAction
              action={revokeFeedAction}
              fields={{}}
              label="Desativar"
              tone="danger"
              confirmMessage="Desativar o endereço da agenda? As agendas que assinaram param de atualizar."
            />
          ) : null}
        </div>
        <p className="text-sm text-muted">
          Quem tiver o endereço vê a sua agenda. Não compartilhe; se vazar, gere um novo.
        </p>
      </div>
    </details>
  );
}
