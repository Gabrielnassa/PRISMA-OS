import { env } from "../env";
import { AnthropicProvider } from "./providers/anthropic";
import { DemoProvider } from "./providers/demo";
import type { AiProvider, ProviderStatus } from "./types";

/**
 * Camada única de acesso a provedores de IA. Nenhum outro módulo instancia
 * SDKs de IA diretamente; trocar ou adicionar provedores acontece aqui.
 */

let override: AiProvider | null | undefined;

export function setProviderOverride(p: AiProvider | null | undefined): void {
  override = p;
}

function selectedProviderId(): "anthropic" | "demo" | "none" {
  const e = env();
  if (e.AI_PROVIDER) return e.AI_PROVIDER;
  return e.ANTHROPIC_API_KEY ? "anthropic" : "none";
}

export function getProvider(): AiProvider | null {
  if (override !== undefined) return override;
  const e = env();
  const id = selectedProviderId();
  if (id === "anthropic") {
    if (!e.ANTHROPIC_API_KEY) return null;
    return new AnthropicProvider({
      apiKey: e.ANTHROPIC_API_KEY,
      model: e.ANTHROPIC_MODEL,
      effort: e.ANTHROPIC_EFFORT,
      fallbacks: e.ANTHROPIC_FALLBACKS === "default",
      timeoutMs: e.AI_TIMEOUT_MS,
    });
  }
  if (id === "demo") {
    if (e.NODE_ENV === "production") return null;
    return new DemoProvider();
  }
  return null;
}

export function providerStatus(): ProviderStatus {
  const e = env();
  const id = selectedProviderId();
  const p = getProvider();
  if (p) {
    return {
      configured: true,
      provider: p.id,
      label: p.label,
      model: p.model,
      isDemo: p.isDemo,
      detail: p.isDemo
        ? "Modo demonstração: textos montados a partir do briefing, sem IA. Não use em produção."
        : `Modelo ${p.model}, esforço ${e.ANTHROPIC_EFFORT ? `fixo em ${e.ANTHROPIC_EFFORT} (ANTHROPIC_EFFORT)` : "definido por skill"}, fallback do servidor ${e.ANTHROPIC_FALLBACKS === "default" ? "ativado" : "desativado"}.`,
    };
  }
  let detail = "Nenhum provedor de IA configurado. Defina ANTHROPIC_API_KEY no ambiente do servidor.";
  if (id === "anthropic") detail = "AI_PROVIDER=anthropic, mas ANTHROPIC_API_KEY não está definida.";
  if (id === "demo" && e.NODE_ENV === "production") detail = "O provedor de demonstração é bloqueado em produção.";
  return { configured: false, provider: id, label: "Não configurado", model: null, isDemo: false, detail };
}
