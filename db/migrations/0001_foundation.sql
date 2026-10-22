-- PRISMA OS — fundação: organizações, usuários, permissões, clientes, marca,
-- mídia, conteúdo versionado, aprovações, auditoria, IA, custos e filas.
--
-- Modelo de isolamento:
--   * As tabelas pertencem ao papel que executa as migrations (owner).
--   * A aplicação conecta com um papel de login membro de `prisma_app`, que
--     NÃO é dono das tabelas; por isso as políticas de RLS se aplicam a ele.
--   * Cada transação da aplicação define `app.user_id` (usuário autenticado)
--     ou `app.system = 'on'` (operações internas: login, worker, scripts).
--   * As funções auxiliares são SECURITY DEFINER (executam como owner, que
--     não está sujeito a RLS) para evitar recursão entre políticas.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_app') THEN
    CREATE ROLE prisma_app NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Funções de contexto
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE FUNCTION app_is_system() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.system', true), '') = 'on'
$$;

CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------
-- Organizações, usuários e permissões
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  global_context text NOT NULL DEFAULT '' CHECK (length(global_context) <= 20000),
  settings       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text NOT NULL CHECK (email = lower(email) AND position('@' in email) > 1),
  name                 text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  password_hash        text NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'reviewer', 'viewer')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations (id) ON DELETE SET NULL,
  token_hash      text NOT NULL UNIQUE,
  ip              text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE login_attempts (
  id         bigserial PRIMARY KEY,
  email_hash text NOT NULL,
  ip         text,
  success    boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_lookup_idx ON login_attempts (email_hash, created_at DESC);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, created_at DESC);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------

CREATE TABLE clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  slug            text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  segment         text NOT NULL DEFAULT '' CHECK (length(segment) <= 200),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  -- Alvo das chaves estrangeiras compostas: impede que um registro de um
  -- cliente aponte para um cliente de outra organização.
  UNIQUE (id, organization_id)
);
CREATE TRIGGER clients_touch BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE client_access (
  organization_id uuid NOT NULL,
  client_id       uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, user_id),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX client_access_user_idx ON client_access (user_id);

-- Funções de autorização (SECURITY DEFINER: leem memberships/client_access sem RLS).
CREATE FUNCTION app_org_role(org uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role
  FROM memberships m
  JOIN users u ON u.id = m.user_id AND u.is_active
  WHERE m.organization_id = org AND m.user_id = app_user_id()
$$;

CREATE FUNCTION app_is_org_member(org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_org_role(org) IS NOT NULL
$$;

CREATE FUNCTION app_is_org_admin(org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(app_org_role(org) IN ('owner', 'admin'), false)
$$;

CREATE FUNCTION app_can_access_client(org uuid, client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN app_org_role(org) IS NULL THEN false
    WHEN app_org_role(org) IN ('owner', 'admin') THEN true
    ELSE EXISTS (
      SELECT 1 FROM client_access ca
      WHERE ca.client_id = client AND ca.organization_id = org AND ca.user_id = app_user_id()
    )
  END
$$;

CREATE FUNCTION app_shares_org(other_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships mine
    JOIN memberships theirs ON theirs.organization_id = mine.organization_id
    WHERE mine.user_id = app_user_id() AND theirs.user_id = other_user
  )
$$;

-- ---------------------------------------------------------------------------
-- Perfil de marca e memória do cliente
-- ---------------------------------------------------------------------------

CREATE TABLE brand_profiles (
  client_id       uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  business        jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience        jsonb NOT NULL DEFAULT '{}'::jsonb,
  voice           jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual          jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels        jsonb NOT NULL DEFAULT '{}'::jsonb,
  references_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision        integer NOT NULL DEFAULT 1,
  updated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);

CREATE TABLE client_memories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id       uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('fact', 'preference', 'hypothesis', 'suggestion')),
  content         text NOT NULL CHECK (length(trim(content)) BETWEEN 3 AND 2000),
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'approval_feedback', 'ai')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX client_memories_client_idx ON client_memories (client_id, status);

-- ---------------------------------------------------------------------------
-- Biblioteca de mídia
-- ---------------------------------------------------------------------------

CREATE TABLE media_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id       uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('image', 'logo', 'document', 'video', 'other')),
  filename        text NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
  mime_type       text NOT NULL,
  size_bytes      bigint NOT NULL CHECK (size_bytes > 0),
  sha256          text NOT NULL,
  storage_key     text NOT NULL UNIQUE,
  width           integer,
  height          integer,
  alt_text        text NOT NULL DEFAULT '',
  tags            text[] NOT NULL DEFAULT '{}',
  origin          text NOT NULL DEFAULT 'upload' CHECK (origin IN ('upload', 'export')),
  license_note    text NOT NULL DEFAULT '',
  uploaded_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (id, client_id),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX media_assets_client_idx ON media_assets (client_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX media_assets_dedupe_idx ON media_assets (client_id, sha256) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Conteúdo, versões, qualidade, aprovações e comentários
-- ---------------------------------------------------------------------------

CREATE TABLE content_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  client_id           uuid NOT NULL,
  title               text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 200),
  channel             text NOT NULL CHECK (channel IN ('instagram', 'facebook', 'linkedin', 'tiktok', 'other')),
  format              text NOT NULL CHECK (format IN ('post', 'carousel', 'story')),
  objective           text NOT NULL CHECK (objective IN ('awareness', 'engagement', 'education', 'conversion', 'authority', 'relationship')),
  briefing            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft', 'generating', 'in_review', 'awaiting_approval', 'approved',
                        'scheduled', 'published', 'rejected', 'failed', 'archived')),
  current_version_id  uuid,
  approved_version_id uuid,
  last_error          text,
  request_id          uuid NOT NULL,
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, client_id),
  -- Idempotência do formulário de criação: reenvio não duplica o conteúdo.
  UNIQUE (organization_id, request_id),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX content_items_client_idx ON content_items (client_id, updated_at DESC);
