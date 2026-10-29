import { describe, expect, it } from "vitest";
import { many, systemCtx, withTx } from "../../src/server/db";
import { ConflictError, ForbiddenError, ValidationError } from "../../src/server/errors";
import { createClient, getClient, listMemories, updateBrandProfile } from "../../src/server/services/clients";
import { uploadMedia } from "../../src/server/services/media";
import {
  addComment,
  createContent,
  decideApproval,
  getContent,
  getVersionDocument,
  listPendingApprovals,
  saveVersion,
  submitForApproval,
} from "../../src/server/services/content";
import { processNextJob } from "../../src/server/jobs/worker";
import { renderDocument } from "../../src/server/render/engine";
import { addMember, newOrg, samplePng } from "./helpers";

async function configuredClient() {
  const { owner } = await newOrg();
  const { id: clientId } = await createClient(owner, { name: "Clínica Bem Viver", segment: "Saúde" });
  const logo = await uploadMedia(owner, clientId, { filename: "logo.png", data: samplePng(600, 200, "#0f766e") }, { kind: "logo" });
  const photo = await uploadMedia(owner, clientId, { filename: "equipe.png", data: samplePng(1400, 1400) }, { kind: "image", altText: "Equipe" });
  const { brand } = await getClient(owner, clientId);
  brand.business.companyName = "Clínica Bem Viver";
  brand.audience.targetAudience = "Famílias do bairro";
  brand.voice.tone = "Acolhedor e claro";
  brand.voice.forbiddenTerms = ["milagre"];
  brand.visual = { ...brand.visual, configured: true, colors: { primary: "#0f766e", secondary: "#99f6e4", accent: "#f59e0b", background: "#f8fafc", text: "#0f172a" }, headingFont: "nunito", bodyFont: "inter", logoAssetId: logo.id };
  brand.channels.instagram = "@bemviver";
  await updateBrandProfile(owner, clientId, brand);
  return { owner, clientId, photoId: photo.id, logoId: logo.id };
}

