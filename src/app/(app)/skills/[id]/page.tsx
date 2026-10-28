import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth/next";
import { can } from "@/server/authz/permissions";
import { NotFoundError } from "@/server/errors";
import { providerStatus } from "@/server/ai/gateway";
import { listClients } from "@/server/services/clients";
import { getCustomSkill, listCustomSkillRuns, newRunKey, type CustomSkillDetail } from "@/server/services/custom-skills";
import type { AuthContext } from "@/server/auth/types";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, TabLinks, buttonClass, formatDateTime, formatUsd } from "@/components/ui";
import { InlineAction } from "@/components/inline-action";
import { CopyButton } from "@/components/copy-button";
import { SkillForm } from "../skill-form";
import { skillStatusAction } from "../actions";
import { RunPanel } from "./run-panel";

export const metadata: Metadata = { title: "Skill" };

const EFFORT_LABEL: Record<string, string> = { low: "rápido", medium: "equilibrado", high: "caprichado" };

export default async function SkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; nova?: string; cliente?: string }>;
}) {
  const auth = await requireAuth();
  const { id } = await params;
  const { aba, nova, cliente } = await searchParams;
  const skill = await getCustomSkill(auth, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const canManage = can(auth.role, "skills.manage");
  const tabs: Array<[string, string]> = [["usar", "Usar"], ["historico", "Histórico"], ...(canManage ? ([["editar", "Editar"]] as Array<[string, string]>) : []), ["versoes", "Versões"]];
  const tab = tabs.some(([t]) => t === aba) ? aba! : "usar";

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/skills" className="hover:text-ink-200">
            Agentes e skills
          </Link>
        }
        title={skill.name}
        description={skill.description || undefined}
        actions={
          <a href={`/api/skills/${skill.id}/skill-md`} className={buttonClass("secondary", "sm")}>
            Baixar SKILL.md
          </a>
        }
      />
      <div className="-mt-5 mb-8 flex flex-wrap gap-1.5">
        <Badge tone="accent">versão {skill.version}</Badge>
        <Badge>{skill.clientName ? `Só ${skill.clientName}` : "Todos os clientes"}</Badge>
        <Badge>esforço {EFFORT_LABEL[skill.effort]}</Badge>
        {skill.source === "skill_md" ? <Badge tone="teal">importada de SKILL.md</Badge> : null}
        {skill.status === "archived" ? <Badge tone="warning">arquivada</Badge> : null}
      </div>
      {nova === "1" ? (
        <div className="mb-6">
          <Alert tone="success" title="Skill criada">
            Para usar, escolha o cliente, escreva o pedido e clique em Executar.
          </Alert>
        </div>
      ) : null}
      {skill.status === "archived" ? (
        <div className="mb-6">
          <Alert tone="warning" title="Skill arquivada">
            Ela não aparece na lista principal e não pode ser executada.
            {canManage ? <InlineAction action={skillStatusAction} fields={{ skillId: skill.id, op: "restore" }} label="Restaurar skill" className="mt-2" /> : null}
          </Alert>
        </div>
      ) : null}
      <TabLinks tabs={tabs.map(([t, label]) => ({ id: t, label, href: `/skills/${skill.id}?aba=${t}` }))} active={tab} />
      {tab === "usar" ? <UseTab auth={auth} skill={skill} defaultClientId={cliente ?? null} /> : null}
      {tab === "historico" ? <HistoryTab auth={auth} skill={skill} /> : null}
      {tab === "editar" && canManage ? <EditTab auth={auth} skill={skill} /> : null}
      {tab === "versoes" ? <VersionsTab skill={skill} /> : null}
    </>
  );
}

async function UseTab({ auth, skill, defaultClientId }: { auth: AuthContext; skill: CustomSkillDetail; defaultClientId: string | null }) {
  if (!can(auth.role, "skills.run")) {
    return <EmptyState title="Sem permissão para executar" description="Seu papel permite consultar a skill e o histórico." />;
  }
  if (skill.status === "archived") return <EmptyState title="Skill arquivada" description="Restaure a skill para voltar a usá-la." />;
  const clients = (await listClients(auth)).filter((c) => c.status !== "archived").map((c) => ({ id: c.id, name: c.name }));
  if (clients.length === 0) return <EmptyState title="Cadastre um cliente primeiro" description="Toda execução usa o perfil da marca e a memória de um cliente." />;
  const fixedClient = skill.clientId ? { id: skill.clientId, name: skill.clientName ?? "cliente" } : null;
  const provider = providerStatus();
  return (
    <RunPanel
      skillId={skill.id}
      requestKey={newRunKey()}
      clients={clients}
      fixedClient={fixedClient}
      defaultClientId={clients.some((c) => c.id === defaultClientId) ? defaultClientId : clients.length === 1 ? clients[0]!.id : null}
      providerReady={provider.configured}
      canCreateContent={can(auth.role, "content.create")}
    />
  );
}

