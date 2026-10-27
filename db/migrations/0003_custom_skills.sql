-- Skills personalizadas: instruções escritas pela agência (ou importadas de um
-- SKILL.md) que rodam pelo mesmo orquestrador das skills do sistema, com o
-- contexto do cliente, limites, custos e auditoria. Cada alteração gera uma
-- versão imutável; as execuções ficam em ai_runs (skill_id = 'custom:<id>').

CREATE TABLE custom_skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  -- Nulo: vale para todos os clientes. Preenchido: só para esse cliente.
  client_id       uuid,
  name            text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  description     text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  instructions    text NOT NULL CHECK (length(trim(instructions)) BETWEEN 10 AND 20000),
  effort          text NOT NULL DEFAULT 'medium' CHECK (effort IN ('low', 'medium', 'high')),
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'skill_md')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX custom_skills_name_idx ON custom_skills (organization_id, lower(name));
CREATE TRIGGER custom_skills_touch BEFORE UPDATE ON custom_skills FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE custom_skill_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  skill_id        uuid NOT NULL,
  version         integer NOT NULL CHECK (version >= 1),
  name            text NOT NULL,
  description     text NOT NULL,
  instructions    text NOT NULL,
  effort          text NOT NULL,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version),
  FOREIGN KEY (skill_id, organization_id) REFERENCES custom_skills (id, organization_id) ON DELETE CASCADE
);

ALTER TABLE custom_skills         ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_skill_versions ENABLE ROW LEVEL SECURITY;

-- Leitura: membros da organização; skill de um cliente só para quem acessa o cliente.
CREATE POLICY custom_skills_select ON custom_skills FOR SELECT
  USING (app_is_system() OR (app_is_org_member(organization_id)
         AND (client_id IS NULL OR app_can_access_client(organization_id, client_id))));
-- Escrita: administradores (o serviço também exige a permissão skills.manage).
CREATE POLICY custom_skills_write ON custom_skills FOR ALL
  USING (app_is_system() OR app_is_org_admin(organization_id))
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));

CREATE POLICY custom_skill_versions_select ON custom_skill_versions FOR SELECT
  USING (app_is_system() OR EXISTS (SELECT 1 FROM custom_skills s WHERE s.id = skill_id));
-- Versões são imutáveis: só inserção (nada de UPDATE/DELETE pela aplicação).
CREATE POLICY custom_skill_versions_insert ON custom_skill_versions FOR INSERT
  WITH CHECK (app_is_system() OR app_is_org_admin(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON custom_skills TO prisma_app;
GRANT SELECT, INSERT ON custom_skill_versions TO prisma_app;
