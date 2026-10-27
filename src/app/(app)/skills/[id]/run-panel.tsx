"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Badge, Card, CardHeader, Field, Select, Textarea, buttonClass, formatUsd } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { CopyButton } from "@/components/copy-button";
import type { ActionState } from "@/server/actions";
import { runSkillAction, type RunSkillData } from "../actions";

export function RunPanel({
  skillId,
  requestKey,
  clients,
  fixedClient,
  defaultClientId,
  providerReady,
  canCreateContent,
}: {
  skillId: string;
  requestKey: string;
  clients: Array<{ id: string; name: string }>;
  /** Skill exclusiva de um cliente: o cliente não é escolhido. */
  fixedClient: { id: string; name: string } | null;
  defaultClientId: string | null;
  providerReady: boolean;
  canCreateContent: boolean;
}) {
  const [state, action] = useActionState<ActionState<RunSkillData>, FormData>(runSkillAction, { status: "idle" });
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  const result = state.status === "ok" ? state.data : undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Usar esta skill" description="Escolha o cliente e escreva o pedido. O perfil da marca, a memória e o contexto do cliente vão junto automaticamente." />
        <ActionForm action={action} state={state} className="space-y-5 p-5">
          <input type="hidden" name="skillId" value={skillId} />
          <input type="hidden" name="requestKey" value={requestKey} />
          {fixedClient ? (
            <>
              <input type="hidden" name="clientId" value={fixedClient.id} />
              <p className="text-sm text-ink-300">
                Cliente: <span className="font-medium text-ink-100">{fixedClient.name}</span> (skill exclusiva deste cliente)
              </p>
            </>
          ) : (
            <Field label="Cliente" htmlFor="run-client" error={fe("clientId")}>
              <Select id="run-client" name="clientId" defaultValue={defaultClientId ?? ""} required>
                <option value="" disabled>
                  Selecione o cliente...
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Pedido" htmlFor="run-request" error={fe("request")} hint="O que você quer desta vez: tema, objetivo, detalhes, o que evitar. Pode colar textos de referência.">
            <Textarea id="run-request" name="request" required minLength={3} maxLength={8000} className="min-h-36" placeholder="Ex.: Roteiro sobre os 3 erros mais comuns ao contratar o serviço, para gerar pedidos de orçamento." />
          </Field>
          {!providerReady ? (
            <Alert tone="warning" title="IA não configurada">
              Para executar skills, configure a chave da Anthropic. Veja como em Integrações.
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Executando... pode levar até 1 minuto" disabled={!providerReady}>
              Executar skill
            </SubmitButton>
            <span className="text-xs text-ink-400">Cada execução consome créditos da chave da Anthropic e aparece em Custos e consumo.</span>
          </div>
          <FormMessage state={state} />
        </ActionForm>
      </Card>

      {result ? <RunResult result={result} canCreateContent={canCreateContent} /> : null}
    </div>
  );
}

export function RunResult({ result, canCreateContent }: { result: RunSkillData; canCreateContent: boolean }) {
  return (
    <Card>
      <CardHeader
        title="Resultado"
        description={result.isDemo ? "Demonstração: nenhum texto foi criado por IA." : result.costUsd !== null ? `Custo desta execução: ${formatUsd(result.costUsd, 4)}` : undefined}
        actions={result.isDemo ? <Badge tone="warning">demonstração</Badge> : null}
      />
      <div className="space-y-4 p-5">
        <div className="whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-850 p-4 text-sm leading-relaxed text-ink-100">{result.result}</div>
        {result.assumptions.length ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Para confirmar com o cliente</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-300">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <CopyButton text={result.result} />
          {canCreateContent ? (
            <Link href={`/criar?de=${result.runId}`} className={buttonClass("secondary", "sm")}>
              Criar peça com este texto
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
