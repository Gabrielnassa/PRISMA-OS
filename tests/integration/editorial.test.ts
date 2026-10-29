import { describe, expect, it } from "vitest";
import { many, systemCtx, withTx } from "../../src/server/db";
import { ConflictError, ForbiddenError, ValidationError } from "../../src/server/errors";
import { setProviderOverride } from "../../src/server/ai/gateway";
import { createClient } from "../../src/server/services/clients";
import { getContent } from "../../src/server/services/content";
import { deleteContent } from "../../src/server/services/deletion";
import { uploadMedia } from "../../src/server/services/media";
import { updateMember } from "../../src/server/services/users";
import { getPackageOverview, setPackage } from "../../src/server/services/packages";
import {
  approveEditorialPlan,
  getEditorialPlan,
  proposeEditorialPlan,
  setEditorialItemStatus,
  updateEditorialItem,
} from "../../src/server/services/editorial";
import { processNextJob } from "../../src/server/jobs/worker";
import { FakeProvider, addMember, newOrg, samplePng } from "./helpers";

const MONTH = "2026-11";

async function setup() {
  const { owner } = await newOrg();
  const { id: clientId } = await createClient(owner, { name: "Coli Loterias", segment: "Loterias" });
  return { owner, clientId };
}

async function drain() {
  while (await processNextJob("teste-editorial")) {
    // até esvaziar a fila
  }
}

