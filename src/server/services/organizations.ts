import { z } from "zod";
import { maybeOne, one, systemCtx, userCtx, withTx } from "../db";
import { slugify } from "@/lib/slug";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ConflictError, ValidationError } from "../errors";
import { hashPassword, validatePasswordStrength } from "../auth/password";
import { DEFAULT_PRICES } from "../ai/pricing-defaults";
import { audit, userActor } from "./audit";

export const OrgSettingsSchema = z.object({
  requireDistinctApprover: z.boolean().default(false),
});
export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

export interface Organization {
  id: string;
  name: string;
  slug: string;
  globalContext: string;
  settings: OrgSettings;
}

export async function createOrganizationWithOwner(input: {
  organizationName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
}): Promise<{ organizationId: string; userId: string }> {
  const email = input.ownerEmail.trim().toLowerCase();
  const pwError = validatePasswordStrength(input.password);
  if (pwError) throw new ValidationError(pwError);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError("E-mail inválido.");
  const passwordHash = await hashPassword(input.password);

  return withTx(systemCtx("setup.create_organization"), async (tx) => {
    const existing = await maybeOne<{ id: string }>(tx, "SELECT id FROM users WHERE email = $1", [email]);
    if (existing) throw new ConflictError("Já existe um usuário com este e-mail.");
    let slug = slugify(input.organizationName);
    const taken = await maybeOne(tx, "SELECT 1 FROM organizations WHERE slug = $1", [slug]);
    if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const org = await one<{ id: string }>(
      tx,
      "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
      [input.organizationName.trim(), slug],
    );
    const user = await one<{ id: string }>(
      tx,
      "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id",
      [email, input.ownerName.trim(), passwordHash],
    );
    await tx.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')", [org.id, user.id]);
    for (const p of DEFAULT_PRICES) {
      await tx.query(
        `INSERT INTO provider_prices (organization_id, provider, model, input_usd_per_mtok, output_usd_per_mtok,
           cache_read_usd_per_mtok, cache_write_usd_per_mtok, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [org.id, p.provider, p.model, p.inputUsdPerMtok, p.outputUsdPerMtok, p.cacheReadUsdPerMtok, p.cacheWriteUsdPerMtok, p.source],
      );
    }
    await audit(tx, { type: "system", userId: user.id }, {
      organizationId: org.id,
      action: "organization.created",
      entityType: "organization",
      entityId: org.id,
      metadata: { ownerEmail: email },
    });
    return { organizationId: org.id, userId: user.id };
  });
}

export async function getOrganization(auth: AuthContext): Promise<Organization> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const row = await one<{ id: string; name: string; slug: string; global_context: string; settings: unknown }>(
      tx,
      "SELECT id, name, slug, global_context, settings FROM organizations WHERE id = $1",
      [auth.organizationId],
    );
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      globalContext: row.global_context,
      settings: OrgSettingsSchema.parse(row.settings ?? {}),
    };
  });
}

export const UpdateOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da organização.").max(120),
  globalContext: z.string().max(20000, "O contexto global deve ter no máximo 20.000 caracteres."),
  requireDistinctApprover: z.boolean(),
});

export async function updateOrganization(auth: AuthContext, input: z.infer<typeof UpdateOrganizationSchema>): Promise<void> {
  assertCan(auth.role, "org.manage");
  const data = UpdateOrganizationSchema.parse(input);
  await withTx(userCtx(auth.userId), async (tx) => {
    await tx.query(
      `UPDATE organizations SET name = $2, global_context = $3,
         settings = settings || jsonb_build_object('requireDistinctApprover', $4::boolean)
       WHERE id = $1`,
      [auth.organizationId, data.name, data.globalContext, data.requireDistinctApprover],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      action: "organization.updated",
      entityType: "organization",
      entityId: auth.organizationId,
      metadata: { name: data.name, globalContextLength: data.globalContext.length, requireDistinctApprover: data.requireDistinctApprover },
    });
  });
}
