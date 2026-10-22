/**
 * Tarifas padrão inseridas ao criar uma organização. Valores documentados pela
 * Anthropic (tabela de modelos atualizada em 2026-10-06). O administrador pode
 * cadastrar novas tarifas em Custos e consumo; a vigente é a mais recente.
 */
export const DEFAULT_PRICES = [
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
] as const;
