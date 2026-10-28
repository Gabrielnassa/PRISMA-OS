"use client";

import { useActionState, useState } from "react";
import type { ClientDeletionSummary } from "@/server/services/deletion";
import { confirmsName } from "@/lib/confirm-name";
import { Alert, Card, CardHeader, Field, Input } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { deleteClientAction } from "../actions";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Exclusão definitiva do cliente: lista o que será apagado e pede o nome para confirmar. */
export function DeleteClientCard({ clientId, summary }: { clientId: string; summary: ClientDeletionSummary }) {
  const [state, action] = useActionState(deleteClientAction, { status: "idle" });
  const [typed, setTyped] = useState("");
  const matches = confirmsName(typed, summary.name);

  return (
    <Card className="border-red-400/20">
      <CardHeader title="Excluir cliente" description="Apaga de vez o cliente e tudo dele. Não dá para desfazer." />
      <div className="grid gap-4 p-5">
        <div className="text-[13px] leading-relaxed text-ink-300">
          <div className="text-ink-200">Será apagado:</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {summary.contents ? (
              <li>
                {plural(summary.contents, "conteúdo", "conteúdos")} ({plural(summary.versions, "versão", "versões")}), com aprovações e comentários
              </li>
            ) : null}
            {summary.media ? <li>{plural(summary.media, "arquivo", "arquivos")} da biblioteca</li> : null}
            {summary.memories ? <li>{plural(summary.memories, "registro", "registros")} de memória</li> : null}
            {summary.skills ? <li>{plural(summary.skills, "skill exclusiva", "skills exclusivas")} deste cliente</li> : null}
            <li>perfil da marca e limite de custos</li>
          </ul>
          <p className="mt-2 text-ink-400">
            O consumo de IA continua nos totais de Custos, sem o texto gerado. Para só tirar o cliente das listas, arquive em Dados do cliente.
          </p>
        </div>
        {summary.inProgress ? (
          <Alert tone="warning" title="Geração em andamento">
            Aguarde as gerações deste cliente terminarem para excluir.
          </Alert>
        ) : null}
        <ActionForm action={action} state={state} className="grid gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <Field
            label={
              <>
                Para confirmar, digite <span className="font-semibold text-ink-50">{summary.name}</span>
              </>
            }
            htmlFor="delete-confirmation"
            error={state.status === "error" ? state.fieldErrors?.confirmation : undefined}
          >
            <Input id="delete-confirmation" name="confirmation" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
          {state.status === "error" && !state.fieldErrors?.confirmation ? <FormMessage state={state} /> : null}
          <div>
            <SubmitButton variant="danger" disabled={!matches || summary.inProgress} pendingText="Excluindo...">
              Excluir cliente definitivamente
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </Card>
  );
}
