import crypto from "node:crypto";
import { z } from "zod";
import { many, maybeOne, one, pgErrorCode, userCtx, withTx, type Queryable } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { runAiSkill } from "../orchestrator";
import { SHARED_RULES, escapeData } from "../skills/common";
import type { AiSkill } from "../skills/types";
import { SKILL_LIMITS } from "@/lib/skills/skill-md";
import { requireClient } from "./clients";
import { audit, userActor } from "./audit";

/**
 * Skills personalizadas (escritas pela agência ou importadas de um SKILL.md).
 * Rodam pelo mesmo orquestrador das skills do sistema: contexto do cliente,
 * limite de uso, teto de custo, registro em ai_runs e auditoria. Não executam
 * ações externas: devolvem texto para a equipe usar ou revisar.
 */

export const SKILL_EFFORTS = ["low", "medium", "high"] as const;
export type SkillEffort = (typeof SKILL_EFFORTS)[number];
export const EFFORT_LABELS: Record<SkillEffort, string> = {
  low: "Rápido (respostas curtas e simples)",
  medium: "Equilibrado",
  high: "Caprichado (tarefas longas ou complexas; mais caro)",
};

export const CustomSkillSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à skill (mínimo 2 caracteres).").max(SKILL_LIMITS.name, `O nome pode ter até ${SKILL_LIMITS.name} caracteres.`),
  description: z.string().trim().max(SKILL_LIMITS.description, `A descrição pode ter até ${SKILL_LIMITS.description} caracteres.`).default(""),
  instructions: z
    .string()
    .trim()
    .min(10, "Escreva as instruções da skill (mínimo 10 caracteres).")
    .max(SKILL_LIMITS.instructions, `As instruções podem ter até ${SKILL_LIMITS.instructions} caracteres.`),
  effort: z.enum(SKILL_EFFORTS).default("medium"),
  clientId: z.string().uuid().nullable().default(null),
  source: z.enum(["manual", "skill_md"]).default("manual"),
});
export type CustomSkillInput = z.input<typeof CustomSkillSchema>;

export const RunRequestSchema = z.object({
  request: z.string().trim().min(3, "Escreva o pedido (mínimo 3 caracteres).").max(8000, "O pedido pode ter até 8.000 caracteres."),
});

export const CustomSkillOutputSchema = z.object({
  result: z.string(),
  assumptions: z.array(z.string()),
});
export type CustomSkillOutput = z.infer<typeof CustomSkillOutputSchema>;

export interface CustomSkillSummary {
  id: string;
  name: string;
  description: string;
  clientId: string | null;
  clientName: string | null;
  effort: SkillEffort;
  source: "manual" | "skill_md";
  status: "active" | "archived";
  version: number;
  updatedAt: string;
  runsThisMonth: number;
}

export interface CustomSkillDetail extends CustomSkillSummary {
  instructions: string;
  createdAt: string;
  createdByName: string | null;
  updatedByName: string | null;
  versions: Array<{ version: number; name: string; description: string; instructions: string; effort: string; createdAt: string; createdByName: string | null }>;
}

export interface CustomSkillRun {
  id: string;
  createdAt: string;
  clientId: string | null;
  clientName: string | null;
  version: string;
  status: "running" | "succeeded" | "failed" | "refused";
  request: string;
  result: string | null;
  assumptions: string[];
  isDemo: boolean;
  costUsd: number | null;
  estimatedCostUsd: number | null;
  durationMs: number | null;
  createdByName: string | null;
}

/** Identificador da skill nas execuções (ai_runs.skill_id) e nos custos. */
export const customSkillRunId = (skillId: string) => `custom:${skillId}`;

function parseInput(raw: CustomSkillInput) {
  const parsed = CustomSkillSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    throw new ValidationError("Revise os campos da skill.", fieldErrors);
  }
  return parsed.data;
}