CREATE INDEX content_items_org_status_idx ON content_items (organization_id, status);
CREATE TRIGGER content_items_touch BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE content_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  client_id         uuid NOT NULL,
  content_item_id   uuid NOT NULL,
  version_number    integer NOT NULL CHECK (version_number > 0),
  document          jsonb NOT NULL,
  document_hash     text NOT NULL,
  source            text NOT NULL CHECK (source IN ('ai', 'demo', 'manual')),
  ai_run_id         uuid,
  parent_version_id uuid REFERENCES content_versions (id),
  change_note       text NOT NULL DEFAULT '' CHECK (length(change_note) <= 500),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, version_number),
  UNIQUE (id, content_item_id),
  FOREIGN KEY (content_item_id, client_id) REFERENCES content_items (id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);

ALTER TABLE content_items
  ADD CONSTRAINT content_items_current_version_fk
    FOREIGN KEY (current_version_id, id) REFERENCES content_versions (id, content_item_id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT content_items_approved_version_fk
    FOREIGN KEY (approved_version_id, id) REFERENCES content_versions (id, content_item_id) DEFERRABLE INITIALLY DEFERRED;

-- Versões são imutáveis: qualquer alteração gera uma nova versão.
CREATE FUNCTION forbid_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('app.allow_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'content_versions são imutáveis (operação % recusada)', TG_OP
    USING ERRCODE = 'check_violation';
END
$$;
CREATE TRIGGER content_versions_immutable BEFORE UPDATE OR DELETE ON content_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_version_mutation();

CREATE TABLE quality_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  client_id          uuid NOT NULL,
  content_version_id uuid NOT NULL REFERENCES content_versions (id) ON DELETE CASCADE,
  checker_version    text NOT NULL,
  results            jsonb NOT NULL,
  critical_count     integer NOT NULL CHECK (critical_count >= 0),
  warning_count      integer NOT NULL CHECK (warning_count >= 0),
  passed             boolean NOT NULL,
  created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX quality_reports_version_idx ON quality_reports (content_version_id, created_at DESC);

CREATE TABLE approvals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  client_id          uuid NOT NULL,
  content_item_id    uuid NOT NULL,
  content_version_id uuid NOT NULL,
  document_hash      text NOT NULL,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'superseded', 'cancelled')),
  request_note       text NOT NULL DEFAULT '' CHECK (length(request_note) <= 1000),
  requested_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  decided_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  decided_at         timestamptz,
  decision_note      text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 2000),
  FOREIGN KEY (content_version_id, content_item_id) REFERENCES content_versions (id, content_item_id) ON DELETE CASCADE,
  FOREIGN KEY (content_item_id, client_id) REFERENCES content_items (id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE,
  CHECK ((status IN ('pending', 'superseded', 'cancelled')) OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
-- No máximo uma solicitação pendente por conteúdo.
CREATE UNIQUE INDEX approvals_one_pending_idx ON approvals (content_item_id) WHERE status = 'pending';
CREATE INDEX approvals_org_status_idx ON approvals (organization_id, status, requested_at DESC);

CREATE TABLE content_comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  client_id          uuid NOT NULL,
  content_item_id    uuid NOT NULL,
  content_version_id uuid,
  author_id          uuid REFERENCES users (id) ON DELETE SET NULL,
  body               text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (content_item_id, client_id) REFERENCES content_items (id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX content_comments_item_idx ON content_comments (content_item_id, created_at);

-- ---------------------------------------------------------------------------
-- IA: execuções, preços e limites
-- ---------------------------------------------------------------------------

CREATE TABLE provider_prices (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider                  text NOT NULL,
  model                     text NOT NULL,
  input_usd_per_mtok        numeric(12, 6) NOT NULL CHECK (input_usd_per_mtok >= 0),
  output_usd_per_mtok       numeric(12, 6) NOT NULL CHECK (output_usd_per_mtok >= 0),
  cache_read_usd_per_mtok   numeric(12, 6) CHECK (cache_read_usd_per_mtok >= 0),
  cache_write_usd_per_mtok  numeric(12, 6) CHECK (cache_write_usd_per_mtok >= 0),
  source                    text NOT NULL CHECK (length(trim(source)) >= 3),
  effective_from            timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_prices_lookup_idx ON provider_prices (organization_id, provider, model, effective_from DESC);

CREATE TABLE ai_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  client_id          uuid,
  content_item_id    uuid,
  job_id             uuid,
  skill_id           text NOT NULL,
  skill_version      text NOT NULL,
  provider           text NOT NULL,
  model              text NOT NULL,
  is_demo            boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'refused')),
  input_tokens       integer NOT NULL DEFAULT 0,
  output_tokens      integer NOT NULL DEFAULT 0,
  cache_read_tokens  integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cost_usd           numeric(14, 6),
  price_id           uuid REFERENCES provider_prices (id) ON DELETE SET NULL,
  duration_ms        integer,
  error_code         text,
  error_message      text,
  input_summary      jsonb NOT NULL DEFAULT '{}'::jsonb,
  output             jsonb,
  idempotency_key    text,
  created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX ai_runs_org_created_idx ON ai_runs (organization_id, created_at DESC);
CREATE INDEX ai_runs_client_created_idx ON ai_runs (client_id, created_at DESC);
CREATE UNIQUE INDEX ai_runs_idempotency_idx ON ai_runs (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE client_budgets (
  client_id           uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  monthly_limit_usd   numeric(12, 2) NOT NULL CHECK (monthly_limit_usd >= 0),
  alert_threshold_pct integer NOT NULL DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 1 AND 100),
  hard_stop           boolean NOT NULL DEFAULT true,
  updated_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Fila de tarefas assíncronas
-- ---------------------------------------------------------------------------

CREATE TABLE jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  client_id       uuid,
  type            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts    integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  run_after       timestamptz NOT NULL DEFAULT now(),
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  result          jsonb,
  idempotency_key text NOT NULL,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX jobs_claim_idx ON jobs (status, run_after) WHERE status = 'queued';
CREATE INDEX jobs_org_created_idx ON jobs (organization_id, created_at DESC);
CREATE TRIGGER jobs_touch BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE job_attempts (
  id              bigserial PRIMARY KEY,
  job_id          uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  attempt         integer NOT NULL,
  worker_id       text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'abandoned')),
  error           text,
  duration_ms     integer
);
CREATE INDEX job_attempts_job_idx ON job_attempts (job_id, attempt);

-- ---------------------------------------------------------------------------
-- Auditoria (somente inserção)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id              bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
  client_id       uuid,
  actor_user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  actor_type      text NOT NULL CHECK (actor_type IN ('user', 'system', 'worker')),
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip              text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE FUNCTION forbid_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('app.allow_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs é somente inserção (operação % recusada)', TG_OP
    USING ERRCODE = 'check_violation';
END
$$;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_memories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_prices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_budgets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;

-- Organizações
CREATE POLICY organizations_select ON organizations FOR SELECT
  USING (app_is_system() OR app_is_org_member(id));
CREATE POLICY organizations_update ON organizations FOR UPDATE
  USING (app_is_system() OR app_is_org_admin(id))
  WITH CHECK (app_is_system() OR app_is_org_admin(id));
CREATE POLICY organizations_insert ON organizations FOR INSERT
  WITH CHECK (app_is_system());

-- Usuários: leitura de quem compartilha organização; escrita apenas em
-- contexto de sistema (os serviços validam a permissão antes).
CREATE POLICY users_select ON users FOR SELECT
  USING (app_is_system() OR id = app_user_id() OR app_shares_org(id));
CREATE POLICY users_write ON users FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());

CREATE POLICY memberships_select ON memberships FOR SELECT
  USING (app_is_system() OR user_id = app_user_id() OR app_is_org_member(organization_id));
CREATE POLICY memberships_write ON memberships FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));

