"use server";

import { requireAuth } from "@/server/auth/next";
import { refresh } from "next/cache";
import { bool, runAction, str, type ActionState } from "@/server/actions";
import { APP_PROVIDERS, APP_PROVIDER_INFO, removeAppCredentials, saveAppCredentials, type AppProvider } from "@/server/services/integration-apps";
import { removeSmtp, saveSmtp, testSmtp } from "@/server/services/email";
import { createWebhook, deleteWebhook, testWebhook } from "@/server/services/webhooks";
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

// ---------------------------------------------------------------------------
// Chaves dos apps, e-mail e webhooks
// ---------------------------------------------------------------------------

export async function saveAppAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const provider = str(form, "provider") as AppProvider;
    if (!APP_PROVIDERS.includes(provider)) throw new IntegrationError("Plataforma desconhecida.", false);
    await saveAppCredentials(auth, provider, { publicId: str(form, "publicId"), secret: str(form, "secret") });
    refresh();
    return { message: `Chaves da ${APP_PROVIDER_INFO[provider].label} salvas.` };
  });
}

export async function removeAppAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const provider = str(form, "provider") as AppProvider;
    if (!APP_PROVIDERS.includes(provider)) throw new IntegrationError("Plataforma desconhecida.", false);
    await removeAppCredentials(auth, provider);
    refresh();
    return { message: "Chaves removidas." };
  });
}

export async function saveSmtpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await saveSmtp(auth, { host: str(form, "host"), port: str(form, "port"), secure: bool(form, "secure"), user: str(form, "user"), from: str(form, "from"), password: str(form, "password") });
    refresh();
    return { message: "E-mail configurado. Use “Enviar teste” para conferir." };
  });
}

export async function testSmtpAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await testSmtp(auth);
    return { message: `E-mail de teste enviado para ${auth.email}.` };
  });
}

export async function removeSmtpAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await removeSmtp(auth);
    refresh();
    return { message: "E-mail desligado." };
  });
}

export async function createWebhookAction(_prev: ActionState<{ secret: string }>, form: FormData): Promise<ActionState<{ secret: string }>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const r = await createWebhook(auth, { url: str(form, "url"), events: form.getAll("events").map(String) });
    refresh();
    return { message: "Webhook criado.", data: { secret: r.secret } };
  });
}

export async function webhookOpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const id = str(form, "id");
    if (str(form, "op") === "delete") {
      await deleteWebhook(auth, id);
      refresh();
      return { message: "Webhook removido." };
    }
    await testWebhook(auth, id);
    refresh();
    return { message: "Teste enviado. O resultado aparece aqui em alguns segundos." };
  });
}
