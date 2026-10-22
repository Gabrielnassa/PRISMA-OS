import crypto from "node:crypto";
import { env } from "../env";
import { maybeOne, one, systemCtx, withTx } from "../db";
import { isRole } from "../authz/permissions";
import { RateLimitError, UnauthenticatedError, ValidationError } from "../errors";
import { audit } from "../services/audit";
import { getDummyHash, verifyPassword } from "./password";
import type { AuthContext } from "./types";

export const SESSION_COOKIE = "prisma_session";
const FAILED_LOGIN_LIMIT = 5;
const IP_LOGIN_LIMIT = 30;
const LOGIN_WINDOW_MINUTES = 15;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  userId: string;
}

/**
 * Autentica com e-mail e senha, aplica limite de tentativas e cria a sessão.
 * Mensagens de erro não revelam se o e-mail existe.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) throw new ValidationError("Informe e-mail e senha.");
  const emailHash = hashEmail(email);

  return withTx(systemCtx("auth.login"), async (tx) => {
    const limits = await one<{ by_email: number; by_ip: number }>(
      tx,
      `SELECT
         count(*) FILTER (WHERE email_hash = $1 AND NOT success)::int AS by_email,
         count(*) FILTER (WHERE $2::text IS NOT NULL AND ip = $2 AND NOT success)::int AS by_ip
       FROM login_attempts
       WHERE created_at > now() - make_interval(mins => $3)`,
      [emailHash, input.ip ?? null, LOGIN_WINDOW_MINUTES],
    );
    if (limits.by_email >= FAILED_LOGIN_LIMIT || limits.by_ip >= IP_LOGIN_LIMIT) {
      throw new RateLimitError();
    }

    const user = await maybeOne<{ id: string; password_hash: string; is_active: boolean }>(
      tx,
      "SELECT id, password_hash, is_active FROM users WHERE email = $1",
      [email],
    );
    const ok = await verifyPassword(input.password, user?.password_hash ?? (await getDummyHash()));
    const success = Boolean(user && user.is_active && ok);
    await tx.query("INSERT INTO login_attempts (email_hash, ip, success) VALUES ($1, $2, $3)", [emailHash, input.ip ?? null, success]);
    if (!success || !user) {
      // A tentativa falha precisa persistir mesmo com o erro: o commit acontece porque não lançamos dentro da transação.
      return null;
    }

    const membership = await maybeOne<{ organization_id: string }>(
      tx,
      `SELECT organization_id FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
      [user.id],
    );
    if (!membership) return null;

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600 * 1000);
    const session = await one<{ id: string }>(
      tx,
      `INSERT INTO sessions (user_id, organization_id, token_hash, ip, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [user.id, membership.organization_id, hashToken(token), input.ip ?? null, (input.userAgent ?? "").slice(0, 400), expiresAt],
    );
    await tx.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    await audit(tx, { type: "system", userId: user.id }, {
      organizationId: membership.organization_id,
      action: "auth.login",
      entityType: "session",
      entityId: session.id,
      ip: input.ip ?? null,
    });
    return { token, expiresAt, userId: user.id };
  }).then((res) => {
    if (!res) throw new UnauthenticatedError("E-mail ou senha inválidos.");
    return res;
  });
}

/** Resolve a sessão a partir do token do cookie. Retorna null se inválida/expirada. */
export async function resolveSession(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  return withTx(systemCtx("auth.resolve_session"), async (tx) => {
    const row = await maybeOne<{
      session_id: string;
      last_seen_at: Date;
      user_id: string;
      user_name: string;
      email: string;
      must_change_password: boolean;
      organization_id: string;
      organization_name: string;
      role: string;
    }>(
      tx,
      `SELECT s.id AS session_id, s.last_seen_at, u.id AS user_id, u.name AS user_name, u.email,
              u.must_change_password, o.id AS organization_id, o.name AS organization_name, m.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.is_active
       JOIN organizations o ON o.id = s.organization_id
       JOIN memberships m ON m.organization_id = s.organization_id AND m.user_id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [hashToken(token)],
    );
    if (!row || !isRole(row.role)) return null;
    if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_INTERVAL_MS) {
      await tx.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.session_id]);
    }
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      userName: row.user_name,
      email: row.email,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      role: row.role,
      mustChangePassword: row.must_change_password,
    };
  });
}

export async function revokeSession(token: string): Promise<void> {
  await withTx(systemCtx("auth.logout"), async (tx) => {
    await tx.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [hashToken(token)]);
  });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await withTx(systemCtx("auth.revoke_all"), async (tx) => {
    await tx.query(
      "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2)",
      [userId, exceptSessionId ?? null],
    );
  });
}
