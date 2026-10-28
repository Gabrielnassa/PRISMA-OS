import { describe, expect, it } from "vitest";
import { many, one, systemCtx, withTx } from "../../src/server/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../src/server/errors";
import type { AuthContext } from "../../src/server/auth/types";
import { addMemory, createClient, getClient } from "../../src/server/services/clients";
import { addComment, createContent, getContent, submitForApproval } from "../../src/server/services/content";
import { getCostSummary, setClientBudget } from "../../src/server/services/costs";
import { createCustomSkill } from "../../src/server/services/custom-skills";
import { deleteMedia, getMediaFile, uploadMedia } from "../../src/server/services/media";
import { updateMember } from "../../src/server/services/users";
import { deleteClient, deleteContent, deleteContents, getClientDeletionSummary } from "../../src/server/services/deletion";
import { confirmsName } from "../../src/lib/confirm-name";
import { processNextJob } from "../../src/server/jobs/worker";
import { storage } from "../../src/server/storage";
import { addMember, newOrg, samplePng } from "./helpers";

const briefing = { text: "Dicas práticas de pão de fermentação natural para fazer em casa." };

async function content(auth: AuthContext, clientId: string, title: string, mode: "ai" | "manual" = "manual"): Promise<string> {
  const r = await createContent(auth, { clientId, title, channel: "instagram", format: "post", objective: "education", briefing, slideCount: 1, mode, requestId: crypto.randomUUID() });
  return r.contentId;
}

/** Processa a fila inteira (gerações pendentes, inclusive de outros testes). */
async function drainJobs() {
  while (await processNextJob("teste-exclusao")) {
    // continua até esvaziar
  }
}

const sys = <T,>(fn: Parameters<typeof withTx<T>>[1]) => withTx(systemCtx("teste"), fn);

describe("exclusão de conteúdos", () => {
  it("apaga versões, aprovações, comentários e relatórios; o custo continua, sem o texto gerado", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Padaria Pão Bom" });
    const id = await content(owner, clientId, "Fermentação natural", "ai");
    await drainJobs();
    const detail = await getContent(owner, id);
    expect(detail.status).toBe("in_review");
    await submitForApproval(owner, id, { versionId: detail.current!.id });
    await addComment(owner, id, { body: "Ficou ótimo, só ajustar a legenda." });
    const versionIds = (await sys((tx) => many<{ id: string }>(tx, "SELECT id FROM content_versions WHERE content_item_id = $1", [id]))).map((v) => v.id);
    const runsBefore = (await getCostSummary(owner)).totals.runs;
    expect(runsBefore).toBeGreaterThan(0);

    const r = await deleteContents(owner, [id]);
    expect(r).toEqual({ deleted: [{ id, clientId, title: "Fermentação natural" }], skipped: [] });
    await expect(getContent(owner, id)).rejects.toBeInstanceOf(NotFoundError);

    const left = await sys((tx) =>
      one<{ items: number; versions: number; approvals: number; comments: number; reports: number }>(
        tx,
        `SELECT (SELECT count(*)::int FROM content_items WHERE id = $1) AS items,
                (SELECT count(*)::int FROM content_versions WHERE content_item_id = $1) AS versions,
                (SELECT count(*)::int FROM approvals WHERE content_item_id = $1) AS approvals,
                (SELECT count(*)::int FROM content_comments WHERE content_item_id = $1) AS comments,
                (SELECT count(*)::int FROM quality_reports WHERE content_version_id = ANY($2::uuid[])) AS reports`,
        [id, versionIds],
      ),
    );
    expect(left).toEqual({ items: 0, versions: 0, approvals: 0, comments: 0, reports: 0 });

    // Execuções de IA ficam para os custos, sem vínculo e sem o texto gerado.
    const runs = await sys((tx) => many<{ content_item_id: string | null; output: unknown }>(tx, "SELECT content_item_id, output FROM ai_runs WHERE client_id = $1", [clientId]));
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((x) => x.content_item_id === null && x.output === null)).toBe(true);
    expect((await getCostSummary(owner)).totals.runs).toBe(runsBefore);

    const log = await sys((tx) => many<{ metadata: Record<string, unknown> }>(tx, "SELECT metadata FROM audit_logs WHERE action = 'content.deleted' AND entity_id = $1", [id]));
    expect(log[0]?.metadata).toMatchObject({ title: "Fermentação natural", status: "awaiting_approval", versions: 1 });
  });

  it("em lote: exclui os selecionados, pula os que estão em geração e ignora conteúdos de outra organização", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    const a = await content(owner, clientId, "Peça A");
    const b = await content(owner, clientId, "Peça B");
    const keep = await content(owner, clientId, "Peça mantida");
    const generating = await content(owner, clientId, "Peça em geração", "ai");
    const other = await newOrg("Outra");
    const { id: otherClient } = await createClient(other.owner, { name: "Cliente de fora" });
    const foreign = await content(other.owner, otherClient, "Peça de fora");

    const r = await deleteContents(owner, [a, b, generating, foreign, a]);
    expect(r.deleted.map((d) => d.title).sort()).toEqual(["Peça A", "Peça B"]);
    expect(r.skipped).toEqual([{ id: generating, title: "Peça em geração" }]);
    await expect(deleteContent(owner, generating)).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteContent(owner, foreign)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getContent(other.owner, foreign)).title).toBe("Peça de fora");
    expect((await getContent(owner, keep)).title).toBe("Peça mantida");

    await drainJobs();
    expect(await deleteContent(owner, generating)).toEqual({ id: generating, clientId, title: "Peça em geração" });
  });

  it("só proprietário e administrador excluem conteúdos", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    const id = await content(owner, clientId, "Peça");
    const editor = await addMember(owner, "editor");
    await updateMember(owner, editor.userId, { role: "editor", isActive: true, clientIds: [clientId] });
    const admin = await addMember(owner, "admin");
    await expect(deleteContents(editor, [id])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteContents(owner, [])).rejects.toBeInstanceOf(ValidationError);
    await expect(deleteContents(owner, ["não-é-uuid"])).rejects.toBeInstanceOf(ValidationError);
    expect((await deleteContents(admin, [id])).deleted).toHaveLength(1);
  });
});

