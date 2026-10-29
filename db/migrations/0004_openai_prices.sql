-- Tarifas da OpenAI para organizações existentes (novas organizações recebem as
-- mesmas em DEFAULT_PRICES). Valores de agregadores de out/2026: conferir em
-- https://openai.com/api/pricing e ajustar em Custos e consumo se diferirem.
INSERT INTO provider_prices (organization_id, provider, model, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, source)
SELECT o.id, 'openai', m.model, m.input, m.output, m.cache_read,
       'Tarifa de ' || m.model || ' publicada por agregadores em out/2026 (US$' || m.input || ' entrada / US$' || m.output || ' saída por milhão de tokens'
       || coalesce('; US$' || m.cache_read || ' entrada em cache', '') || '). Conferir em https://openai.com/api/pricing e ajustar aqui se diferir.'
FROM organizations o
CROSS JOIN (VALUES
  ('gpt-6.1-sol', 2.00::numeric, 10.00::numeric, NULL::numeric),
  ('gpt-6.1-terra', 1.00, 5.00, NULL),
  ('gpt-6-astra', 10.00, 50.00, 1.00)
) AS m (model, input, output, cache_read)
WHERE NOT EXISTS (
  SELECT 1 FROM provider_prices p WHERE p.organization_id = o.id AND p.provider = 'openai' AND p.model = m.model
);