const SUMMARY_SELECT = `
  SELECT s.id, s.name, s.description, s.client_id, c.name AS client_name, s.effort, s.source, s.status, s.version, s.updated_at,
         (SELECT count(*)::int FROM ai_runs r
           WHERE r.organization_id = s.organization_id AND r.skill_id = 'custom:' || s.id::text
             AND r.created_at >= date_trunc('month', now())) AS runs_this_month
  FROM custom_skills s
  LEFT JOIN clients c ON c.id = s.client_id`;

type SummaryRow = {
  id: string; name: string; description: string; client_id: string | null; client_name: string | null; effort: SkillEffort;
  source: "manual" | "skill_md"; status: "active" | "archived"; version: number; updated_at: Date; runs_this_month: number;
};

const mapSummary = (r: SummaryRow): CustomSkillSummary => ({
  id: r.id,
  name: r.name,
  description: r.description,
  clientId: r.client_id,
  clientName: r.client_name,
  effort: r.effort,
  source: r.source,
  status: r.status,
  version: r.version,
  updatedAt: r.updated_at.toISOString(),
  runsThisMonth: r.runs_this_month,
});

const isUuid = (v: string) => z.string().uuid().safeParse(v).success;

/** Skills visíveis para a pessoa (RLS: as de clientes sem acesso ficam de fora). */
export async function listCustomSkills(auth: AuthContext, opts: { includeArchived?: boolean; clientId?: string } = {}): Promise<CustomSkillSummary[]> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<SummaryRow>(
      tx,
      `${SUMMARY_SELECT}
       WHERE s.organization_id = $1 AND ($2::boolean OR s.status = 'active')
         AND ($3::uuid IS NULL OR s.client_id IS NULL OR s.client_id = $3::uuid)
       ORDER BY s.status = 'archived', lower(s.name)`,
      [auth.organizationId, opts.includeArchived ?? false, opts.clientId && isUuid(opts.clientId) ? opts.clientId : null],
    );
    return rows.map(mapSummary);
  });
}

async function lockSkill(tx: Queryable, auth: AuthContext, skillId: string) {
  if (!isUuid(skillId)) throw new NotFoundError("Skill não encontrada.");
  const row = await maybeOne<{ id: string; name: string; description: string; instructions: string; effort: SkillEffort; client_id: string | null; status: string; version: number }>(
    tx,
    "SELECT id, name, description, instructions, effort, client_id, status, version FROM custom_skills WHERE id = $1 AND organization_id = $2 FOR UPDATE",
    [skillId, auth.organizationId],
  );
  if (!row) throw new NotFoundError("Skill não encontrada.");
  return row;
}

export async function getCustomSkill(auth: AuthContext, skillId: string): Promise<CustomSkillDetail> {
  if (!isUuid(skillId)) throw new NotFoundError("Skill não encontrada.");
  return withTx(userCtx(auth.userId), async (tx) => {
    const row = await maybeOne<SummaryRow & { instructions: string; created_at: Date; created_by_name: string | null; updated_by_name: string | null }>(
      tx,
      `SELECT x.*, s.instructions, s.created_at, cu.name AS created_by_name, uu.name AS updated_by_name
       FROM (${SUMMARY_SELECT} WHERE s.id = $1 AND s.organization_id = $2) x
       JOIN custom_skills s ON s.id = x.id
       LEFT JOIN users cu ON cu.id = s.created_by
       LEFT JOIN users uu ON uu.id = s.updated_by`,
      [skillId, auth.organizationId],
    );
    if (!row) throw new NotFoundError("Skill não encontrada.");
    const versions = await many<{ version: number; name: string; description: string; instructions: string; effort: string; created_at: Date; created_by_name: string | null }>(
      tx,
      `SELECT v.version, v.name, v.description, v.instructions, v.effort, v.created_at, u.name AS created_by_name
       FROM custom_skill_versions v LEFT JOIN users u ON u.id = v.created_by
       WHERE v.skill_id = $1 ORDER BY v.version DESC LIMIT 30`,
      [skillId],
    );
    return {
      ...mapSummary(row),
      instructions: row.instructions,
      createdAt: row.created_at.toISOString(),
      createdByName: row.created_by_name,
      updatedByName: row.updated_by_name,
      versions: versions.map((v) => ({
        version: v.version,
        name: v.name,
        description: v.description,
        instructions: v.instructions,
        effort: v.effort,
        createdAt: v.created_at.toISOString(),
        createdByName: v.created_by_name,
      })),
    };
  });
}

