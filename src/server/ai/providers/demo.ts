import { IntegrationError } from "../../errors";
import type { AiProvider, StructuredRequest, StructuredResult } from "../types";

/**
 * Provedor de DEMONSTRAÇÃO: não usa IA. Monta saídas determinísticas a partir
 * do briefing para permitir testar o fluxo sem credenciais. Só pode ser
 * habilitado fora de produção (AI_PROVIDER=demo) e tudo que produz é
 * identificado como demonstração na interface e no banco (is_demo/source=demo).
 */
export class DemoProvider implements AiProvider {
  readonly id = "demo" as const;
  readonly label = "Demonstração (sem IA)";
  readonly model = "demo-deterministico";
  readonly isDemo = true;

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const started = Date.now();
    if (!req.demo) throw new IntegrationError("Esta skill não possui saída de demonstração.", false, { providerCode: "demo_unsupported" });
    const data = req.schema.parse(req.demo());
    return {
      data,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      model: this.model,
      provider: this.id,
      isDemo: true,
      stopReason: "end_turn",
      durationMs: Date.now() - started,
    };
  }

  async ping() {
    return { ok: true, detail: "Provedor de demonstração ativo: nenhuma IA real é chamada." };
  }
}
