"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { SKILL_LIMITS, parseSkillMd } from "@/lib/skills/skill-md";
import { SKILL_EXAMPLES } from "@/lib/skills/examples";
import { saveSkillAction } from "./actions";

type Effort = "low" | "medium" | "high";
const EFFORTS: Array<[Effort, string]> = [
  ["low", "Rápido: respostas curtas e simples"],
  ["medium", "Equilibrado"],
  ["high", "Caprichado: tarefas longas ou complexas (mais caro)"],
];

export interface SkillFormValues {
  name: string;
  description: string;
  instructions: string;
  effort: Effort;
  clientId: string | null;
  source: "manual" | "skill_md";
}

/** Criar ou editar uma skill. Importar um SKILL.md só preenche os campos: nada é salvo antes de clicar em salvar. */
export function SkillForm({
  skillId,
  version,
  initial,
  clients,
}: {
  skillId?: string;
  version?: number;
  initial?: SkillFormValues;
  clients: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState(saveSkillAction, { status: "idle" });
  const [values, setValues] = useState<SkillFormValues>(
    initial ?? { name: "", description: "", instructions: "", effort: "medium", clientId: null, source: "manual" },
  );
  const [importInfo, setImportInfo] = useState<{ tone: "success" | "warning"; lines: string[] } | null>(null);
  const [pasted, setPasted] = useState("");
  const fe = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  const set = <K extends keyof SkillFormValues>(k: K, v: SkillFormValues[K]) => setValues((p) => ({ ...p, [k]: v }));

  function applyImport(text: string, origin: string) {
    const parsed = parseSkillMd(text);
    if (!parsed.instructions) {
      setImportInfo({ tone: "warning", lines: [`${origin}: não encontrei instruções no conteúdo.`] });
      return;
    }
    setValues((p) => ({
      ...p,
      name: parsed.name || p.name,
      description: parsed.description || p.description,
      instructions: parsed.instructions,
      source: "skill_md",
    }));
    setImportInfo({
      tone: parsed.warnings.length ? "warning" : "success",
      lines: [`${origin} importado. Revise os campos abaixo e salve.`, ...parsed.warnings],
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) {
      setImportInfo({ tone: "warning", lines: ["O arquivo é grande demais para um SKILL.md (máximo de 200 KB)."] });
      return;
    }
    applyImport(await file.text(), file.name);
  }

  return (
    <div className="space-y-6">
      {!skillId ? (
        <Card>
          <CardHeader title="Começar mais rápido" description="Importe um SKILL.md (o formato das skills do Claude) ou parta de um modelo. Você revisa tudo antes de salvar." />
          <div className="grid gap-5 p-5 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Importar arquivo SKILL.md" htmlFor="skill-file" hint="Só o nome, a descrição e as instruções são usados. Scripts e arquivos extras da skill não rodam aqui.">
                <Input id="skill-file" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
              </Field>
              <details className="rounded-lg border border-ink-700 p-3">
                <summary className="cursor-pointer text-sm text-ink-200">Ou cole o conteúdo do SKILL.md</summary>
                <Textarea aria-label="Conteúdo do SKILL.md" value={pasted} onChange={(e) => setPasted(e.target.value)} className="mt-3 min-h-40 font-mono text-xs" placeholder={"---\nname: minha-skill\ndescription: O que ela faz e quando usar\n---\n\n# Instruções\n..."} />
                <Button type="button" variant="secondary" size="sm" className="mt-2" disabled={!pasted.trim()} onClick={() => applyImport(pasted, "Conteúdo colado")}>
                  Importar texto colado
                </Button>
              </details>
            </div>
            <Field label="Partir de um modelo" htmlFor="skill-example" hint="Preenche os campos com um exemplo editável.">
              <Select
                id="skill-example"
                defaultValue=""
                onChange={(e) => {
                  const ex = SKILL_EXAMPLES.find((x) => x.id === e.target.value);
                  if (!ex) return;
                  setValues((p) => ({ ...p, name: ex.name, description: ex.description, instructions: ex.instructions, effort: ex.effort, source: "manual" }));
                  setImportInfo({ tone: "success", lines: [`Modelo "${ex.name}" aplicado. Ajuste ao jeito da sua agência e salve.`] });
                }}
              >
                <option value="">Escolha um modelo...</option>
                {SKILL_EXAMPLES.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {importInfo ? (
            <div className="px-5 pb-5">
              <Alert tone={importInfo.tone}>
                {importInfo.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </Alert>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={skillId ? "Editar skill" : "Nova skill"}
          description="O perfil da marca, a memória e o contexto do cliente entram sozinhos em cada execução. Escreva aqui só o que a skill faz e como entregar."
        />
        <ActionForm action={action} state={state} className="space-y-5 p-5">
          {skillId ? <input type="hidden" name="skillId" value={skillId} /> : null}
          {version ? <input type="hidden" name="version" value={version} /> : null}
          <input type="hidden" name="source" value={values.source} />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Nome" htmlFor="name" error={fe("name")}>
              <Input id="name" name="name" value={values.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={SKILL_LIMITS.name} placeholder="Ex.: Roteiro de Reels" />
            </Field>
            <Field label="Vale para" htmlFor="clientId" error={fe("clientId")} hint="Uma skill exclusiva só aparece para quem acessa esse cliente.">
              <Select id="clientId" name="clientId" value={values.clientId ?? ""} onChange={(e) => set("clientId", e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    Só {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Descrição" htmlFor="description" error={fe("description")} hint="O que a skill entrega e quando usar. Aparece na lista de skills.">
            <Input id="description" name="description" value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={SKILL_LIMITS.description} />
          </Field>
          <Field
            label="Instruções"
            htmlFor="instructions"
            error={fe("instructions")}
            hint={`Explique como para um profissional experiente: objetivo, passo a passo, formato da entrega e exemplos. ${values.instructions.length.toLocaleString("pt-BR")} de ${SKILL_LIMITS.instructions.toLocaleString("pt-BR")} caracteres.`}
          >
            <Textarea
              id="instructions"
              name="instructions"
              value={values.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              required
              minLength={10}
              maxLength={SKILL_LIMITS.instructions}
              className="min-h-80 tabular text-[13px]"
            />
          </Field>
          <Field label="Nível de esforço da IA" htmlFor="effort" error={fe("effort")} hint="Mais esforço costuma dar resultados melhores em tarefas complexas, mas demora e custa mais.">
            <Select id="effort" name="effort" value={values.effort} onChange={(e) => set("effort", e.target.value as Effort)}>
              {EFFORTS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Salvando...">{skillId ? "Salvar alterações" : "Criar skill"}</SubmitButton>
            {skillId ? <span className="text-xs text-ink-400">Alterar nome, descrição, instruções ou esforço cria uma nova versão; as anteriores ficam guardadas.</span> : null}
          </div>
          <FormMessage state={state} />
        </ActionForm>
      </Card>
    </div>
  );
}
