/**
 * Operação da plataforma: vincula uma conta EXISTENTE a uma organização.
 * Administradores de agência não fazem isso pela interface para evitar vincular
 * pessoas sem consentimento. Confirme com a pessoa antes de executar.
 * Uso: npm run member:add -- --org <slug-da-organização> --email pessoa@dominio.com --role editor
 */
import { loadDotEnv } from "./load-env";

loadDotEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const orgSlug = arg("org");
const email = arg("email")?.trim().toLowerCase();
const role = arg("role") ?? "viewer";
if (!orgSlug || !email || !["owner", "admin", "editor", "reviewer", "viewer"].includes(role)) {
  console.error("Uso: npm run member:add -- --org <slug> --email <email> --role owner|admin|editor|reviewer|viewer");
  process.exit(1);
}

const { withTx, systemCtx, maybeOne } = await import("../src/server/db");
const { audit } = await import("../src/server/services/audit");
const { closePool } = await import("../src/server/db/pool");
try {
  await withTx(systemCtx("operator.add_member"), async (tx) => {
    const org = await maybeOne<{ id: string }>(tx, "SELECT id FROM organizations WHERE slug = $1", [orgSlug]);
    if (!org) throw new Error("Organização não encontrada.");
    const user = await maybeOne<{ id: string }>(tx, "SELECT id FROM users WHERE email = $1", [email]);
    if (!user) throw new Error("Conta não encontrada. Para pessoas novas, use Usuários e permissões na interface.");
    await tx.query(
      `INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, deactivated_at = NULL`,
      [org.id, user.id, role],
    );
    await audit(tx, { type: "system" }, { organizationId: org.id, action: "user.linked_by_operator", entityType: "user", entityId: user.id, metadata: { email, role } });
  });
  console.log(`Conta ${email} vinculada à organização ${orgSlug} como ${role}.`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await closePool();
}
