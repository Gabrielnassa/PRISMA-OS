import { describe, expect, it } from "vitest";
import { systemCtx, withTx } from "../../src/server/db";
import { setProviderOverride } from "../../src/server/ai/gateway";
import { createClient } from "../../src/server/services/clients";
import { createContent } from "../../src/server/services/content";
import { getDashboard } from "../../src/server/services/dashboard";
import { addMember, newOrg } from "./helpers";

const manual = (clientId: string, channel: "instagram" | "linkedin", title: string) => ({
  clientId,
  title,
  channel,
  format: "post" as const,
  objective: "education" as const,
  briefing: { text: "Briefing de teste com conteúdo suficiente." },
  mode: "manual" as const,
  requestId: crypto.randomUUID(),
});

describe("dashboard", () => {
  it("filtra por cliente, canal, status e período usando só dados reais", async () => {
    setProviderOverride(null);
    const { owner } = await newOrg();
    const a = await createClient(owner, { name: "Cliente A" });
    const b = await createClient(owner, { name: "Cliente B" });
    await createContent(owner, manual(a.id, "instagram", "Post A1"));
    await createContent(owner, manual(a.id, "linkedin", "Post A2"));
    const old = await createContent(owner, manual(b.id, "instagram", "Post B1 antigo"));
    await withTx(systemCtx("test"), (tx) => tx.query("UPDATE content_items SET created_at = now() - interval '60 days' WHERE id = $1", [old.contentId]));

    const all = await getDashboard(owner, { period: "90d" });
    expect(all.producedInPeriod).toBe(3);
    expect((await getDashboard(owner, { period: "30d" })).producedInPeriod).toBe(2);
    expect((await getDashboard(owner, { period: "90d", channel: "linkedin" })).producedInPeriod).toBe(1);
    expect((await getDashboard(owner, { period: "90d", clientId: a.id })).producedInPeriod).toBe(2);
    expect((await getDashboard(owner, { period: "90d", status: "approved" })).producedInPeriod).toBe(0);
    const byStatus = await getDashboard(owner, { period: "90d", status: "draft" });
    expect(byStatus.recent.map((r) => r.status).every((s) => s === "draft")).toBe(true);
    expect(byStatus.perClient.find((c) => c.clientId === a.id)?.contents).toBe(2);
  });

  it("membro sem acesso ao cliente não vê seus números", async () => {
    setProviderOverride(null);
    const { owner } = await newOrg();
    const a = await createClient(owner, { name: "Cliente restrito" });
    await createContent(owner, manual(a.id, "instagram", "Post restrito"));
    const editor = await addMember(owner, "editor");
    const view = await getDashboard(editor, { period: "90d" });
    expect(view.producedInPeriod).toBe(0);
    expect(view.recent).toEqual([]);
    expect(view.perClient).toEqual([]);
  });
});