const STATUS: Record<string, { label: string; tone: "success" | "info" | "danger" | "warning" }> = {
  succeeded: { label: "concluída", tone: "success" },
  running: { label: "em andamento", tone: "info" },
  failed: { label: "falhou", tone: "danger" },
  refused: { label: "recusada pela IA", tone: "warning" },
};

async function HistoryTab({ auth, skill }: { auth: AuthContext; skill: CustomSkillDetail }) {
  const runs = await listCustomSkillRuns(auth, skill.id, 30);
  if (runs.length === 0) return <EmptyState title="Nenhuma execução ainda" description="Os resultados de cada execução ficam guardados aqui." />;
  const canCreate = can(auth.role, "content.create");
  return (
    <Card>
      <CardHeader title="Execuções" description="As 30 mais recentes, dos clientes que você acessa. Falhas mostram o motivo em Custos e consumo." />
      <ul className="divide-y divide-ink-800">
        {runs.map((r) => (
          <li key={r.id}>
            <details className="group px-5 py-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-100">{formatDateTime(r.createdAt)}</span>
                <span className="text-ink-400">· {r.clientName ?? "—"}</span>
                <span className="text-ink-400">· v{r.version}</span>
                <Badge tone={STATUS[r.status]?.tone ?? "info"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                {r.isDemo ? <Badge tone="warning">demonstração</Badge> : null}
                <span className="ml-auto text-xs text-ink-400">
                  {r.createdByName ?? ""}
                  {!r.isDemo && r.costUsd !== null ? ` · ${formatUsd(r.costUsd, 4)}` : ""}
                </span>
                <span className="basis-full truncate text-xs text-ink-400">{r.request}</span>
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[12px] font-medium text-ink-400">Pedido</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-300">{r.request || "—"}</p>
                </div>
                {r.result !== null ? (
                  <>
                    <div>
                      <div className="text-[12px] font-medium text-ink-400">Resultado</div>
                      <div className="mt-1 whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-850 p-4 text-sm leading-relaxed text-ink-100">{r.result}</div>
                    </div>
                    {r.assumptions.length ? (
                      <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-300">
                        {r.assumptions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <CopyButton text={r.result} />
                      {canCreate && r.clientId ? (
                        <Link href={`/criar?de=${r.id}`} className={buttonClass("secondary", "sm")}>
                          Criar peça com este texto
                        </Link>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-400">Sem resultado nesta execução.</p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function EditTab({ auth, skill }: { auth: AuthContext; skill: CustomSkillDetail }) {
  const clients = (await listClients(auth)).filter((c) => c.status !== "archived" || c.id === skill.clientId).map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="space-y-6">
      <SkillForm
        skillId={skill.id}
        version={skill.version}
        clients={clients}
        initial={{ name: skill.name, description: skill.description, instructions: skill.instructions, effort: skill.effort, clientId: skill.clientId, source: skill.source }}
      />
      {skill.status === "active" ? (
        <Card>
          <CardHeader title="Arquivar" description="A skill some da lista e deixa de poder ser executada. O histórico e as versões continuam guardados, e dá para restaurar depois." />
          <div className="p-5">
            <InlineAction action={skillStatusAction} fields={{ skillId: skill.id, op: "archive" }} label="Arquivar skill" tone="danger" confirmMessage={`Arquivar a skill "${skill.name}"?`} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function VersionsTab({ skill }: { skill: CustomSkillDetail }) {
  return (
    <Card>
      <CardHeader title="Versões" description="Cada alteração no conteúdo da skill gera uma versão. As execuções registram a versão usada." />
      <ul className="divide-y divide-ink-800">
        {skill.versions.map((v) => (
          <li key={v.version}>
            <details className="px-5 py-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <Badge tone={v.version === skill.version ? "accent" : "neutral"}>v{v.version}</Badge>
                <span className="text-ink-100">{v.name}</span>
                <span className="ml-auto text-xs text-ink-400">
                  {formatDateTime(v.createdAt)}
                  {v.createdByName ? ` · ${v.createdByName}` : ""}
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                {v.description ? <p className="text-ink-300">{v.description}</p> : null}
                <p className="text-xs text-ink-400">Esforço: {EFFORT_LABEL[v.effort] ?? v.effort}</p>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-850 p-4 font-mono text-xs text-ink-200">{v.instructions}</pre>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}