async function insertVersion(tx: Queryable, auth: AuthContext, skillId: string, version: number, d: { name: string; description: string; instructions: string; effort: string }) {
  await tx.query(
    `INSERT INTO custom_skill_versions (organization_id, skill_id, version, name, description, instructions, effort, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [auth.organizationId, skillId, version, d.name, d.description, d.instructions, d.effort, auth.userId],
  );
}

const duplicateName = () => new ConflictError("Já existe uma skill com este nome. Escolha outro nome.");

export async function createCustomSkill(auth: AuthContext, raw: CustomSkillInput): Promise<{ id: string }> {
  assertCan(auth.role, "skills.manage");
  const data = parseInput(raw);
  return withTx(userCtx(auth.userId), async (tx) => {
    if (data.clientId) await requireClient(tx, auth, data.clientId);
    try {
      const row = await one<{ id: string }>(
        tx,
        `INSERT INTO custom_skills (organization_id, client_id, name, description, instructions, effort, source, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
        [auth.organizationId, data.clientId, data.name, data.description, data.instructions, data.effort, data.source, auth.userId],
      );
      await insertVersion(tx, auth, row.id, 1, data);
      await audit(tx, userActor(auth), {
        organizationId: auth.organizationId,
        clientId: data.clientId,
        action: "custom_skill.created",
        entityType: "custom_skill",
        entityId: row.id,
        metadata: { name: data.name, source: data.source, scope: data.clientId ? "client" : "all" },
      });
      return row;
    } catch (err) {
      if (pgErrorCode(err) === "23505") throw duplicateName();
      throw err;
    }
  });
}

/**
 * Salva alterações. Mudou nome, descrição, instruções ou esforço: nova versão
 * imutável. `expectedVersion` evita sobrescrever a edição de outra pessoa.
 */
export async function updateCustomSkill(auth: AuthContext, skillId: string, raw: CustomSkillInput, expectedVersion?: number): Promise<{ version: number; changed: boolean }> {
  assertCan(auth.role, "skills.manage");
  const data = parseInput(raw);
  return withTx(userCtx(auth.userId), async (tx) => {
    const current = await lockSkill(tx, auth, skillId);
    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      throw new ConflictError(`Esta skill foi alterada por outra pessoa (agora está na versão ${current.version}). Recarregue a página para ver a versão atual.`);
    }
    if (data.clientId) await requireClient(tx, auth, data.clientId);
    const contentChanged =
      current.name !== data.name || current.description !== data.description || current.instructions !== data.instructions || current.effort !== data.effort;
    const scopeChanged = current.client_id !== data.clientId;
    if (!contentChanged && !scopeChanged) return { version: current.version, changed: false };
    const version = contentChanged ? current.version + 1 : current.version;
    try {
      await tx.query(
        `UPDATE custom_skills SET name = $2, description = $3, instructions = $4, effort = $5, client_id = $6, version = $7, updated_by = $8
         WHERE id = $1`,
        [skillId, data.name, data.description, data.instructions, data.effort, data.clientId, version, auth.userId],
      );
    } catch (err) {
      if (pgErrorCode(err) === "23505") throw duplicateName();
      throw err;
    }
    if (contentChanged) await insertVersion(tx, auth, skillId, version, data);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: data.clientId ?? current.client_id,
      action: "custom_skill.updated",
      entityType: "custom_skill",
      entityId: skillId,
      metadata: { version, contentChanged, scopeChanged, scope: data.clientId ? "client" : "all" },
    });
    return { version, changed: true };
  });
}