describe("pacote mensal e estimativa de custo", () => {
  it("só a administração define o pacote; a estimativa usa a tarifa enquanto não há peças reais", async () => {
    const { owner, clientId } = await setup();
    const editor = await addMember(owner, "editor");
    await updateMember(owner, editor.userId, { role: "editor", isActive: true, clientIds: [clientId] });
    await expect(setPackage(editor, clientId, { posts: 0, carousels: 4, stories: 0, videos: 4 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setPackage(owner, clientId, { posts: -1, carousels: 4, stories: 0, videos: 4 })).rejects.toBeInstanceOf(ValidationError);
    await setPackage(owner, clientId, { posts: 0, carousels: 4, stories: 0, videos: 4, notes: "8 posts/mês" });

    // Demonstração: sem custo para estimar.
    let o = await getPackageOverview(editor, clientId);
    expect(o.pkg).toMatchObject({ carousels: 4, videos: 4, notes: "8 posts/mês" });
    expect(o.estimate).toMatchObject({ aiPieces: 4, totalUsd: null, basis: null });

    // Provedor real sem execuções: tarifa (Opus 5.5: 4/20) × consumo típico (6k entrada, 4k saída) = 0,104 por peça.
    setProviderOverride(new FakeProvider());
    o = await getPackageOverview(owner, clientId);
    expect(o.estimate.basis).toBe("typical");
    expect(o.estimate.perPieceUsd).toBeCloseTo(0.104, 4);
    // Linha editorial: 8k × 4 + 6k × 20 = 0,152.
    expect(o.estimate.totalUsd).toBeCloseTo(0.104 * 4 + 0.152, 4);
  });
});

describe("linha editorial", () => {
  it("propõe pelo pacote, edita, aprova e cria as peças com fotos do cliente; vídeos ficam para marcar", async () => {
    const { owner, clientId } = await setup();
    await expect(proposeEditorialPlan(owner, clientId, { month: MONTH, useAi: true })).rejects.toThrow(/pacote mensal/);
    await setPackage(owner, clientId, { posts: 0, carousels: 4, stories: 0, videos: 4 });
    const photo = await uploadMedia(owner, clientId, { filename: "loja.png", data: samplePng(1200, 1200, "#1d4ed8") }, { kind: "image" });

    const proposed = await proposeEditorialPlan(owner, clientId, { month: MONTH, theme: "Bolão da Mega da Virada. Novos horários da loja.", useAi: true });
    expect(proposed).toMatchObject({ items: 8, isDemo: true });
    let plan = (await getEditorialPlan(owner, clientId, MONTH))!;
    expect(plan.status).toBe("draft");
    expect(plan.fromAi).toBe(true);
    expect(plan.items.map((i) => i.format).filter((f) => f === "video")).toHaveLength(4);

    // Proposta de novo substitui o rascunho (sem acumular).
    await proposeEditorialPlan(owner, clientId, { month: MONTH, useAi: false });
    plan = (await getEditorialPlan(owner, clientId, MONTH))!;
    expect(plan.items).toHaveLength(8);
    expect(plan.items.every((i) => i.title === "Pauta a definir")).toBe(true);
    // Pautas em branco impedem a aprovação.
    await expect(approveEditorialPlan(owner, plan.id)).rejects.toThrow(/Complete 4 pautas/);

    for (const it of plan.items) {
      await updateEditorialItem(owner, it.id, {
        title: `Pauta ${it.position + 1}`,
        brief: "Mostrar como funciona o bolão da loja e quem pode participar, com o horário de atendimento.",
        cta: "Passe na loja",
        objective: "relationship",
        format: it.format,
        plannedDate: it.plannedDate,
      });
    }
    await expect(updateEditorialItem(owner, plan.items[0]!.id, { title: "Fora", brief: "", cta: "", objective: "education", format: "post", plannedDate: "2026-12-01" })).rejects.toBeInstanceOf(ValidationError);

    const r = await approveEditorialPlan(owner, plan.id);
    expect(r).toMatchObject({ created: 4, pending: 0, videos: 4, stoppedBecause: null });
    plan = (await getEditorialPlan(owner, clientId, MONTH))!;
    expect(plan.status).toBe("approved");
    const produced = plan.items.filter((i) => i.status === "in_production");
    expect(produced).toHaveLength(4);
    expect(produced.every((i) => i.format === "carousel" && i.contentItemId)).toBe(true);

    // As peças entram na fila com as fotos da biblioteca e viram rascunhos de verdade.
    await drain();
    const piece = await getContent(owner, produced[0]!.contentItemId!);
    expect(piece.status).toBe("in_review");
    expect(JSON.stringify(piece.current!.document)).toContain(photo.id);

    // Aprovar de novo não duplica nada.
    expect((await approveEditorialPlan(owner, plan.id)).created).toBe(0);
    const count = await withTx(systemCtx("teste"), (tx) => many(tx, "SELECT id FROM content_items WHERE client_id = $1", [clientId]));
    expect(count).toHaveLength(4);

    // Pauta já em produção não é editada; vídeo é marcado como feito à mão.
    await expect(updateEditorialItem(owner, produced[0]!.id, { title: "Outra", brief: "x", cta: "", objective: "education", format: "carousel", plannedDate: null })).rejects.toBeInstanceOf(ConflictError);
    const video = plan.items.find((i) => i.format === "video")!;
    await setEditorialItemStatus(owner, video.id, "done");
    const o = await getPackageOverview(owner, clientId);
    expect(o.produced.videos).toBe(0); // novembro ainda não é o mês corrente neste teste

    // Excluir a peça devolve a pauta para "planejada".
    await deleteContent(owner, produced[0]!.contentItemId!);
    plan = (await getEditorialPlan(owner, clientId, MONTH))!;
    expect(plan.items.find((i) => i.id === produced[0]!.id)).toMatchObject({ status: "planned", contentItemId: null });
  });

  it("isolamento: outra organização não vê nem aprova a linha editorial", async () => {
    const { owner, clientId } = await setup();
    await setPackage(owner, clientId, { posts: 2, carousels: 0, stories: 0, videos: 0 });
    const { planId } = await proposeEditorialPlan(owner, clientId, { month: MONTH, useAi: true });
    const other = await newOrg("Outra");
    await expect(getEditorialPlan(other.owner, clientId, MONTH)).rejects.toThrow();
    await expect(approveEditorialPlan(other.owner, planId)).rejects.toThrow(/não encontrada/);
    const viewer = await addMember(owner, "viewer");
    await expect(approveEditorialPlan(viewer, planId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
