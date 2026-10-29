import { describe, expect, it } from "vitest";
import { ForbiddenError } from "../../src/server/errors";
import { createClient, getClient, updateBrandProfile } from "../../src/server/services/clients";
import { createContent, decideApproval, duplicateContent, getContent, submitForApproval } from "../../src/server/services/content";
import { uploadMedia } from "../../src/server/services/media";
import { setPackage } from "../../src/server/services/packages";
import { approveEditorialPlan, currentMonth, proposeEditorialPlan } from "../../src/server/services/editorial";
import { approvedInMonth, calendarEntries, clientChecklist, monthByClient } from "../../src/server/services/month";
import { processNextJob } from "../../src/server/jobs/worker";
import { addMember, newOrg, samplePng } from "./helpers";

const briefing = { text: "Explicar como funciona o bolão da loja e o horário de atendimento." };

describe("visão do mês", () => {
  it("pacote × produzido, pendências, calendário e peças aprovadas no mês", async () => {
    const { owner } = await newOrg();
    const month = currentMonth();
    const { id: a } = await createClient(owner, { name: "Coli Loterias" });
    const { id: b } = await createClient(owner, { name: "Padaria" });
    await setPackage(owner, a, { posts: 2, carousels: 0, stories: 0, videos: 1 });

    // Linha editorial montada sem IA, preenchida e aprovada: 2 posts viram peças.
    await proposeEditorialPlan(owner, a, { month, useAi: false });
    const { getEditorialPlan, updateEditorialItem } = await import("../../src/server/services/editorial");
    const plan = (await getEditorialPlan(owner, a, month))!;
    for (const it of plan.items) await updateEditorialItem(owner, it.id, { title: `Pauta ${it.position + 1}`, brief: briefing.text, cta: "", objective: "education", format: it.format, plannedDate: it.plannedDate });
    expect((await approveEditorialPlan(owner, plan.id)).created).toBe(2);

    let rows = await monthByClient(owner, month);
    const coli = rows.find((r) => r.clientId === a)!;
    expect(coli).toMatchObject({ contracted: 3, produced: 2, plan: "approved", awaitingApproval: 0, generating: 2, inReview: 0 });
    while (await processNextJob("teste-mes")) {
      // gera as peças
    }
    expect((await monthByClient(owner, month)).find((r) => r.clientId === a)).toMatchObject({ generating: 0, inReview: 2 });
    expect(rows.find((r) => r.clientId === b)).toMatchObject({ contracted: 0, produced: 0, plan: "none" });

    // Calendário: as 3 pautas com data, ligadas às peças.
    const cal = await calendarEntries(owner, month);
    expect(cal).toHaveLength(3);
    expect(cal.filter((e) => e.contentItemId)).toHaveLength(2);
    expect(cal.every((e) => e.date.startsWith(month) && e.clientName === "Coli Loterias")).toBe(true);
    expect(await calendarEntries(owner, month, b)).toEqual([]);

    // Aprova uma peça: entra na entrega do mês, na ordem da linha editorial.
    const pieceId = cal.find((e) => e.contentItemId)!.contentItemId!;
    const piece = await getContent(owner, pieceId);
    const { approvalId } = await submitForApproval(owner, pieceId, { versionId: piece.current!.id });
    await decideApproval(owner, approvalId, { decision: "approved", note: "Ok" });
    const delivered = await approvedInMonth(owner, a, month);
    expect(delivered.map((d) => d.id)).toEqual([pieceId]);
    expect(delivered[0]!.plannedDate).toMatch(new RegExp(`^${month}-`));
    rows = await monthByClient(owner, month);
    expect(rows.find((r) => r.clientId === a)).toMatchObject({ approvedThisMonth: 1, inReview: 1 });

    // Isolamento: outra organização não vê nada.
    const other = await newOrg("Outra");
    expect(await monthByClient(other.owner, month)).toEqual([]);
    expect(await calendarEntries(other.owner, month)).toEqual([]);
    await expect(approvedInMonth(other.owner, a, month)).rejects.toThrow();
  });

  it("lista de configuração do cliente marca o que falta", async () => {
    const { owner } = await newOrg();
    const { id } = await createClient(owner, { name: "Cliente novo" });
    let steps = await clientChecklist(owner, id, currentMonth(), 25);
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual([]);
    const logo = await uploadMedia(owner, id, { filename: "logo.png", data: samplePng(400, 200, "#111111") }, { kind: "logo" });
    for (const c of ["#aa0000", "#00aa00", "#0000aa"]) await uploadMedia(owner, id, { filename: `${c}.png`, data: samplePng(600, 600, c) }, {});
    const { brand } = await getClient(owner, id);
    await updateBrandProfile(owner, id, { ...brand, visual: { ...brand.visual, logoAssetId: logo.id } });
    await setPackage(owner, id, { posts: 4, carousels: 0, stories: 0, videos: 0 });
    steps = await clientChecklist(owner, id, currentMonth(), 100);
    expect(steps.filter((s) => s.done).map((s) => s.id).sort()).toEqual(["brand", "logo", "package", "photos"]);
    expect(steps.find((s) => s.id === "editorial")!.hint).toBe("Ainda não montada");
  });

  it("duplicar peça cria um rascunho novo com a versão atual, sem mexer na original", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    const { contentId } = await createContent(owner, { clientId, title: "Bolão de Natal", channel: "instagram", format: "post", objective: "conversion", briefing, slideCount: 1, mode: "manual", requestId: crypto.randomUUID() });
    const original = await getContent(owner, contentId);
    const { contentId: copyId } = await duplicateContent(owner, contentId);
    const copy = await getContent(owner, copyId);
    expect(copy).toMatchObject({ title: "Cópia de Bolão de Natal", status: "draft", objective: "conversion" });
    expect(copy.current!.number).toBe(1);
    expect(copy.current!.document).toEqual(original.current!.document);
    expect(copy.quality).not.toBeNull();
    expect((await getContent(owner, contentId)).current!.id).toBe(original.current!.id);

    const viewer = await addMember(owner, "viewer");
    await expect(duplicateContent(viewer, contentId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
