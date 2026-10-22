import { describe, expect, it } from "vitest";
import { login, resolveSession, revokeSession } from "../../src/server/auth/service";
import { many, systemCtx, withTx } from "../../src/server/db";
import { ConflictError, RateLimitError, UnauthenticatedError } from "../../src/server/errors";
import { changeOwnPassword, inviteMember, updateMember } from "../../src/server/services/users";
import { PASSWORD, authFor, newOrg, uniqueEmail } from "./helpers";

describe("autenticação", () => {
  it("autentica, resolve e revoga a sessão", async () => {
    const { email } = await newOrg();
    const { token } = await login({ email, password: PASSWORD });
    const auth = await resolveSession(token);
    expect(auth?.email).toBe(email);
    expect(auth?.role).toBe("owner");
    await revokeSession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it("recusa senha errada sem revelar se o e-mail existe", async () => {
    const { email } = await newOrg();
    await expect(login({ email, password: "errada-123456" })).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(login({ email: "naoexiste@teste.prisma", password: "errada-123456" })).rejects.toThrow("E-mail ou senha inválidos.");
  });

  it("bloqueia após 5 tentativas falhas", async () => {
    const { email } = await newOrg();
    for (let i = 0; i < 5; i++) await expect(login({ email, password: `errada-${i}xxxxx` })).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(login({ email, password: PASSWORD })).rejects.toBeInstanceOf(RateLimitError);
  });

  it("token inválido ou malformado não resolve sessão", async () => {
    expect(await resolveSession("x")).toBeNull();
    expect(await resolveSession("a".repeat(43))).toBeNull();
  });

  it("troca de senha revoga as demais sessões", async () => {
    const { email } = await newOrg();
    const a1 = await authFor(email, PASSWORD);
    const other = await login({ email, password: PASSWORD });
    await changeOwnPassword(a1, { current: PASSWORD, next: "nova-senha-456" });
    expect(await resolveSession(other.token)).toBeNull();
    await expect(login({ email, password: "nova-senha-456" })).resolves.toHaveProperty("token");
  });

  it("tentativas paralelas não escapam do limite de 5 falhas", async () => {
    const { email } = await newOrg();
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => login({ email, password: `paralela-${i}-errada` })));
    const reasons = results.map((r) => (r.status === "rejected" ? r.reason : null));
    expect(reasons.filter((e) => e instanceof UnauthenticatedError)).toHaveLength(5);
    expect(reasons.filter((e) => e instanceof RateLimitError)).toHaveLength(7);
    await expect(login({ email, password: PASSWORD })).rejects.toBeInstanceOf(RateLimitError);
  });

  it("senha temporária vencida não permite entrar", async () => {
    const { owner } = await newOrg();
    const email = uniqueEmail("temp");
    const { userId, temporaryPassword } = await inviteMember(owner, { name: "Pessoa Nova", email, role: "editor" });
    const first = await authFor(email, temporaryPassword);
    expect(first.mustChangePassword).toBe(true);
    await withTx(systemCtx("test"), (tx) => tx.query("UPDATE users SET password_set_at = now() - interval '8 days' WHERE id = $1", [userId]));
    await expect(login({ email, password: temporaryPassword })).rejects.toThrow("Senha temporária expirada");
  });

  it("convite para e-mail já cadastrado não vincula a conta de outra organização", async () => {
    const a = await newOrg();
    const b = await newOrg();
    await expect(inviteMember(b.owner, { name: "Dono de A", email: a.email, role: "admin" })).rejects.toBeInstanceOf(ConflictError);
    const rows = await withTx(systemCtx("test"), (tx) => many(tx, "SELECT 1 FROM memberships WHERE organization_id = $1 AND user_id = $2", [b.owner.organizationId, a.owner.userId]));
    expect(rows).toHaveLength(0);
  });

  it("desativar um membro vale só para a organização que desativou", async () => {
    const a = await newOrg();
    const b = await newOrg();
    const email = uniqueEmail("dupla");
    const { userId, temporaryPassword } = await inviteMember(a.owner, { name: "Pessoa em duas agências", email, role: "editor" });
    // Vínculo à organização B feito pelo operador (como em `npm run member:add`).
    await withTx(systemCtx("test"), (tx) => tx.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'viewer')", [b.owner.organizationId, userId]));
    const inA = await authFor(email, temporaryPassword);
    expect(inA.organizationId).toBe(a.owner.organizationId);

    await updateMember(a.owner, userId, { role: "editor", isActive: false, clientIds: [] });
    // A sessão na organização A deixa de valer; a conta continua entrando na B.
    const { token } = await login({ email, password: temporaryPassword });
    const inB = await resolveSession(token);
    expect(inB?.organizationId).toBe(b.owner.organizationId);
    expect(inB?.role).toBe("viewer");
    const user = await withTx(systemCtx("test"), (tx) => many<{ is_active: boolean }>(tx, "SELECT is_active FROM users WHERE id = $1", [userId]));
    expect(user[0]?.is_active).toBe(true);
  });
});
