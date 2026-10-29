import crypto from "node:crypto";
import { env } from "../env";
import { IntegrationNotConfiguredError } from "../errors";

/**
 * Cofre das credenciais guardadas no banco (chaves de apps das redes sociais,
 * tokens das contas dos clientes, senha do e-mail). AES-256-GCM com a chave
 * mestra APP_SECRET_KEY, que fica só na configuração do servidor: um backup
 * do banco sozinho não revela nenhum segredo.
 *
 * Cada valor é selado com um "contexto" (ex.: "app:<org>:meta") que entra
 * como dado autenticado: um valor copiado para outra linha não abre.
 */

const VERSION = "v1";

export const MIN_SECRET_KEY_LENGTH = 32;

function masterKey(): string | null {
  const key = env().APP_SECRET_KEY;
  return key && key.length >= MIN_SECRET_KEY_LENGTH ? key : null;
}

export function secretsConfigured(): boolean {
  return masterKey() !== null;
}

function derive(purpose: "seal" | "sign"): Buffer {
  const master = masterKey();
  if (!master) {
    throw new IntegrationNotConfiguredError(
      "Falta a chave de criptografia do servidor (APP_SECRET_KEY, com pelo menos 32 caracteres). Sem ela não é possível guardar chaves e conexões com segurança. Veja Integrações.",
    );
  }
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(master, "utf8"), Buffer.from("prisma-os"), Buffer.from(`prisma-os:${purpose}`), 32));
}

export function seal(plain: string, context: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derive("seal"), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function open(sealed: string, context: string): string {
  const [version, payload] = sealed.split(":");
  if (version !== VERSION || !payload) throw new Error("Formato de segredo desconhecido");
  const raw = Buffer.from(payload, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", derive("seal"), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** Assinatura curta (HMAC) para links temporários, como as imagens que a Meta baixa. */
export function sign(data: string): string {
  return crypto.createHmac("sha256", derive("sign")).update(data).digest("base64url");
}

export function verifySignature(data: string, signature: string): boolean {
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Token aleatório para links (aprovação pelo cliente, agenda). Guarde só o hash. */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Últimos caracteres de uma chave, para mostrar qual está salva sem revelá-la. */
export function hint(secret: string): string {
  return secret.length <= 8 ? "••••" : `••••${secret.slice(-4)}`;
}