CREATE POLICY sessions_system ON sessions FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
CREATE POLICY login_attempts_system ON login_attempts FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());

-- Clientes
CREATE POLICY clients_select ON clients FOR SELECT
  USING (app_is_system() OR app_can_access_client(organization_id, id));
CREATE POLICY clients_insert ON clients FOR INSERT
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));
CREATE POLICY clients_update ON clients FOR UPDATE
  USING (app_is_system() OR app_can_access_client(organization_id, id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, id));
CREATE POLICY clients_delete ON clients FOR DELETE
  USING (app_is_system() OR app_is_org_admin(organization_id));

CREATE POLICY client_access_select ON client_access FOR SELECT
  USING (app_is_system() OR user_id = app_user_id() OR app_is_org_admin(organization_id));
CREATE POLICY client_access_write ON client_access FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));

-- Tabelas vinculadas a um cliente: acesso exige acesso ao cliente.
CREATE POLICY brand_profiles_client ON brand_profiles FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY client_memories_client ON client_memories FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY media_assets_client ON media_assets FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY content_items_client ON content_items FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY content_versions_client ON content_versions FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY quality_reports_client ON quality_reports FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY approvals_client ON approvals FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY content_comments_client ON content_comments FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY client_budgets_select ON client_budgets FOR SELECT
  USING (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY client_budgets_write ON client_budgets FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));

