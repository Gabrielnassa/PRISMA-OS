import { afterEach, describe, expect, it } from "vitest";
import { many, userCtx, withTx } from "../../src/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../src/server/errors";
import { setProviderOverride } from "../../src/server/ai/gateway";
import { createClient } from "../../src/server/services/clients";
import { updateMember } from "../../src/server/services/users";
import { getCostSummary } from "../../src/server/services/costs";
import {
  createCustomSkill,
  getCustomSkill,
  getCustomSkillRunText,
  listCustomSkillRuns,
  listCustomSkills,
  runCustomSkill,
  setCustomSkillStatus,
  updateCustomSkill,
} from "../../src/server/services/custom-skills";
import { FakeProvider, addMember, newOrg } from "./helpers";

const base = {
  name: "Roteiro de Reels",
  description: "Roteiros curtos com gancho.",
  instructions: "Crie um roteiro de 30 segundos com gancho, cenas e legenda.",
  effort: "medium" as const,
};

async function setup() {
  const { owner } = await newOrg();
  const a = await createClient(owner, { name: "Padaria Pão Bom", segment: "Alimentação" });
  const b = await createClient(owner, { name: "Studio Pilates", segment: "Saúde" });
  return { owner, clientA: a.id, clientB: b.id };
}

describe("skills personalizadas", () => {
  afterEach(() => setProviderOverride(null));

  it("cria, versiona a cada alteração de conteúdo e protege contra edição simultânea", async () => {
    const { owner, clientA } = await setup();
    const { id } = await createCustomSkill(owner, base);
    let skill = await getCustomSkill(owner, id);
    expect(skill.version).toBe(1);
    expect(skill.versions.map((v) => v.version)).toEqual([1]);

    const r = await updateCustomSkill(owner, id, { ...base, instructions: `${base.instructions} Termine com uma pergunta.` }, 1);
    expect(r).toEqual({ version: 2, changed: true });
    skill = await getCustomSkill(owner, id);
    expect(skill.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(skill.versions[1]!.instructions).toBe(base.instructions);

    // Sem mudanças: nenhuma versão nova.
    expect(await updateCustomSkill(owner, id, { ...base, instructions: skill.instructions }, 2)).toEqual({ version: 2, changed: false });
    // Mudar só o cliente não cria versão de conteúdo.
    expect(await updateCustomSkill(owner, id, { ...base, instructions: skill.instructions, clientId: clientA }, 2)).toEqual({ version: 2, changed: true });
    expect((await getCustomSkill(owner, id)).clientId).toBe(clientA);
    // Formulário aberto na versão 1: recusado.
    await expect(updateCustomSkill(owner, id, { ...base, name: "Outro nome" }, 1)).rejects.toBeInstanceOf(ConflictError);
  });

  it("recusa nome repetido (sem diferenciar maiúsculas) e campos inválidos com mensagens por campo", async () => {
    const { owner } = await setup();
    await createCustomSkill(owner, base);
    await expect(createCustomSkill(owner, { ...base, name: "roteiro DE reels" })).rejects.toBeInstanceOf(ConflictError);
    const err = await createCustomSkill(owner, { name: "x", instructions: "curta" }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys((err as ValidationError).fieldErrors).sort()).toEqual(["instructions", "name"]);
  });

  it("só proprietário e administrador gerenciam; criação executa; leitura não executa", async () => {
    const { owner, clientA } = await setup();
    const { id } = await createCustomSkill(owner, base);
    const editor = await addMember(owner, "editor");
    const viewer = await addMember(owner, "viewer");
    await updateMember(owner, editor.userId, { role: "editor", isActive: true, clientIds: [clientA] });
    await updateMember(owner, viewer.userId, { role: "viewer", isActive: true, clientIds: [clientA] });

    await expect(createCustomSkill(editor, { ...base, name: "Da criação" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCustomSkillStatus(editor, id, "archived")).rejects.toBeInstanceOf(ForbiddenError);
    const run = await runCustomSkill(editor, { skillId: id, clientId: clientA, request: "Tema: pão de fermentação natural" });
    expect(run.isDemo).toBe(true);
    await expect(runCustomSkill(viewer, { skillId: id, clientId: clientA, request: "Tema qualquer" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("skill exclusiva de um cliente: invisível para quem não acessa o cliente e não roda em outro cliente", async () => {
    const { owner, clientA, clientB } = await setup();
    const exclusive = await createCustomSkill(owner, { ...base, name: "Só da padaria", clientId: clientA });
    const general = await createCustomSkill(owner, { ...base, name: "Geral" });
    const editor = await addMember(owner, "editor");
    await updateMember(owner, editor.userId, { role: "editor", isActive: true, clientIds: [clientB] });

    expect((await listCustomSkills(editor)).map((s) => s.id)).toEqual([general.id]);
    await expect(getCustomSkill(editor, exclusive.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runCustomSkill(editor, { skillId: exclusive.id, clientId: clientB, request: "Tentativa" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(runCustomSkill(owner, { skillId: exclusive.id, clientId: clientB, request: "Cliente errado" })).rejects.toBeInstanceOf(ValidationError);
    // Filtro por cliente: as gerais e as do cliente.
    expect((await listCustomSkills(owner, { clientId: clientB })).map((s) => s.name)).toEqual(["Geral"]);
    expect((await listCustomSkills(owner, { clientId: clientA })).map((s) => s.name).sort()).toEqual(["Geral", "Só da padaria"]);
  });

  it("outra organização não enxerga nem executa", async () => {
    const { owner, clientA } = await setup();
    const { id } = await createCustomSkill(owner, base);
    const other = await newOrg("Outra");
    const otherClient = await createClient(other.owner, { name: "Cliente de fora" });
    expect(await listCustomSkills(other.owner)).toEqual([]);
    await expect(getCustomSkill(other.owner, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runCustomSkill(other.owner, { skillId: id, clientId: otherClient.id, request: "Tentativa" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listCustomSkillRuns(other.owner, id)).resolves.toEqual([]);
    void clientA;
  });

  it("versões são imutáveis também no banco", async () => {
    const { owner } = await setup();
    const { id } = await createCustomSkill(owner, base);
    await expect(
      withTx(userCtx(owner.userId), (tx) => tx.query("UPDATE custom_skill_versions SET instructions = 'alterado' WHERE skill_id = $1", [id])),
    ).rejects.toThrow(/permission denied/);
    await expect(withTx(userCtx(owner.userId), (tx) => tx.query("DELETE FROM custom_skill_versions WHERE skill_id = $1", [id]))).rejects.toThrow(/permission denied/);
  });

  it("executa com o contexto do cliente, registra versão, pedido, resultado e custo", async () => {
    const { owner, clientA } = await setup();
    const { id } = await createCustomSkill(owner, base);
    await updateCustomSkill(owner, id, { ...base, instructions: `${base.instructions} Use humor leve.` }, 1);
    const fake = new FakeProvider();
    setProviderOverride(fake);

    const out = await runCustomSkill(owner, { skillId: id, clientId: clientA, request: "Lançamento do pão de queijo recheado" });
    expect(out.isDemo).toBe(false);
    expect(out.output.result).toContain("Lançamento do pão de queijo recheado");
    expect(out.costUsd).toBeGreaterThan(0);
    const req = fake.requests[0]!;
    expect(req.system).toContain("Use humor leve.");
    expect(req.system).toContain("Regras invioláveis");
    expect(req.context).toContain("Padaria Pão Bom");
    expect(req.task).toContain("Lançamento do pão de queijo recheado");

    const runs = await listCustomSkillRuns(owner, id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ version: "2", status: "succeeded", request: "Lançamento do pão de queijo recheado", clientName: "Padaria Pão Bom" });
    expect(runs[0]!.result).toBe(out.output.result);

    const forBriefing = await getCustomSkillRunText(owner, out.runId);
    expect(forBriefing).toEqual({ clientId: clientA, skillName: "Roteiro de Reels", text: out.output.result });

    const costs = await getCostSummary(owner);
    expect(costs.bySkill.find((s) => s.skillId === `custom:${id}`)?.skillName).toBe("Roteiro de Reels");
    expect(costs.recent[0]?.skillName).toBe("Roteiro de Reels");
  });

  it("clique duplo com a mesma chave não cobra duas vezes; skill arquivada não executa", async () => {
    const { owner, clientA } = await setup();
    const { id } = await createCustomSkill(owner, base);
    const fake = new FakeProvider();
    setProviderOverride(fake);
    const key = crypto.randomUUID();
    const first = await runCustomSkill(owner, { skillId: id, clientId: clientA, request: "Pedido único", requestKey: key });
    const second = await runCustomSkill(owner, { skillId: id, clientId: clientA, request: "Pedido único", requestKey: key });
    expect(second.reused).toBe(true);
    expect(second.runId).toBe(first.runId);
    expect(fake.calls).toBe(1);
    // Chave nova (o formulário gera outra depois de cada execução): nova execução.
    await runCustomSkill(owner, { skillId: id, clientId: clientA, request: "Pedido único", requestKey: crypto.randomUUID() });
    expect(fake.calls).toBe(2);

    await setCustomSkillStatus(owner, id, "archived");
    expect(await listCustomSkills(owner)).toEqual([]);
    expect((await listCustomSkills(owner, { includeArchived: true }))[0]?.status).toBe("archived");
    await expect(runCustomSkill(owner, { skillId: id, clientId: clientA, request: "Depois de arquivar" })).rejects.toBeInstanceOf(ValidationError);
    await setCustomSkillStatus(owner, id, "active");
    expect((await listCustomSkills(owner))[0]?.runsThisMonth).toBe(2);
  });

  it("execuções de clientes sem acesso não aparecem no histórico", async () => {
    const { owner, clientA, clientB } = await setup();
    const { id } = await createCustomSkill(owner, base);
    await runCustomSkill(owner, { skillId: id, clientId: clientA, request: "Para a padaria" });
    await runCustomSkill(owner, { skillId: id, clientId: clientB, request: "Para o pilates" });
    const editor = await addMember(owner, "editor");
    await updateMember(owner, editor.userId, { role: "editor", isActive: true, clientIds: [clientB] });
    expect((await listCustomSkillRuns(editor, id)).map((r) => r.request)).toEqual(["Para o pilates"]);
    const rows = await many<{ id: string }>(
      { query: (t, v) => withTx(userCtx(editor.userId), (tx) => tx.query(t, v)) },
      "SELECT id FROM ai_runs WHERE skill_id = $1",
      [`custom:${id}`],
    );
    expect(rows).toHaveLength(1);
  });
});
