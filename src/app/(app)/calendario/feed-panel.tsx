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
    <details className="group mt-6 rounded-[var(--radius-card)] border border-ink-700/80 bg-ink-900 px-5 py-4 text-[13.5px]">
      <summary className="cursor-pointer font-medium text-ink-100">Ver no Google Agenda ou no celular</summary>
      <div className="mt-3 space-y-3 text-ink-300">
        <p>Gere um endereço privado e assine no Google Agenda (Outras agendas, Do URL), no Apple Calendário (Nova assinatura) ou no Outlook. Aparecem as pautas e as publicações agendadas dos clientes que você acessa.</p>
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="select-all break-all rounded-[4px] bg-ink-950 px-2 py-1 font-mono text-[12px] text-ink-100 ring-1 ring-ink-700">{url}</code>
            <CopyButton text={url} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <ActionForm action={action} state={state} confirmMessage={active && !url ? "Gerar um endereço novo? O anterior deixa de funcionar." : undefined} confirmLabel="Gerar">
            <SubmitButton size="sm" variant="secondary" pendingText="Gerando...">
              {active || url ? "Gerar novo endereço" : "Gerar endereço da agenda"}
            </SubmitButton>
          </ActionForm>
          {active ? <InlineAction action={revokeFeedAction} fields={{}} label="Desativar" tone="danger" confirmMessage="Desativar o endereço da agenda? As agendas que assinaram param de atualizar." /> : null}
        </div>
        <p className="text-[12px] text-ink-400">Quem tiver o endereço vê a sua agenda. Não compartilhe; se vazar, gere um novo.</p>
      </div>
    </details>
  );
}