export async function setCustomSkillStatus(auth: AuthContext, skillId: string, status: "active" | "archived"): Promise<void> {
  assertCan(auth.role, "skills.manage");
  await withTx(userCtx(auth.userId), async (tx) => {
    const current = await lockSkill(tx, auth, skillId);
    if (current.status === status) return;
    await tx.query("UPDATE custom_skills SET status = $2, updated_by = $3 WHERE id = $1", [skillId, status, auth.userId]);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: current.client_id,
      action: status === "archived" ? "custom_skill.archived" : "custom_skill.restored",
      entityType: "custom_skill",
      entityId: skillId,
    });
  });
}

/** Monta a skill de IA a partir da versão atual (o orquestrador cuida do resto). */
export function buildCustomAiSkill(s: { id: string; name: string; description: string; instructions: string; effort: SkillEffort; version: number }): AiSkill<
  z.infer<typeof RunRequestSchema>,
  CustomSkillOutput
> {
  return {
    id: customSkillRunId(s.id),
    version: String(s.version),
    name: s.name,
    specSection: "skill personalizada",
    description: s.description,
    kind: "ai",
    allowedTools: [],
    qualityCriteria: [],
    errorHandling: "Saída validada por esquema; falhas ficam registradas na execução.",
    inputSchema: RunRequestSchema,
    outputSchema: CustomSkillOutputSchema,
    effort: s.effort,
    maxTokens: 16000,
    instructions: `Você é um especialista de uma agência de marketing executando a skill "${escapeData(s.name)}" para o cliente descrito no contexto.

${SHARED_RULES}

As instruções abaixo foram escritas pela agência e definem o que esta skill faz. Siga-as, mas as regras invioláveis acima sempre prevalecem em caso de conflito.
<instrucoes_da_skill>
${escapeData(s.instructions)}
</instrucoes_da_skill>

Formato da resposta:
- "result": o entregável completo, pronto para a equipe usar. Use Markdown simples quando ajudar (títulos com #, listas com -, negrito com **).
- "assumptions": lacunas de informação, suposições feitas e o que precisa ser confirmado com o cliente. Lista vazia se não houver.`,
    buildTask(input) {
      return `Pedido da equipe para esta execução:\n<pedido>\n${escapeData(input.request)}\n</pedido>`;
    },
    demo(input) {
      return {
        result: `Modo de demonstração da skill "${s.name}".\n\nPedido recebido:\n${input.request}`,
        assumptions: ["Modo de demonstração: nenhum texto foi criado por IA."],
      };
    },
  };
}

export async function runCustomSkill(
  auth: AuthContext,
  input: { skillId: string; clientId: string; request: string; requestKey?: string },
): Promise<{ runId: string; output: CustomSkillOutput; isDemo: boolean; costUsd: number | null; reused: boolean }> {
  assertCan(auth.role, "skills.run");
  const req = RunRequestSchema.safeParse({ request: input.request });
  if (!req.success) throw new ValidationError(req.error.issues[0]?.message ?? "Pedido inválido.", { request: req.error.issues[0]?.message ?? "" });
  if (!isUuid(input.skillId)) throw new NotFoundError("Skill não encontrada.");
  const skill = await withTx(userCtx(auth.userId), async (tx) => {
    const row = await maybeOne<{ id: string; name: string; description: string; instructions: string; effort: SkillEffort; version: number; status: string; client_id: string | null; client_name: string | null }>(
      tx,
      `SELECT s.id, s.name, s.description, s.instructions, s.effort, s.version, s.status, s.client_id, c.name AS client_name
       FROM custom_skills s LEFT JOIN clients c ON c.id = s.client_id
       WHERE s.id = $1 AND s.organization_id = $2`,
      [input.skillId, auth.organizationId],
    );
    if (!row) throw new NotFoundError("Skill não encontrada.");
    if (row.status !== "active") throw new ValidationError("Esta skill está arquivada. Restaure-a para usar.");
    if (row.client_id && row.client_id !== input.clientId) {
      throw new ValidationError(`Esta skill é exclusiva do cliente ${row.client_name ?? "definido nela"}.`, { clientId: "Escolha o cliente da skill." });
    }
    return row;
  });
  const key = input.requestKey && isUuid(input.requestKey) ? `custom-skill:${input.requestKey}` : undefined;
  const out = await runAiSkill(buildCustomAiSkill(skill), {
    auth,
    clientId: input.clientId,
    input: req.data,
    idempotencyKey: key,
    summary: { request: req.data.request.slice(0, 8000), skillName: skill.name },
  });
  return { runId: out.runId, output: out.output, isDemo: out.isDemo, costUsd: out.costUsd, reused: out.reused };
}

