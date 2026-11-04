-- Link de aprovação do mês (todas as peças pendentes de um cliente), relatório
-- mensal compartilhável, responsável e prazo das peças e avisos dentro do app.

-- Link de aprovação: 'single' (um pedido) ou 'client' (tudo o que estiver
-- aguardando aprovação do cliente enquanto o link valer).
ALTER TABLE approval_links ADD COLUMN scope text NOT NULL DEFAULT 'single' CHECK (scope IN ('single', 'client'));
ALTER TABLE approval_links ALTER COLUMN approval_id DROP NOT NULL;
ALTER TABLE approval_links ALTER COLUMN content_item_id DROP NOT NULL;
ALTER TABLE approval_links ADD CONSTRAINT approval_links_target_check CHECK (scope = 'client' OR (approval_id IS NOT NULL AND content_item_id IS NOT NULL));

-- Relatório mensal enviado ao cliente por link (só leitura).
CREATE TABLE report_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id       uuid NOT NULL,
  month           date NOT NULL CHECK (extract(day FROM month) = 1),
  token_hash      text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  opened_at       timestamptz,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);

-- Responsável e prazo de cada peça.
ALTER TABLE content_items ADD COLUMN assignee_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE content_items ADD COLUMN due_date date;
CREATE INDEX content_items_assignee_idx ON content_items (assignee_id) WHERE assignee_id IS NOT NULL;

-- Avisos dentro do app (sino), por pessoa.
CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (length(kind) <= 60),
  title           text NOT NULL CHECK (length(title) <= 300),
  body            text NOT NULL DEFAULT '' CHECK (length(body) <= 1000),
  href            text CHECK (href ~ '^/' AND length(href) <= 500),
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

ALTER TABLE report_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_links_client ON report_links FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY notifications_own ON notifications FOR ALL
  USING (app_is_system() OR (user_id = app_user_id() AND app_is_org_member(organization_id)))
  WITH CHECK (app_is_system());

GRANT SELECT, INSERT, UPDATE, DELETE ON report_links, notifications TO prisma_app;
