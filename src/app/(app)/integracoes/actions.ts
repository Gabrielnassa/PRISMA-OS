"use server";

import { requireAuth } from "@/server/auth/next";
import { runAction, type ActionState } from "@/server/actions";
import { assertCan } from "@/server/authz/permissions";
import { getProvider } from "@/server/ai/gateway";
import { IntegrationError, ProviderNotConfiguredError } from "@/server/errors";
import { audit, userActor } from "@/server/services/audit";
import { userCtx, withTx } from "@/server/db";

/** Chamada mínima real ao provedor para confirmar credenciais (custo de poucos tokens). */
export async function testProviderAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    assertCan(auth.role, "integrations.test");
    const provider = getProvider();
    if (!provider) throw new ProviderNotConfiguredError();
    const r = await provider.ping();
    await withTx(userCtx(auth.userId), (tx) =>
      audit(tx, userActor(auth), {
        organizationId: auth.organizationId,
        action: "integration.tested",
        entityType: "integration",
        entityId: provider.id,
        metadata: { ok: r.ok, model: r.model ?? provider.model, usage: r.usage ?? null },
      }),
    );
    // A mensagem do provedor já é segura (traduzida em mapAnthropicError) e é o diagnóstico que o administrador precisa.
    if (!r.ok) throw new IntegrationError(r.detail, false);
    return { message: `${r.detail}${r.usage ? ` Consumo do teste: ${r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens} tokens de entrada, ${r.usage.outputTokens} de saída.` : ""}` };
  });
}
