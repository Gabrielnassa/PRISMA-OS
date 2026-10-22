import { describe, expect, it } from "vitest";
import { login, resolveSession, revokeSession } from "../../src/server/auth/service";
import { RateLimitError, UnauthenticatedError } from "../../src/server/errors";
import { changeOwnPassword } from "../../src/server/services/users";
import { PASSWORD, authFor, newOrg } from "./helpers";

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
});
