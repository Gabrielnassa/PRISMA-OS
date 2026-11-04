import { describe, expect, it } from "vitest";
import { createClient } from "../../src/server/services/clients";
import { createContent, getContent, submitForApproval } from "../../src/server/services/content";
import { assignableMembers, myTasks, setAssignment } from "../../src/server/services/tasks";
import { listInbox, markInboxRead, openInboxItem, unreadCount } from "../../src/server/services/inbox";
import { updateMember } from "../../src/server/services/users";
import { processNextJob } from "../../src/server/jobs/worker";
import { ForbiddenError, ValidationError } from "../../src/server/errors";
import { addMember, newOrg } from "./helpers";

async function drain() {
  while (await processNextJob("teste-tarefas")) {
    // fila
  }
}

describe("responsável, prazo e avisos", () => {
  it("atribui a quem acessa o cliente, avisa a pessoa e monta as tarefas de cada um", async () => {
    const { owner } = await newOrg();
    const editor = await addMember(owner, "editor");
    const reviewer = await addMember(owner, "reviewer");
    const viewer = await addMember(owner, "viewer");
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    const { contentId } = await createContent(owner, {
      clientId, title: "Bolão de Natal", channel: "instagram", format: "post", objective: "conversion",
      briefing: { text: "Bolão de Natal na loja, cotas a partir de dez reais." }, slideCount: 1, mode: "ai", requestId: crypto.randomUUID(),
    });
    await drain();

    // Sem acesso ao cliente, não pode ser responsável.
    await expect(setAssignment(owner, contentId, { assigneeId: editor.userId, dueDate: null })).rejects.toBeInstanceOf(ValidationError);
    await updateMember(owner, editor.userId, { role: "editor", isActive: true, clientIds: [clientId] });
    await updateMember(owner, reviewer.userId, { role: "reviewer", isActive: true, clientIds: [clientId] });
    expect((await assignableMembers(owner, clientId)).map((m) => m.id)).toEqual(expect.arrayContaining([owner.userId, editor.userId, reviewer.userId]));
    expect((await assignableMembers(owner, clientId)).map((m) => m.id)).not.toContain(viewer.userId);

    await setAssignment(owner, contentId, { assigneeId: editor.userId, dueDate: "2020-01-10" });
    const piece = await getContent(owner, contentId);
    expect(piece.assignee).toMatchObject({ id: editor.userId });
    expect(piece.dueDate).toBe("2020-01-10");
    await expect(setAssignment(viewer, contentId, { assigneeId: null, dueDate: null })).rejects.toBeInstanceOf(ForbiddenError);

    const tasks = await myTasks(editor);
    expect(tasks).toEqual([expect.objectContaining({ kind: "piece", contentId, overdue: true, dueDate: "2020-01-10" })]);
    expect(await unreadCount(editor)).toBe(1);
    const inbox = await listInbox(editor);
    expect(inbox.items[0]).toMatchObject({ kind: "content.assigned", title: "Nova peça para você: Bolão de Natal", href: `/conteudos/${contentId}`, read: false });
    expect(await openInboxItem(editor, inbox.items[0]!.id)).toBe(`/conteudos/${contentId}`);
    expect(await unreadCount(editor)).toBe(0);
    // Ninguém lê os avisos de outra pessoa.
    expect((await listInbox(reviewer)).items.some((n) => n.kind === "content.assigned")).toBe(false);

    // Enviada para aprovação: vira tarefa de quem aprova (e aviso).
    const current = await getContent(editor, contentId);
    await submitForApproval(editor, contentId, { versionId: current.current!.id });
    expect((await myTasks(reviewer)).map((t) => t.kind)).toContain("approval");
    expect((await listInbox(reviewer)).items[0]).toMatchObject({ kind: "approval.requested" });
    await markInboxRead(reviewer);
    expect(await unreadCount(reviewer)).toBe(0);
  });
});

describe("limpeza periódica", () => {
  it("remove logins de redes vencidos e avisos lidos antigos, sem tocar no resto", async () => {
    const { runMaintenance } = await import("../../src/server/services/maintenance");
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    const { systemCtx, withTx, one } = await import("../../src/server/db");
    await withTx(systemCtx("teste"), async (tx) => {
      await tx.query("INSERT INTO oauth_states (state_hash, organization_id, client_id, user_id, provider, expires_at) VALUES ('velho-' || gen_random_uuid(), $1, $2, $3, 'meta', now() - interval '3 days')", [owner.organizationId, clientId, owner.userId]);
      await tx.query("INSERT INTO notifications (organization_id, user_id, kind, title, read_at, created_at) VALUES ($1, $2, 'x', 'antigo', now(), now() - interval '120 days'), ($1, $2, 'x', 'novo', NULL, now())", [owner.organizationId, owner.userId]);
    });
    const r = await runMaintenance();
    expect(r.oauthStates).toBeGreaterThanOrEqual(1);
    expect(r.notifications).toBeGreaterThanOrEqual(1);
    const left = await withTx(systemCtx("teste"), (tx) => one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1", [owner.userId]));
    expect(left.n).toBe(1);
  });
});
