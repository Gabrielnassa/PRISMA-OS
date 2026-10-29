import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "../../src/server/services/clients";
import { createContent, getContent, submitForApproval } from "../../src/server/services/content";
import { uploadMedia } from "../../src/server/services/media";
import { createApprovalLink, decideByLink, getPublicApproval, renderPublicSlide } from "../../src/server/services/approval-links";
import { createWebhook, isAllowedWebhookUrl } from "../../src/server/services/webhooks";
import { saveSmtp, setMailSender, type MailMessage } from "../../src/server/services/email";
import { calendarFeedIcs, createCalendarFeed } from "../../src/server/services/calendar-feed";
import { proposeEditorialPlan, currentMonth } from "../../src/server/services/editorial";
import { setPackage } from "../../src/server/services/packages";
import { saveAppCredentials } from "../../src/server/services/integration-apps";
import { finishConnection, listAccounts, startConnection } from "../../src/server/services/social-accounts";
import { listPublications, schedulePublications } from "../../src/server/services/publications";
import { processNextJob } from "../../src/server/jobs/worker";
import { setSocialFetch } from "../../src/server/integrations/social/http";
import { ValidationError } from "../../src/server/errors";
import { addMember, newOrg } from "./helpers";
import { bodyOf, fakeFetch } from "../support/fake-fetch";
import type { AuthContext } from "../../src/server/auth/types";

afterEach(() => {
  setSocialFetch(undefined);
  setMailSender(undefined);
});

async function drain() {
  while (await processNextJob("teste-entregas")) {
    // processa a fila
  }
}

async function pieceAwaitingApproval(owner: AuthContext, clientId: string) {
  const { contentId } = await createContent(owner, {
    clientId,
    title: "Mega da Virada",
    channel: "instagram",
    format: "post",
    objective: "conversion",
    briefing: { text: "Bolão da Mega da Virada na loja, cotas a partir de dez reais.", cta: "Garanta sua cota" },
    slideCount: 1,
    mode: "ai",
    requestId: crypto.randomUUID(),
  });
  await drain();
  const piece = await getContent(owner, contentId);
  const { approvalId } = await submitForApproval(owner, contentId, { versionId: piece.current!.id, note: "Confere o valor da cota" });
  return { contentId, approvalId };
}

describe("aprovação pelo cliente por link", () => {
  it("mostra a versão enviada, registra a decisão com o nome do cliente e não aceita de novo", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    const { contentId, approvalId } = await pieceAwaitingApproval(owner, clientId);
    const link = await createApprovalLink(owner, approvalId);
    expect(link.url).toMatch(/^https:\/\/prisma\.teste\.example\/aprovar\/[A-Za-z0-9_-]{30,}$/);
    const token = link.url.split("/").pop()!;

    const view = await getPublicApproval(token);
    expect(view).toMatchObject({ clientName: "Coli Loterias", title: "Mega da Virada", status: "pending", requestNote: "Confere o valor da cota", slideCount: 1 });
    const png = await renderPublicSlide(token, 0);
    expect(png!.subarray(1, 4).toString()).toBe("PNG");
    expect(await renderPublicSlide(token, 5)).toBeNull();
    expect(await getPublicApproval("token-que-nao-existe-123456789")).toBeNull();

    await expect(decideByLink(token, { decision: "rejected", name: "Maria", note: "" })).rejects.toBeInstanceOf(ValidationError);
    await decideByLink(token, { decision: "approved", name: "Maria Coli", note: "Pode postar" });
    const piece = await getContent(owner, contentId);
    expect(piece.status).toBe("approved");
    expect(piece.approvals[0]).toMatchObject({ status: "approved", decidedByName: "Maria Coli (cliente)", decisionNote: "Pode postar" });
    expect((await getPublicApproval(token))!.status).toBe("approved");
    await expect(decideByLink(token, { decision: "approved", name: "Maria Coli" })).rejects.toThrow(/já foi respondido/);
    await expect(createApprovalLink(owner, approvalId)).rejects.toThrow(/já foi decidido/);

    // Outra organização não gera link para o pedido.
    const other = await newOrg("Outra");
    await expect(createApprovalLink(other.owner, approvalId)).rejects.toThrow();
  });

  it("pedido de ajuste do cliente reprova e vira sugestão na memória", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    const { contentId, approvalId } = await pieceAwaitingApproval(owner, clientId);
    const token = (await createApprovalLink(owner, approvalId)).url.split("/").pop()!;
    await decideByLink(token, { decision: "rejected", name: "João", note: "O valor da cota é quinze reais." });
    expect((await getContent(owner, contentId)).status).toBe("rejected");
  });
});