describe("exclusão de cliente", () => {
  it("confere o nome digitado sem exigir maiúsculas nem espaços idênticos", () => {
    expect(confirmsName("  café   da ESQUINA ", "Café da Esquina")).toBe(true);
    expect(confirmsName("cafe da esquina", "Café da Esquina")).toBe(false);
    expect(confirmsName("", "")).toBe(false);
  });

  it("espera as gerações, pede o nome e apaga tudo do cliente, inclusive os arquivos", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Café da Esquina" });
    const { id: otherId } = await createClient(owner, { name: "Outro Cliente" });

    const logo = await uploadMedia(owner, clientId, { filename: "logo.png", data: samplePng(400, 200, "#9a3412") }, { kind: "logo" });
    const removed = await uploadMedia(owner, clientId, { filename: "antiga.png", data: samplePng(300, 300, "#1d4ed8") }, {});
    await deleteMedia(owner, removed.id);
    const kept = await uploadMedia(owner, otherId, { filename: "outro.png", data: samplePng(300, 300, "#15803d") }, {});
    await addMemory(owner, clientId, { kind: "fact", content: "Abre aos domingos." });
    await createCustomSkill(owner, { name: "Roteiro do café", instructions: "Roteiros curtos sobre o cardápio do dia.", clientId });
    await setClientBudget(owner, clientId, { monthlyLimitUsd: 20 });
    const generating = await content(owner, clientId, "Cardápio de inverno", "ai");
    const otherContent = await content(owner, otherId, "Peça do outro cliente");

    await expect(deleteClient(owner, clientId, "Café da Esquina")).rejects.toBeInstanceOf(ConflictError);
    await drainJobs();
    const detail = await getContent(owner, generating);
    await submitForApproval(owner, generating, { versionId: detail.current!.id });

    const summary = await getClientDeletionSummary(owner, clientId);
    expect(summary).toMatchObject({ name: "Café da Esquina", contents: 1, versions: 1, media: 1, memories: 1, skills: 1, inProgress: false });
    expect(summary.aiRuns).toBeGreaterThan(0);

    const wrong = await deleteClient(owner, clientId, "Outro Cliente").catch((e) => e);
    expect(wrong).toBeInstanceOf(ValidationError);
    expect((wrong as ValidationError).fieldErrors.confirmation).toBeTruthy();

    const keys = (await sys((tx) => many<{ storage_key: string }>(tx, "SELECT storage_key FROM media_assets WHERE client_id = $1", [clientId]))).map((k) => k.storage_key);
    expect(keys).toHaveLength(2);
    const runsBefore = (await getCostSummary(owner)).totals.runs;

    const r = await deleteClient(owner, clientId, " café da esquina ");
    expect(r).toMatchObject({ name: "Café da Esquina", filesFailed: 0 });
    await expect(getClient(owner, clientId)).rejects.toBeInstanceOf(NotFoundError);

    const left = await sys((tx) =>
      one<Record<string, number>>(
        tx,
        `SELECT (SELECT count(*)::int FROM clients WHERE id = $1) AS clients,
                (SELECT count(*)::int FROM client_access WHERE client_id = $1) AS access,
                (SELECT count(*)::int FROM brand_profiles WHERE client_id = $1) AS brand,
                (SELECT count(*)::int FROM client_memories WHERE client_id = $1) AS memories,
                (SELECT count(*)::int FROM media_assets WHERE client_id = $1) AS media,
                (SELECT count(*)::int FROM content_items WHERE client_id = $1) AS items,
                (SELECT count(*)::int FROM content_versions WHERE client_id = $1) AS versions,
                (SELECT count(*)::int FROM quality_reports WHERE client_id = $1) AS reports,
                (SELECT count(*)::int FROM approvals WHERE client_id = $1) AS approvals,
                (SELECT count(*)::int FROM client_budgets WHERE client_id = $1) AS budgets,
                (SELECT count(*)::int FROM jobs WHERE client_id = $1) AS jobs,
                (SELECT count(*)::int FROM custom_skills WHERE client_id = $1) AS skills,
                (SELECT count(*)::int FROM ai_runs WHERE client_id = $1) AS runs`,
        [clientId],
      ),
    );
    expect(Object.values(left).every((n) => n === 0)).toBe(true);
    for (const key of keys) await expect(storage().get(key)).rejects.toThrow();

    // Custos continuam nos totais, identificados pelo nome do cliente excluído.
    const costs = await getCostSummary(owner);
    expect(costs.totals.runs).toBe(runsBefore);
    expect(costs.recent.some((x) => x.clientName === "Café da Esquina (excluído)")).toBe(true);
    const orphanOutputs = await sys((tx) => many<{ output: unknown }>(tx, "SELECT output FROM ai_runs WHERE input_summary->>'deletedClient' = 'Café da Esquina'"));
    expect(orphanOutputs.length).toBe(summary.aiRuns);
    expect(orphanOutputs.every((x) => x.output === null)).toBe(true);

    const log = await sys((tx) => many<{ client_id: string | null; metadata: Record<string, unknown> }>(tx, "SELECT client_id, metadata FROM audit_logs WHERE action = 'client.deleted' AND entity_id = $1", [clientId]));
    expect(log).toHaveLength(1);
    expect(log[0]!.client_id).toBeNull();
    expect(log[0]!.metadata).toMatchObject({ name: "Café da Esquina", contents: 1, media: 1, memories: 1, skills: 1 });

    // O outro cliente não é afetado.
    expect((await getClient(owner, otherId)).name).toBe("Outro Cliente");
    expect((await getContent(owner, otherContent)).title).toBe("Peça do outro cliente");
    expect((await getMediaFile(owner, kept.id)).filename).toBe("outro.png");
    expect(logo.id).toBeTruthy();
  });

  it("só proprietário e administrador excluem; outra organização não enxerga o cliente", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Studio Pilates" });
    const editor = await addMember(owner, "editor");
    await updateMember(owner, editor.userId, { role: "editor", isActive: true, clientIds: [clientId] });
    await expect(getClientDeletionSummary(editor, clientId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteClient(editor, clientId, "Studio Pilates")).rejects.toBeInstanceOf(ForbiddenError);

    const other = await newOrg("Outra");
    await expect(deleteClient(other.owner, clientId, "Studio Pilates")).rejects.toBeInstanceOf(NotFoundError);

    const admin = await addMember(owner, "admin");
    expect((await deleteClient(admin, clientId, "Studio Pilates")).name).toBe("Studio Pilates");
  });
});
