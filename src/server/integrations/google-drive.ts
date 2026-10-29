import crypto from "node:crypto";
import { env } from "../env";
import { IntegrationError, IntegrationNotConfiguredError, ValidationError } from "../errors";

/**
 * Leitura de pastas do Google Drive pela API oficial (Drive v3), com uma conta
 * de serviço do Google Cloud. A agência compartilha a pasta de cada cliente
 * com o e-mail da conta de serviço (como Leitor); o sistema só lê.
 *
 * Configuração (variável de ambiente, nunca no código):
 * - GOOGLE_SERVICE_ACCOUNT_JSON: a chave JSON da conta de serviço, inteira ou
 *   em base64.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
}

const DRIVE = "https://www.googleapis.com/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function readServiceAccount(): ServiceAccount | { problem: string } {
  const raw = env().GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { problem: "Defina GOOGLE_SERVICE_ACCOUNT_JSON (chave JSON da conta de serviço do Google) no ambiente do servidor." };
  let text = raw.trim();
  if (!text.startsWith("{")) {
    try {
      text = Buffer.from(text, "base64").toString("utf8");
    } catch {
      // segue para a validação abaixo
    }
  }
  try {
    const j = JSON.parse(text) as Partial<ServiceAccount>;
    if (!j.client_email || !j.private_key) throw new Error("incompleta");
    return { client_email: j.client_email, private_key: j.private_key, token_uri: j.token_uri || "https://oauth2.googleapis.com/token" };
  } catch {
    return { problem: "GOOGLE_SERVICE_ACCOUNT_JSON não é uma chave JSON de conta de serviço válida (precisa de client_email e private_key)." };
  }
}

export function driveStatus(): { configured: boolean; detail: string; serviceEmail: string | null } {
  const sa = readServiceAccount();
  if ("problem" in sa) return { configured: false, detail: sa.problem, serviceEmail: null };
  return { configured: true, detail: `Compartilhe a pasta de cada cliente com ${sa.client_email} (como Leitor).`, serviceEmail: sa.client_email };
}

/** Aceita o link da pasta (drive.google.com/drive/folders/ID, ...?id=ID) ou só o ID. */
export function parseFolderId(input: string): string {
  const t = input.trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,200})/.exec(t) ?? /[?&]id=([A-Za-z0-9_-]{10,200})/.exec(t);
  const id = m ? m[1]! : t;
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new ValidationError("Cole o link da pasta do Google Drive (drive.google.com/drive/folders/...).", { folder: "Link inválido." });
  return id;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let cached: { token: string; exp: number; email: string } | null = null;

/** Troca uma declaração JWT assinada pela conta de serviço por um token de acesso (fluxo oficial do Google). */
async function accessToken(fetchImpl: typeof fetch): Promise<string> {
  const sa = readServiceAccount();
  if ("problem" in sa) throw new IntegrationNotConfiguredError(sa.problem);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat: now, exp: now + 3600 }));
  let signature: string;
  try {
    signature = b64url(crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), sa.private_key));
  } catch (err) {
    throw new IntegrationError("A chave privada da conta de serviço do Google é inválida.", false, { cause: err, providerCode: "google_key" });
  }
  let res: Response;
  try {
    res = await fetchImpl(sa.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new IntegrationError("Não foi possível falar com o Google (rede ou tempo esgotado).", true, { cause: err, providerCode: "google_network" });
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    throw new IntegrationError(`O Google recusou a conta de serviço (${body.error ?? `HTTP ${res.status}`}). Confira a chave e se a API do Drive está ativada no projeto.`, false, { providerCode: "google_auth" });
  }
  cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600), email: sa.client_email };
  return body.access_token;
}

/** Só para testes. */
export function resetDriveTokenCache(): void {
  cached = null;
}

async function driveGet(path: string, fetchImpl: typeof fetch): Promise<Response> {
  const token = await accessToken(fetchImpl);
  let res: Response;
  try {
    res = await fetchImpl(`${DRIVE}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new IntegrationError("Não foi possível falar com o Google Drive (rede ou tempo esgotado).", true, { cause: err, providerCode: "google_network" });
  }
  if (res.status === 404 || res.status === 403) {
    const email = driveStatus().serviceEmail;
    throw new IntegrationError(`Pasta ou arquivo não encontrado. Compartilhe a pasta com ${email ?? "a conta de serviço"} (como Leitor).`, false, { providerCode: "google_not_shared" });
  }
  if (res.status === 429 || res.status >= 500) throw new IntegrationError("O Google Drive está ocupado no momento. Tente de novo em alguns minutos.", true, { providerCode: "google_busy" });
  if (!res.ok) throw new IntegrationError(`O Google Drive recusou a consulta (HTTP ${res.status}).`, false, { providerCode: "google_error" });
  return res;
}

export async function folderInfo(folderId: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<{ id: string; name: string }> {
  const res = await driveGet(`/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`, opts.fetchImpl ?? fetch);
  const j = (await res.json()) as { id: string; name: string; mimeType: string };
  if (j.mimeType !== "application/vnd.google-apps.folder") throw new ValidationError("O link é de um arquivo, não de uma pasta do Drive.", { folder: "Não é uma pasta." });
  return { id: j.id, name: j.name };
}

/** Arquivos diretos da pasta (sem subpastas), até `max`. */
export async function listFolder(folderId: string, opts: { fetchImpl?: typeof fetch; max?: number } = {}): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  const max = opts.max ?? 1000;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
    const res = await driveGet(
      `/files?q=${q}&fields=${encodeURIComponent("nextPageToken,files(id,name,mimeType,size)")}&pageSize=200&orderBy=createdTime&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      opts.fetchImpl ?? fetch,
    );
    const j = (await res.json()) as { nextPageToken?: string; files?: Array<{ id: string; name: string; mimeType: string; size?: string }> };
    for (const f of j.files ?? []) out.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : null });
    pageToken = j.nextPageToken ?? "";
  } while (pageToken && out.length < max);
  return out.slice(0, max);
}

export async function downloadFile(fileId: string, opts: { fetchImpl?: typeof fetch; maxBytes: number }): Promise<Buffer | null> {
  const res = await driveGet(`/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, opts.fetchImpl ?? fetch);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > opts.maxBytes) return null;
  const data = Buffer.from(await res.arrayBuffer());
  return data.length > opts.maxBytes ? null : data;
}
