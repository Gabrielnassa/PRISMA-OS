/**
 * Tarifas padrão inseridas ao criar uma organização. Valores documentados pela
 * Anthropic (tabela de modelos atualizada em 2026-10-06). O administrador pode
 * cadastrar novas tarifas em Custos e consumo; a vigente é a mais recente.
 */
export const DEFAULT_PRICES: Array<{
  provider: string;
  model: string;
  inputUsdPerMtok: string;
  outputUsdPerMtok: string;
  cacheReadUsdPerMtok: string | null;
  cacheWriteUsdPerMtok: string | null;
  source: string;
}> = [
  {
    provider: "anthropic",
    model: "claude-opus-5-5",
    inputUsdPerMtok: "4.00",
    outputUsdPerMtok: "20.00",
    cacheReadUsdPerMtok: "0.20",
    cacheWriteUsdPerMtok: "5.00",
    source:
      "Preços públicos Anthropic para Claude Opus 5.5 (US$4 entrada / US$20 saída / US$0,20 leitura de cache por milhão de tokens; escrita de cache = 1,25× entrada, TTL 5 min). Conferir em https://platform.claude.com/docs/en/about-claude/pricing",
  },
  // Modelos para os quais o fallback do servidor ("default") pode encaminhar uma
  // solicitação recusada. Sem tarifa de cache cadastrada: leitura e escrita de
  // cache são contadas pelo preço de entrada (estimativa conservadora).
  ...(["claude-opus-5", "claude-opus-4-8"] as const).map((model) => ({
    provider: "anthropic",
    model,
    inputUsdPerMtok: "5.00",
    outputUsdPerMtok: "25.00",
    cacheReadUsdPerMtok: null,
    cacheWriteUsdPerMtok: null,
    source: `Preços públicos Anthropic para ${model} (US$5 entrada / US$25 saída por milhão de tokens), usados quando o fallback do servidor atende uma solicitação recusada. Cache sem tarifa própria cadastrada: cobrado como entrada. Conferir em https://platform.claude.com/docs/en/about-claude/pricing`,
  })),
  // OpenAI. A página oficial de preços não estava acessível ao cadastrar estas
  // tarifas; os valores vêm de agregadores de outubro de 2026 e devem ser
  // conferidos em https://openai.com/api/pricing (ajuste em Custos e consumo).
  // Cache sem tarifa cadastrada: cobrado como entrada (estimativa conservadora).
  ...([
    ["gpt-6.1-sol", "2.00", "10.00", null],
    ["gpt-6.1-terra", "1.00", "5.00", null],
    ["gpt-6-astra", "10.00", "50.00", "1.00"],
  ] as const).map(([model, input, output, cacheRead]) => ({
    provider: "openai",
    model,
    inputUsdPerMtok: input,
    outputUsdPerMtok: output,
    cacheReadUsdPerMtok: cacheRead,
    cacheWriteUsdPerMtok: null,
    source: `Tarifa de ${model} publicada por agregadores em out/2026 (US$${input} entrada / US$${output} saída por milhão de tokens${cacheRead ? `; US$${cacheRead} entrada em cache` : ""}). Conferir em https://openai.com/api/pricing e ajustar aqui se diferir.`,
  })),
];