-- Preços: leitura para membros, escrita para administradores.
CREATE POLICY provider_prices_select ON provider_prices FOR SELECT
  USING (app_is_system() OR app_is_org_member(organization_id));
CREATE POLICY provider_prices_write ON provider_prices FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));

-- Execuções de IA, tarefas e auditoria: sem cliente => administradores;
-- com cliente => quem tem acesso ao cliente.
CREATE POLICY ai_runs_access ON ai_runs FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id)
         OR (client_id IS NOT NULL AND app_can_access_client(organization_id, client_id)))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id)
         OR (client_id IS NOT NULL AND app_can_access_client(organization_id, client_id)));
CREATE POLICY jobs_access ON jobs FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id)
         OR (client_id IS NOT NULL AND app_can_access_client(organization_id, client_id)))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id)
         OR (client_id IS NOT NULL AND app_can_access_client(organization_id, client_id)));
CREATE POLICY job_attempts_access ON job_attempts FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system());
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (app_is_system()
         OR (organization_id IS NOT NULL AND app_is_org_admin(organization_id))
         OR (client_id IS NOT NULL AND organization_id IS NOT NULL AND app_can_access_client(organization_id, client_id)));
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (app_is_system() OR (organization_id IS NOT NULL AND app_is_org_member(organization_id)));

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO prisma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prisma_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO prisma_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO prisma_app;