describe("avisos: e-mail e webhooks", () => {
  it("pedido de aprovação avisa quem aprova por e-mail e dispara o webhook assinado", async () => {
    const { owner } = await newOrg();
    const reviewer = await addMember(owner, "reviewer");
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    // O aprovador só recebe se tiver acesso ao cliente.
    const { updateMember } = await import("../../src/server/services/users");
    await updateMember(owner, reviewer.userId, { role: "reviewer", isActive: true, clientIds: [clientId] });

    await saveSmtp(owner, { host: "smtp.hostinger.com", port: 465, secure: true, user: "contato@agencia.com.br", from: "Agência <contato@agencia.com.br>", password: "senha-do-email" });
    expect(isAllowedWebhookUrl("http://exemplo.com")).toBe(false);
    await expect(createWebhook(owner, { url: "https://127.0.0.1/hook", events: ["approval.requested"] })).rejects.toBeInstanceOf(ValidationError);
    const { secret } = await createWebhook(owner, { url: "https://hooks.exemplo.com/prisma", events: ["approval.requested", "approval.decided"] });

    const sent: MailMessage[] = [];
    setMailSender(async (cfg, msg) => {
      expect(cfg).toMatchObject({ host: "smtp.hostinger.com", password: "senha-do-email" });
      sent.push(msg);
    });
    const hooks = fakeFetch([{ method: "POST", match: /hooks\.exemplo\.com\/prisma/, reply: () => ({ json: { ok: true } }) }]);
    setSocialFetch(hooks.fn);

    await pieceAwaitingApproval(owner, clientId);
    await drain();
    const toReviewer = sent.find((m) => m.to.includes(reviewer.email))!;
    expect(toReviewer.subject).toBe("Para aprovar: Mega da Virada (Coli Loterias)");
    expect(toReviewer.text).toContain("https://prisma.teste.example/conteudos/");
    // Quem pediu não recebe o próprio aviso.
    expect(sent.some((m) => m.to.includes(owner.email))).toBe(false);

    const call = hooks.calls.find((c) => (c.init.headers as Record<string, string>)["X-Prisma-Event"] === "approval.requested")!;
    const headers = call.init.headers as Record<string, string>;
    const body = String(call.init.body);
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(`${headers["X-Prisma-Timestamp"]}.${body}`).digest("hex")}`;
    expect(headers["X-Prisma-Signature"]).toBe(expected);
    expect(JSON.parse(body)).toMatchObject({ event: "approval.requested", data: { clientId } });
  });
});

describe("agenda (ICS)", () => {
  it("endereço privado com as pautas dos clientes que a pessoa acessa", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    await setPackage(owner, clientId, { posts: 2, carousels: 0, stories: 0, videos: 0 });
    await proposeEditorialPlan(owner, clientId, { month: currentMonth(), useAi: false });
    const url = await createCalendarFeed(owner);
    const token = url.split("/").pop()!.replace(/\.ics$/, "");
    const ics = (await calendarFeedIcs(token))!;
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Coli Loterias: Pauta a definir");
    // Gerar de novo invalida o anterior.
    await createCalendarFeed(owner);
    expect(await calendarFeedIcs(token)).toBeNull();
  });
});

describe("vídeo da biblioteca", () => {
  it("sobe no YouTube (envio em sessão) e no TikTok (em partes)", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(2048, 1)]);
    const video = await uploadMedia(owner, clientId, { filename: "bolao.mp4", data: mp4 }, { kind: "video" });

    await saveAppCredentials(owner, "google", { publicId: "123-abc.apps.googleusercontent.com", secret: "GOCSPX-segredo" });
    await saveAppCredentials(owner, "tiktok", { publicId: "awclientkey", secret: "segredo-tiktok-1234" });
    const g = new URL(await startConnection(owner, clientId, "google"));
    setSocialFetch(
      fakeFetch([
        { method: "POST", match: /oauth2\.googleapis\.com\/token/, reply: () => ({ json: { access_token: "ya29.x", refresh_token: "1//r", expires_in: 3599 } }) },
        { match: /youtube\/v3\/channels/, reply: () => ({ json: { items: [{ id: "UC1", snippet: { title: "Coli" } }] } }) },
      ]).fn,
    );
    await finishConnection(owner, "google", { code: "c", state: g.searchParams.get("state") });
    const t = new URL(await startConnection(owner, clientId, "tiktok"));
    setSocialFetch(
      fakeFetch([
        { method: "POST", match: /oauth\/token\//, reply: () => ({ json: { access_token: "tt", refresh_token: "ttr", expires_in: 86400, open_id: "o1" } }) },
        { match: /user\/info\//, reply: () => ({ json: { data: { user: { open_id: "o1", username: "coli" } }, error: { code: "ok" } } }) },
        { method: "POST", match: /creator_info/, reply: () => ({ json: { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } } }) },
      ]).fn,
    );
    await finishConnection(owner, "tiktok", { code: "c", state: t.searchParams.get("state") });
    const accounts = await listAccounts(owner, clientId);
    const yt = accounts.find((a) => a.network === "youtube")!;
    const tt = accounts.find((a) => a.network === "tiktok")!;

    await expect(schedulePublications(owner, { mediaAssetId: video.id, accountIds: [tt.id], when: "now", caption: "Bolão", tiktokPrivacy: "SELF_ONLY" })).rejects.toThrow(/uso de música/);

    const net = fakeFetch([
      { method: "POST", match: /upload\/youtube\/v3\/videos\?uploadType=resumable/, reply: () => ({ json: {}, headers: { location: "https://www.googleapis.com/upload/session/abc" } }) },
      { method: "PUT", match: /upload\/session\/abc/, reply: () => ({ json: { id: "yt-video-1" } }) },
      { method: "POST", match: /post\/publish\/video\/init\//, reply: () => ({ json: { data: { publish_id: "pub-1", upload_url: "https://open-upload.tiktokapis.com/video/?id=1" }, error: { code: "ok" } } }) },
      { method: "PUT", match: /open-upload\.tiktokapis\.com/, reply: () => ({ status: 201, json: {} }) },
      { method: "POST", match: /post\/publish\/status\/fetch\//, reply: () => ({ json: { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7300001] }, error: { code: "ok" } } }) },
    ]);
    setSocialFetch(net.fn);
    await schedulePublications(owner, {
      mediaAssetId: video.id,
      accountIds: [yt.id, tt.id],
      when: "now",
      title: "Bolão da Mega",
      caption: "Garanta sua cota",
      youtubePrivacy: "unlisted",
      tiktokPrivacy: "SELF_ONLY",
      tiktokConsent: true,
    });
    await drain();
    const pubs = await listPublications(owner, { clientId });
    expect(pubs.map((p) => [p.network, p.status, p.externalUrl]).sort()).toEqual([
      ["tiktok", "published", "https://www.tiktok.com/@coli/video/7300001"],
      ["youtube", "published", "https://www.youtube.com/watch?v=yt-video-1"],
    ]);
    const start = net.calls.find((c) => c.url.href.includes("uploadType=resumable"))!;
    expect(JSON.parse(String(start.init.body))).toMatchObject({ snippet: { title: "Bolão da Mega", description: "Garanta sua cota" }, status: { privacyStatus: "unlisted" } });
    const init = net.calls.find((c) => c.url.pathname.endsWith("/video/init/"))!;
    expect(bodyOf(init.init)).toMatchObject({ source_info: { source: "FILE_UPLOAD", video_size: mp4.length, total_chunk_count: 1 }, post_info: { privacy_level: "SELF_ONLY" } });
  });
});
