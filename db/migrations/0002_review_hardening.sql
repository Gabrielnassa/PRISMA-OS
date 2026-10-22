-- Correções da revisão de segurança e integridade.

-- 1) Ativação por organização: um administrador só desativa o acesso à SUA
--    organização. users.is_active passa a ser exclusivo da operação da plataforma.
ALTER TABLE memberships
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN last_access_at timestamptz;

CREATE OR REPLACE FUNCTION app_org_role(org uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role
  FROM memberships m
  JOIN users u ON u.id = m.user_id AND u.is_active
  WHERE m.organization_id = org AND m.user_id = app_user_id() AND m.deactivated_at IS NULL
$$;

-- 2) Senhas temporárias expiram (o momento da definição da senha fica registrado).
ALTER TABLE users ADD COLUMN password_set_at timestamptz NOT NULL DEFAULT now();

-- 3) Orientação EXIF das fotos (1 = normal; 3, 6, 8 = rotações).
ALTER TABLE media_assets ADD COLUMN orientation smallint NOT NULL DEFAULT 1 CHECK (orientation BETWEEN 1 AND 8);

-- 4) Custos: estimativa explícita quando o modelo que atendeu não tem tarifa
--    cadastrada (ex.: fallback do servidor) e detalhamento por tentativa.
ALTER TABLE ai_runs
  ADD COLUMN estimated_cost_usd numeric(14, 6),
  ADD COLUMN usage_breakdown jsonb;

-- 5) Fila: reprocessamentos manuais acrescentam tentativas sem apagar o histórico.
ALTER TABLE jobs DROP CONSTRAINT jobs_max_attempts_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 100);
ALTER TABLE job_attempts ALTER COLUMN duration_ms TYPE bigint;

-- 6) Tarifas dos modelos de fallback do servidor para organizações existentes
--    (novas organizações recebem as mesmas tarifas em DEFAULT_PRICES).
INSERT INTO provider_prices (organization_id, provider, model, input_usd_per_mtok, output_usd_per_mtok, source)
SELECT o.id, 'anthropic', m.model, 5.00, 25.00,
       'Preços públicos Anthropic para ' || m.model || ' (US$5 entrada / US$25 saída por milhão de tokens), usados quando o fallback do servidor atende uma solicitação recusada. Cache sem tarifa própria cadastrada: cobrado como entrada. Conferir em https://platform.claude.com/docs/en/about-claude/pricing'
FROM organizations o
CROSS JOIN (VALUES ('claude-opus-5'), ('claude-opus-4-8')) AS m (model)
WHERE NOT EXISTS (
  SELECT 1 FROM provider_prices p WHERE p.organization_id = o.id AND p.provider = 'anthropic' AND p.model = m.model
);