describe("primeira entrega: briefing → texto → arte → revisão → aprovação → exportação", () => {
  it("executa o ciclo completo com versões e aprovação vinculada", async () => {
    const { owner, clientId, photoId, logoId } = await configuredClient();
    const requestId = crypto.randomUUID();
    const created = await createContent(owner, {
      clientId,
      title: "Cuidados com a saúde no inverno",
      channel: "instagram",
      format: "carousel",
      objective: "education",
      briefing: { text: "Dicas práticas para a família se cuidar no inverno. Hidratação também importa no frio. Vacinação em dia protege todos.", cta: "Agende pelo WhatsApp" },
      slideCount: 4,
      templatePreference: "auto",
      imageAssetIds: [photoId],
      mode: "ai",
      requestId,
    });
    expect(created.jobId).toBeTruthy();

    // Reenvio do formulário não duplica (idempotência).
    const again = await createContent(owner, {
      clientId, title: "Cuidados com a saúde no inverno", channel: "instagram", format: "carousel", objective: "education",
      briefing: { text: "Dicas práticas para a família se cuidar no inverno." }, slideCount: 4, mode: "ai", requestId,
    });
    expect(again).toMatchObject({ contentId: created.contentId, reused: true });

    let detail = await getContent(owner, created.contentId);
    expect(detail.status).toBe("generating");
    expect(await processNextJob("test-worker")).toBe(true);

    detail = await getContent(owner, created.contentId);
    expect(detail.status).toBe("in_review");
    expect(detail.current?.number).toBe(1);
    expect(detail.current?.source).toBe("demo");
    expect(detail.current?.document.slides).toHaveLength(4);
    expect(detail.current?.document.style.logoAssetId).toBe(logoId);
    expect(detail.quality).not.toBeNull();
    expect(detail.job?.status).toBe("succeeded");
    expect(detail.aiRuns[0]).toMatchObject({ skillId: "copywriter.social", isDemo: true, status: "succeeded" });

    // A peça é realmente renderizada (SVG por lâmina).
    const doc = detail.current!.document;
    const rendered = await renderDocument(doc, { images: new Map() });
    expect(rendered.every((r) => r.svg.startsWith("<svg"))).toBe(true);

    // Edição manual gera nova versão imutável.
    const edited = structuredClone(doc);
    edited.slides[0]!.fields.title = "Inverno com saúde: 3 cuidados simples";
    edited.slides[0]!.fields.kicker = "Guia rápido";
    const v2 = await saveVersion(owner, created.contentId, { document: edited, baseVersionId: detail.current!.id, changeNote: "Título ajustado" });
    expect(v2).toMatchObject({ number: 2, unchanged: false });
    expect(v2.changes).toContain("Lâmina 1: título");

    // Salvar sobre versão desatualizada é recusado.
    await expect(saveVersion(owner, created.contentId, { document: edited, baseVersionId: detail.current!.id })).rejects.toBeInstanceOf(ConflictError);

    detail = await getContent(owner, created.contentId);
    if (detail.quality && detail.quality.criticalCount > 0) {
      await expect(submitForApproval(owner, created.contentId, { versionId: v2.versionId })).rejects.toBeInstanceOf(ValidationError);
      throw new Error(`Relatório com críticos inesperados: ${JSON.stringify(detail.quality.items.filter((i) => i.severity === "critical"))}`);
    }
    const { approvalId } = await submitForApproval(owner, created.contentId, { versionId: v2.versionId, note: "Pode revisar" });
    expect((await getContent(owner, created.contentId)).status).toBe("awaiting_approval");
    expect((await listPendingApprovals(owner)).map((a) => a.approvalId)).toContain(approvalId);

    // Aprovador revisa, comenta e aprova a versão exata.
    const reviewer = await addMember(owner, "reviewer");
    await withTx(systemCtx("test"), (tx) => tx.query("INSERT INTO client_access (organization_id, client_id, user_id) VALUES ($1, $2, $3)", [owner.organizationId, clientId, reviewer.userId]));
    await addComment(reviewer, created.contentId, { body: "Texto claro, aprovado." });
    await expect(saveVersion(reviewer, created.contentId, { document: edited, baseVersionId: v2.versionId })).rejects.toBeInstanceOf(ForbiddenError);
    await decideApproval(reviewer, approvalId, { decision: "approved", note: "ok" });
    detail = await getContent(owner, created.contentId);
    expect(detail.status).toBe("approved");
    expect(detail.approvedVersionId).toBe(v2.versionId);

    // Alteração após aprovação exige nova aprovação; a aprovação anterior continua vinculada à v2.
    const edited3 = structuredClone(edited);
    edited3.caption = "Legenda revisada.";
    const v3 = await saveVersion(owner, created.contentId, { document: edited3, baseVersionId: v2.versionId });
    detail = await getContent(owner, created.contentId);
    expect(detail.status).toBe("in_review");
    expect(detail.approvedVersionId).toBe(v2.versionId);
    expect(detail.current?.id).toBe(v3.versionId);

    // Reprovação exige justificativa e vira sugestão revisável na memória do cliente.
    const second = await submitForApproval(owner, created.contentId, { versionId: v3.versionId });
    await expect(decideApproval(reviewer, second.approvalId, { decision: "rejected" })).rejects.toBeInstanceOf(ValidationError);
    await decideApproval(reviewer, second.approvalId, { decision: "rejected", note: "Evitar a palavra frio no título" });
    expect((await getContent(owner, created.contentId)).status).toBe("rejected");
    // A versão reprovada nunca vira a oficial: exportá-la sai como rascunho; a aprovada continua sendo a v2.
    expect((await getVersionDocument(owner, created.contentId, v3.versionId)).isApproved).toBe(false);
    expect((await getVersionDocument(owner, created.contentId, v2.versionId)).isApproved).toBe(true);
    const memories = await listMemories(owner, clientId);
    expect(memories.some((m) => m.kind === "suggestion" && m.source === "approval_feedback")).toBe(true);

    // Versões são imutáveis no banco.
    await expect(withTx(systemCtx("test"), (tx) => tx.query("UPDATE content_versions SET change_note = 'x' WHERE id = $1", [v2.versionId]))).rejects.toThrow(/imutáveis/);

    // Histórico de auditoria registra as decisões.
    const actions = await withTx(systemCtx("test"), (tx) =>
      many<{ action: string }>(tx, "SELECT action FROM audit_logs WHERE organization_id = $1 ORDER BY id", [owner.organizationId]),
    );
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(["content.created", "content.generated", "content.version_created", "approval.requested", "approval.approved", "approval.rejected"]));
  });

  it("aprovação pendente é invalidada quando a peça muda", async () => {
    const { owner, clientId } = await configuredClient();
    const created = await createContent(owner, {
      clientId, title: "Post manual", channel: "instagram", format: "post", objective: "awareness",
      briefing: { text: "Apresentação da clínica para o bairro." }, mode: "manual", requestId: crypto.randomUUID(),
    });
    let detail = await getContent(owner, created.contentId);
    expect(detail.current?.source).toBe("manual");
    const doc = structuredClone(detail.current!.document);
    doc.caption = "Conheça a clínica.";
    doc.slides[0]!.fields.body = "Atendimento de segunda a sábado.";
    const v2 = await saveVersion(owner, created.contentId, { document: doc, baseVersionId: detail.current!.id });
    const { approvalId } = await submitForApproval(owner, created.contentId, { versionId: v2.versionId });
    const doc3 = structuredClone(doc);
    doc3.caption = "Conheça a nossa clínica.";
    await saveVersion(owner, created.contentId, { document: doc3, baseVersionId: v2.versionId });
    await expect(decideApproval(owner, approvalId, { decision: "approved" })).rejects.toBeInstanceOf(ConflictError);
    detail = await getContent(owner, created.contentId);
    expect(detail.approvals[0]?.status).toBe("superseded");
    expect(detail.status).toBe("in_review");
  });

  it("controle de qualidade bloqueia envio com termo proibido", async () => {
    const { owner, clientId } = await configuredClient();
    const created = await createContent(owner, {
      clientId, title: "Post", channel: "instagram", format: "post", objective: "awareness",
      briefing: { text: "Apresentação da clínica." }, mode: "manual", requestId: crypto.randomUUID(),
    });
    const detail = await getContent(owner, created.contentId);
    const doc = structuredClone(detail.current!.document);
    doc.slides[0]!.fields.title = "Um tratamento milagre";
    const v2 = await saveVersion(owner, created.contentId, { document: doc, baseVersionId: detail.current!.id });
    expect(v2.quality?.items.some((i) => i.id === "forbidden_term" && i.severity === "critical")).toBe(true);
    await expect(submitForApproval(owner, created.contentId, { versionId: v2.versionId })).rejects.toBeInstanceOf(ValidationError);
  });
});