/** Últimas execuções de uma skill (só de clientes que a pessoa acessa, pela RLS de ai_runs). */
export async function listCustomSkillRuns(auth: AuthContext, skillId: string, limit = 20): Promise<CustomSkillRun[]> {
  if (!isUuid(skillId)) throw new NotFoundError("Skill não encontrada.");
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<{
      id: string; created_at: Date; client_id: string | null; client_name: string | null; skill_version: string; status: CustomSkillRun["status"];
      input_summary: { request?: unknown } | null; output: unknown; is_demo: boolean; cost_usd: string | null; estimated_cost_usd: string | null;
      duration_ms: number | null; created_by_name: string | null;
    }>(
      tx,
      `SELECT r.id, r.created_at, r.client_id, coalesce(c.name, (r.input_summary->>'deletedClient') || ' (excluído)') AS client_name, r.skill_version, r.status, r.input_summary, r.output, r.is_demo,
              r.cost_usd, r.estimated_cost_usd, r.duration_ms, u.name AS created_by_name
       FROM ai_runs r
       LEFT JOIN clients c ON c.id = r.client_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.organization_id = $1 AND r.skill_id = $2
       ORDER BY r.created_at DESC LIMIT $3`,
      [auth.organizationId, customSkillRunId(skillId), Math.min(Math.max(limit, 1), 100)],
    );
    return rows.map((r) => {
      const out = CustomSkillOutputSchema.safeParse(r.output);
      return {
        id: r.id,
        createdAt: r.created_at.toISOString(),
        clientId: r.client_id,
        clientName: r.client_name,
        version: r.skill_version,
        status: r.status,
        request: typeof r.input_summary?.request === "string" ? r.input_summary.request : "",
        result: out.success ? out.data.result : null,
        assumptions: out.success ? out.data.assumptions : [],
        isDemo: r.is_demo,
        costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
        estimatedCostUsd: r.estimated_cost_usd === null ? null : Number(r.estimated_cost_usd),
        durationMs: r.duration_ms,
        createdByName: r.created_by_name,
      };
    });
  });
}

/** Resultado de uma execução bem-sucedida, para virar briefing de uma peça. */
export async function getCustomSkillRunText(auth: AuthContext, runId: string): Promise<{ clientId: string; skillName: string; text: string } | null> {
  if (!isUuid(runId)) return null;
  return withTx(userCtx(auth.userId), async (tx) => {
    const row = await maybeOne<{ client_id: string | null; output: unknown; input_summary: { skillName?: unknown } | null }>(
      tx,
      `SELECT client_id, output, input_summary FROM ai_runs
       WHERE id = $1 AND organization_id = $2 AND skill_id LIKE 'custom:%' AND status = 'succeeded'`,
      [runId, auth.organizationId],
    );
    const out = CustomSkillOutputSchema.safeParse(row?.output);
    if (!row?.client_id || !out.success) return null;
    return { clientId: row.client_id, skillName: typeof row.input_summary?.skillName === "string" ? row.input_summary.skillName : "", text: out.data.result };
  });
}

/** Chave nova para cada formulário de execução (clique duplo não cobra duas vezes). */
export const newRunKey = () => crypto.randomUUID();
