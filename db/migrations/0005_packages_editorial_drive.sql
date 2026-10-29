-- Pacote mensal por cliente, linha editorial com aprovação e pasta do Google
-- Drive de cada cliente.

-- Pacote contratado: quantidade de peças por mês e por formato.
CREATE TABLE client_packages (
  client_id       uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  posts           integer NOT NULL DEFAULT 0 CHECK (posts BETWEEN 0 AND 200),
  carousels       integer NOT NULL DEFAULT 0 CHECK (carousels BETWEEN 0 AND 200),
  stories         integer NOT NULL DEFAULT 0 CHECK (stories BETWEEN 0 AND 200),
  videos          integer NOT NULL DEFAULT 0 CHECK (videos BETWEEN 0 AND 200),
  notes           text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  updated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);

-- Linha editorial do mês: proposta (IA ou manual), editada e aprovada pela equipe.
CREATE TABLE editorial_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id       uuid NOT NULL,
  month           date NOT NULL CHECK (extract(day FROM month) = 1),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  ai_run_id       uuid,
  approved_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_at     timestamptz,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, month),
  UNIQUE (id, client_id),
  CHECK ((status = 'draft') OR (approved_at IS NOT NULL)),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE TRIGGER editorial_plans_touch BEFORE UPDATE ON editorial_plans FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE editorial_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id       uuid NOT NULL,
  plan_id         uuid NOT NULL,
  position        integer NOT NULL CHECK (position >= 0),
  planned_date    date,
  format          text NOT NULL CHECK (format IN ('post', 'carousel', 'story', 'video')),
  objective       text NOT NULL CHECK (objective IN ('awareness', 'engagement', 'education', 'conversion', 'authority', 'relationship')),
  title           text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 200),
  brief           text NOT NULL DEFAULT '' CHECK (length(brief) <= 4000),
  cta             text NOT NULL DEFAULT '' CHECK (length(cta) <= 300),
  -- planned: na pauta; in_production: peça criada; done: feito (vídeos são marcados à mão); skipped: fora do mês.
  status          text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_production', 'done', 'skipped')),
  content_item_id uuid REFERENCES content_items (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_id, client_id) REFERENCES editorial_plans (id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX editorial_items_plan_idx ON editorial_items (plan_id, position);
CREATE TRIGGER editorial_items_touch BEFORE UPDATE ON editorial_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Pasta do Google Drive de onde vêm as fotos e os vídeos do cliente.
CREATE TABLE client_drive_folders (
  client_id         uuid PRIMARY KEY,
  organization_id   uuid NOT NULL,
  folder_id         text NOT NULL CHECK (folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  folder_name       text,
  last_import_at    timestamptz,
  last_import       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
-- Arquivo do Drive já importado (não importa de novo nem se o nome mudar).
ALTER TABLE media_assets ADD COLUMN drive_file_id text;
CREATE INDEX media_assets_drive_idx ON media_assets (client_id, drive_file_id) WHERE drive_file_id IS NOT NULL;

ALTER TABLE client_packages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_drive_folders ENABLE ROW LEVEL SECURITY;

-- Pacote: leitura por quem acessa o cliente; escrita pela administração (comercial).
CREATE POLICY client_packages_select ON client_packages FOR SELECT
  USING (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY client_packages_write ON client_packages FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));

CREATE POLICY editorial_plans_client ON editorial_plans FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY editorial_items_client ON editorial_items FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));
CREATE POLICY client_drive_folders_client ON client_drive_folders FOR ALL
  USING (app_is_system() OR app_can_access_client(organization_id, client_id))
  WITH CHECK (app_is_system() OR app_can_access_client(organization_id, client_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON client_packages, editorial_plans, editorial_items, client_drive_folders TO prisma_app;
