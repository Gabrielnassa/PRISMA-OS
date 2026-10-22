import crypto from "node:crypto";
import { createOrganizationWithOwner } from "../../src/server/services/organizations";
import { inviteMember } from "../../src/server/services/users";
import { login, resolveSession } from "../../src/server/auth/service";
import type { AuthContext } from "../../src/server/auth/types";
import type { Role } from "../../src/server/authz/permissions";
import type { AiProvider, StructuredRequest, StructuredResult } from "../../src/server/ai/types";
import { IntegrationError } from "../../src/server/errors";
import { svgToPng } from "../../src/server/render/engine";

export const PASSWORD = "senha-teste-123";

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@teste.prisma`;
}

export async function newOrg(name = "Agência Teste"): Promise<{ owner: AuthContext; email: string }> {
  const email = uniqueEmail("owner");
  await createOrganizationWithOwner({ organizationName: `${name} ${crypto.randomUUID().slice(0, 4)}`, ownerName: "Pessoa Dona", ownerEmail: email, password: PASSWORD });
  return { owner: await authFor(email, PASSWORD), email };
}

export async function authFor(email: string, password: string): Promise<AuthContext> {
  const { token } = await login({ email, password, ip: `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  const auth = await resolveSession(token);
  if (!auth) throw new Error("sessão não resolvida");
  return auth;
}

/** Adiciona um membro com senha conhecida (troca a senha temporária). */
export async function addMember(owner: AuthContext, role: Role): Promise<AuthContext> {
  const email = uniqueEmail(role);
  const { temporaryPassword } = await inviteMember(owner, { name: `Pessoa ${role}`, email, role });
  if (!temporaryPassword) throw new Error("senha temporária ausente");
  return authFor(email, temporaryPassword);
}

/** PNG real gerado localmente (para testes de upload e renderização). */
export function samplePng(width = 1200, height = 1200, color = "#6a7b8c"): Buffer {
  return svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><circle cx="${width / 2}" cy="${height / 2}" r="${width / 4}" fill="#eeeeee"/></svg>`, width);
}

/**
 * Provedor falso que imita um provedor real (is_demo = false), devolvendo
 * consumo de tokens para testar custos, falhas e tentativas.
 */
export class FakeProvider implements AiProvider {
  readonly id = "anthropic" as const;
  readonly label = "Fake";
  readonly model = "claude-opus-5-5";
  readonly isDemo = false;
  calls = 0;
  failures: IntegrationError[] = [];

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls++;
    const failure = this.failures.shift();
    if (failure) throw failure;
    if (!req.demo) throw new Error("sem demo");
    return {
      data: req.schema.parse(req.demo()),
      usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 0 },
      model: this.model,
      provider: this.id,
      isDemo: false,
      stopReason: "end_turn",
      durationMs: 5,
    };
  }

  async ping() {
    return { ok: true, detail: "fake" };
  }
}
