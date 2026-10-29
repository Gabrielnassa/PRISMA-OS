import { maybeOne, userCtx, withTx } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { AppError, IntegrationError, ValidationError } from "../errors";
import { env } from "../env";
import { downloadFile, driveStatus, folderInfo, listFolder, parseFolderId } from "../integrations/google-drive";
import { audit, userActor } from "./audit";
import { requireClient } from "./clients";
import { uploadMedia } from "./media";

/**
 * Pasta do Google Drive de cada cliente: as fotos e os vídeos que a equipe
 * coloca lá entram na biblioteca do cliente pelo botão "Importar agora".
 * Cada arquivo do Drive entra uma vez só (pelo id do Drive e pelo conteúdo).
 */

export interface DriveLink {
  folderId: string;
  folderName: string | null;
  lastImportAt: string | null;
  lastImport: { imported?: number; skipped?: number; already?: number; failed?: string[]; remaining?: number } | null;
}

/** Tipos que a biblioteca aceita (Google Docs, planilhas e afins ficam de fora). */
const IMPORTABLE = /^(image\/(png|jpeg|gif|svg\+xml)|video\/(mp4|quicktime)|application\/pdf)$/;
/** Arquivos por clique: a importação roda dentro da requisição; o restante vai no próximo clique. */
export const IMPORT_BATCH = 25;

export async function getDriveLink(auth: AuthContext, clientId: string): Promise<DriveLink | null> {
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const r = await maybeOne<{ folder_id: string; folder_name: string | null; last_import_at: Date | null; last_import: DriveLink["lastImport"] }>(
      tx,
      "SELECT folder_id, folder_name, last_import_at, last_import FROM client_drive_folders WHERE client_id = $1",
      [clientId],
    );
    return r ? { folderId: r.folder_id, folderName: r.folder_name, lastImportAt: r.last_import_at?.toISOString() ?? null, lastImport: r.last_import && Object.keys(r.last_import).length ? r.last_import : null } : null;
  });
}

/** Liga (ou troca) a pasta do cliente. Com o Drive configurado, confere se a pasta está acessível. */
export async function setDriveFolder(auth: AuthContext, clientId: string, link: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<{ folderName: string | null }> {
  assertCan(auth.role, "client.update");
  if (!link.trim()) {
    await withTx(userCtx(auth.userId), async (tx) => {
      await requireClient(tx, auth, clientId);
      await tx.query("DELETE FROM client_drive_folders WHERE client_id = $1", [clientId]);
    });
    return { folderName: null };
  }
  const folderId = parseFolderId(link);
  await withTx(userCtx(auth.userId), (tx) => requireClient(tx, auth, clientId));
  const info = driveStatus().configured ? await folderInfo(folderId, opts) : null;
  await withTx(userCtx(auth.userId), async (tx) => {
    await tx.query(
      `INSERT INTO client_drive_folders (client_id, organization_id, folder_id, folder_name, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (client_id) DO UPDATE SET folder_id = $3, folder_name = $4, updated_by = $5, updated_at = now()`,
      [clientId, auth.organizationId, folderId, info?.name ?? null, auth.userId],
    );
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId, action: "drive.folder_linked", entityType: "client", entityId: clientId, metadata: { folderId, folderName: info?.name ?? null } });
  });
  return { folderName: info?.name ?? null };
}

export interface ImportResult {
  imported: number;
  already: number;
  skipped: number;
  failed: string[];
  remaining: number;
}

export async function importFromDrive(auth: AuthContext, clientId: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<ImportResult> {
  assertCan(auth.role, "media.upload");
  const link = await getDriveLink(auth, clientId);
  if (!link) throw new ValidationError("Ligue uma pasta do Google Drive a este cliente antes de importar.");
  const known = await withTx(userCtx(auth.userId), async (tx) => {
    const rows = await tx.query<{ drive_file_id: string }>("SELECT drive_file_id FROM media_assets WHERE client_id = $1 AND drive_file_id IS NOT NULL", [clientId]);
    return new Set(rows.rows.map((r) => r.drive_file_id));
  });
  const files = await listFolder(link.folderId, opts);
  const maxMb = env().DRIVE_IMPORT_MAX_MB;
  const candidates = files.filter((f) => !known.has(f.id));
  const importable = candidates.filter((f) => IMPORTABLE.test(f.mimeType));
  const result: ImportResult = { imported: 0, already: files.length - candidates.length, skipped: candidates.length - importable.length, failed: [], remaining: 0 };
  const batch = importable.slice(0, IMPORT_BATCH);
  result.remaining = importable.length - batch.length;
  const source = link.folderName ? `pasta “${link.folderName}”` : "pasta do cliente";
  for (const f of batch) {
    try {
      if (f.size !== null && f.size > maxMb * 1024 * 1024) {
        result.failed.push(`${f.name}: maior que ${maxMb} MB`);
        continue;
      }
      const data = await downloadFile(f.id, { fetchImpl: opts.fetchImpl, maxBytes: maxMb * 1024 * 1024 });
      if (!data) {
        result.failed.push(`${f.name}: maior que ${maxMb} MB`);
        continue;
      }
      const kind = f.mimeType.startsWith("video/") ? "video" : f.mimeType === "application/pdf" ? "document" : "image";
      const saved = await uploadMedia(auth, clientId, { filename: f.name, data }, { kind, licenseNote: `Importado do Google Drive (${source}).` }, { maxMb });
      await withTx(userCtx(auth.userId), (tx) => tx.query("UPDATE media_assets SET drive_file_id = $2 WHERE id = $1 AND drive_file_id IS NULL", [saved.id, f.id]));
      if (saved.duplicate) result.already++;
      else result.imported++;
    } catch (err) {
      // Falha de rede/autorização interrompe; arquivo recusado (formato, tamanho) só é anotado.
      if (err instanceof IntegrationError && err.retryable) throw err;
      if (err instanceof AppError) result.failed.push(`${f.name}: ${err.message}`);
      else throw err;
    }
  }
  await withTx(userCtx(auth.userId), async (tx) => {
    await tx.query("UPDATE client_drive_folders SET last_import_at = now(), last_import = $2 WHERE client_id = $1", [clientId, JSON.stringify({ ...result, failed: result.failed.slice(0, 20) })]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId, action: "drive.imported", entityType: "client", entityId: clientId, metadata: { imported: result.imported, already: result.already, failed: result.failed.length } });
  });
  return result;
}
