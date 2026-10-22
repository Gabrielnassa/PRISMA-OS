import { describe, expect, it } from "vitest";
import { many, systemCtx, userCtx, withTx } from "../../src/server/db";
import { NotFoundError, ForbiddenError } from "../../src/server/errors";
import { createClient, getClient, listClients, updateBrandProfile } from "../../src/server/services/clients";
import { updateMember } from "../../src/server/services/users";
import { uploadMedia, getMediaFile } from "../../src/server/services/media";
import { addMember, newOrg, samplePng } from "./helpers";

describe("isolamento multicliente (RLS + serviços)", () => {
  it("a conexão da aplicação não é dona das tabelas nem ignora RLS", async () => {
    const rows = await withTx(systemCtx("test"), (tx) =>
      many<{ bypass: boolean; owns: boolean }>(
        tx,
        `SELECT r.rolbypassrls AS bypass,
                EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user) AS owns
         FROM pg_roles r WHERE r.rolname = current_user`,
      ),
    );
    expect(rows[0]).toEqual({ bypass: false, owns: false });
  });

  it("organizações não enxergam clientes, arquivos ou registros umas das outras", async () => {
    const a = await newOrg("A");
    const b = await newOrg("B");
    const ca = await createClient(a.owner, { name: "Cliente da A" });
    await createClient(b.owner, { name: "Cliente da B" });

    expect((await listClients(a.owner)).map((c) => c.name)).toEqual(["Cliente da A"]);
    await expect(getClient(b.owner, ca.id)).rejects.toBeInstanceOf(NotFoundError);

    // Mesmo uma consulta sem filtro de organização é bloqueada pelo banco.
    const visibleToB = await withTx(userCtx(b.owner.userId), (tx) => many<{ id: string }>(tx, "SELECT id FROM clients"));
    expect(visibleToB.map((r) => r.id)).not.toContain(ca.id);

    const media = await uploadMedia(a.owner, ca.id, { filename: "foto.png", data: samplePng() }, {});
    await expect(getMediaFile(b.owner, media.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateBrandProfile(b.owner, ca.id, {})).rejects.toBeInstanceOf(NotFoundError);

    // Inserção cruzada direta também é recusada pelas políticas.
    await expect(
      withTx(userCtx(b.owner.userId), (tx) =>
        tx.query("INSERT INTO client_memories (organization_id, client_id, kind, content) VALUES ($1, $2, 'fact', 'teste cruzado')", [a.owner.organizationId, ca.id]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("membros não administradores só acessam clientes atribuídos", async () => {
    const a = await newOrg();
    const c1 = await createClient(a.owner, { name: "Atribuído" });
    const c2 = await createClient(a.owner, { name: "Não atribuído" });
    const editor = await addMember(a.owner, "editor");
    expect(await listClients(editor)).toEqual([]);
    await updateMember(a.owner, editor.userId, { role: "editor", isActive: true, clientIds: [c1.id] });
    expect((await listClients(editor)).map((c) => c.id)).toEqual([c1.id]);
    await expect(getClient(editor, c2.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createClient(editor, { name: "Novo" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("contexto sem usuário não lê nada", async () => {
    const a = await newOrg();
    await createClient(a.owner, { name: "Invisível" });
    const rows = await withTx({ kind: "user", userId: "00000000-0000-4000-8000-000000000000" }, (tx) => many(tx, "SELECT id FROM clients"));
    expect(rows).toEqual([]);
  });
});
