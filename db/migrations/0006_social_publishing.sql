-- Redes sociais e entregas: chaves dos apps (criptografadas), contas dos
-- clientes conectadas por login oficial, publicações agendadas, aprovação pelo
-- cliente por link, agenda (ICS) e webhooks.
--
-- Segredos (chaves de apps, tokens, senha do e-mail) chegam aqui já
-- criptografados pela aplicação com a chave mestra APP_SECRET_KEY, que não
-- fica no banco.

-- Apps da agência em cada plataforma (Meta, TikTok, Google) e o e-mail (SMTP).
CREATE TABLE integration_apps (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('meta', 'tiktok', 'google', 'smtp')),
  public_id       text NOT NULL DEFAULT '' CHECK (length(public_id) <= 300),
  secret_sealed   text,
  secret_hint     text CHECK (length(secret_hint) <= 20),
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider)
);
CREATE TRIGGER integration_apps_touch BEFORE UPDATE ON integration_apps FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Conta de um cliente numa rede, autorizada pelo login oficial da plataforma.
CREATE TABLE social_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  client_id          uuid NOT NULL,
  network            text NOT NULL CHECK (network IN ('instagram', 'facebook', 'tiktok', 'youtube')),
  external_id        text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200),
  username           text CHECK (length(username) <= 200),
  display_name       text NOT NULL DEFAULT '' CHECK (length(display_name) <= 300),
  avatar_url         text CHECK (length(avatar_url) <= 2000),
  profile_url        text CHECK (length(profile_url) <= 2000),
  access_sealed      text NOT NULL,
  refresh_sealed     text,
  token_expires_at   timestamptz,
  refresh_expires_at timestamptz,
  scopes             text[] NOT NULL DEFAULT '{}',
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reconnect')),
  last_error         text CHECK (length(last_error) <= 1000),
  connected_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, network),
  UNIQUE (id, client_id),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE TRIGGER social_accounts_touch BEFORE UPDATE ON social_accounts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Login em andamento numa plataforma (vale 15 minutos, uso único).
CREATE TABLE oauth_states (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash      text NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  client_id       uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('meta', 'tiktok', 'google')),
  verifier_sealed text,
  -- Páginas encontradas no login da Meta, à espera da escolha (criptografado).
  pending_sealed  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);

-- Publicação de uma peça aprovada (ou de um vídeo da biblioteca) numa conta.
CREATE TABLE publications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  client_id          uuid NOT NULL,
  content_item_id    uuid REFERENCES content_items (id) ON DELETE CASCADE,
  content_version_id uuid REFERENCES content_versions (id) ON DELETE CASCADE,
  media_asset_id     uuid REFERENCES media_assets (id) ON DELETE CASCADE,
  social_account_id  uuid REFERENCES social_accounts (id) ON DELETE SET NULL,
  network            text NOT NULL CHECK (network IN ('instagram', 'facebook', 'tiktok', 'youtube')),
  account_label      text NOT NULL DEFAULT '' CHECK (length(account_label) <= 300),
  kind               text NOT NULL CHECK (kind IN ('image', 'carousel', 'story', 'video')),
  title              text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
  caption            text NOT NULL DEFAULT '' CHECK (length(caption) <= 5000),
  options            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at       timestamptz NOT NULL,
  published_at       timestamptz,
  external_id        text CHECK (length(external_id) <= 300),
  external_url       text CHECK (length(external_url) <= 2000),
  provider_state     jsonb NOT NULL DEFAULT '{}'::jsonb,
  error              text CHECK (length(error) <= 2000),
  metrics            jsonb,
  metrics_at         timestamptz,
  requested_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (content_version_id IS NOT NULL OR media_asset_id IS NOT NULL),
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX publications_org_idx ON publications (organization_id, status, scheduled_at);
CREATE INDEX publications_content_idx ON publications (content_item_id) WHERE content_item_id IS NOT NULL;
CREATE TRIGGER publications_touch BEFORE UPDATE ON publications FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Aprovação pelo cliente, sem login, por um link com prazo.
CREATE TABLE approval_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id       uuid NOT NULL,
  content_item_id uuid NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  approval_id     uuid NOT NULL REFERENCES approvals (id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  opened_at       timestamptz,
  revoked_at      timestamptz,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX approval_links_approval_idx ON approval_links (approval_id);

-- Decisão tomada pelo cliente pelo link: sem usuário do sistema, com o nome informado.
ALTER TABLE approvals ADD COLUMN decided_via text NOT NULL DEFAULT 'team' CHECK (decided_via IN ('team', 'client_link'));
ALTER TABLE approvals ADD COLUMN decided_by_name text CHECK (length(decided_by_name) <= 120);
ALTER TABLE approvals DROP CONSTRAINT approvals_check;
ALTER TABLE approvals ADD CONSTRAINT approvals_check CHECK (
  status IN ('pending', 'superseded', 'cancelled')
  OR (decided_at IS NOT NULL AND (decided_via = 'team' OR decided_by_name IS NOT NULL))
);

-- Link privado da agenda (ICS) de cada pessoa: guarda só o hash do token.
CREATE TABLE calendar_feeds (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  PRIMARY KEY (organization_id, user_id)
);

-- Avisos automáticos para outros sistemas (n8n, Zapier, Make).
CREATE TABLE webhooks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  url             text NOT NULL CHECK (url ~ '^https://' AND length(url) <= 2000),
  secret_sealed   text NOT NULL,
  events          text[] NOT NULL CHECK (cardinality(events) > 0),
  active          boolean NOT NULL DEFAULT true,
  last_status     integer,
  last_error      text CHECK (length(last_error) <= 1000),
  last_at         timestamptz,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER webhooks_touch BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE integration_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states     ENABLE ROW LEVEL SECURITY;
ALTER TABLE publications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_feeds   ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks         ENABLE ROW LEVEL SECURITY;

-- Chaves dos apps e webhooks: só a administração (o servidor lê em contexto de sistema).
CREATE POLICY integration_apps_admin ON integration_apps FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));
CREATE POLICY webhooks_admin ON webhooks FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));

CREATE POLICY social_accounts_client ON social_accounts FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY publications_client ON publications FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY approval_links_client ON approval_links FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));

-- Login em andamento e agenda: só a própria pessoa.
CREATE POLICY oauth_states_own ON oauth_states FOR ALL
  USING (app_is_system() OR (user_id = app_user_id() AND app_can_access_client(organization_id, client_id)))
  WITH CHECK (app_is_system() OR (user_id = app_user_id() AND app_can_access_client(organization_id, client_id)));
CREATE POLICY calendar_feeds_own ON calendar_feeds FOR ALL
  USING (app_is_system() OR (user_id = app_user_id() AND app_is_org_member(organization_id)))
  WITH CHECK (app_is_system() OR (user_id = app_user_id() AND app_is_org_member(organization_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON integration_apps, social_accounts, oauth_states, publications, approval_links, calendar_feeds, webhooks TO prisma_app;
