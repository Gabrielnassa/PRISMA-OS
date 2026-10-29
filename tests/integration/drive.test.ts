import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { many, systemCtx, withTx } from "../../src/server/db";
import { resetEnvCache } from "../../src/server/env";
import { ForbiddenError, IntegrationError, ValidationError } from "../../src/server/errors";
import { resetDriveTokenCache, parseFolderId, driveStatus } from "../../src/server/integrations/google-drive";
import { createClient } from "../../src/server/services/clients";
import { getDriveLink, importFromDrive, setDriveFolder } from "../../src/server/services/drive";
import { addMember, newOrg, samplePng } from "./helpers";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = { client_email: "prisma@agencia-123.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), token_uri: "https://oauth2.googleapis.com/token" };
const FOLDER = "1AbCdEfGhIjKlMnOpQrStUvWx";

function configure(on: boolean) {
  if (on) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(SA)).toString("base64");
  else delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  resetEnvCache();
  resetDriveTokenCache();
}

/** Google simulado: token (conferindo a assinatura do JWT), metadados, listagem e download. */
function fakeGoogle(files: Array<{ id: string; name: string; mimeType: string; data?: Buffer }>, opts: { shared?: boolean } = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === SA.token_uri) {
      const assertion = new URLSearchParams(String(init?.body)).get("assertion")!;
      const [h, c, s] = assertion.split(".");
      const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s!, "base64url"));
      const claims = JSON.parse(Buffer.from(c!, "base64url").toString());
      if (!ok || claims.scope !== "https://www.googleapis.com/auth/drive.readonly") return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      return new Response(JSON.stringify({ access_token: "ya29.teste", expires_in: 3600 }), { status: 200 });
    }
    if ((init?.headers as Record<string, string>)?.Authorization !== "Bearer ya29.teste") return new Response("{}", { status: 401 });
    if (opts.shared === false) return new Response("{}", { status: 404 });
    const u = new URL(url);
    if (u.pathname === `/drive/v3/files/${FOLDER}`) return new Response(JSON.stringify({ id: FOLDER, name: "Coli Loterias - fotos", mimeType: "application/vnd.google-apps.folder" }), { status: 200 });
    if (u.pathname === "/drive/v3/files") {
      expect(u.searchParams.get("q")).toContain(`'${FOLDER}' in parents`);
      return new Response(JSON.stringify({ files: files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: String(f.data?.length ?? 10) })) }), { status: 200 });
    }
    const f = files.find((x) => u.pathname === `/drive/v3/files/${x.id}` && u.searchParams.get("alt") === "media");
    if (f?.data) return new Response(new Uint8Array(f.data), { status: 200, headers: { "content-length": String(f.data.length) } });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("pasta do Google Drive por cliente", () => {
  afterEach(() => configure(false));

  it("aceita link ou id da pasta", () => {
    expect(parseFolderId(`https://drive.google.com/drive/folders/${FOLDER}?usp=sharing`)).toBe(FOLDER);
    expect(parseFolderId(`https://drive.google.com/open?id=${FOLDER}`)).toBe(FOLDER);
    expect(parseFolderId(FOLDER)).toBe(FOLDER);
    expect(() => parseFolderId("https://exemplo.com/pasta")).toThrow(ValidationError);
  });

  it("sem conta de serviço guarda o link mas não importa; com ela, importa fotos e vídeos uma única vez", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    expect(driveStatus().configured).toBe(false);
    await setDriveFolder(owner, clientId, `https://drive.google.com/drive/folders/${FOLDER}`);
    expect((await getDriveLink(owner, clientId))?.folderId).toBe(FOLDER);
    await expect(importFromDrive(owner, clientId)).rejects.toThrow(/GOOGLE_SERVICE_ACCOUNT_JSON/);

    configure(true);
    expect(driveStatus().serviceEmail).toBe(SA.client_email);
    const png = samplePng(800, 800, "#16a34a");
    const files = [
      { id: "f1", name: "fachada.png", mimeType: "image/png", data: png },
      { id: "f2", name: "mesma-foto.png", mimeType: "image/png", data: png },
      { id: "f3", name: "planilha", mimeType: "application/vnd.google-apps.spreadsheet" },
      { id: "f4", name: "falso.png", mimeType: "image/png", data: Buffer.from("isto não é uma imagem") },
    ];
    const g = fakeGoogle(files);
    expect(await setDriveFolder(owner, clientId, FOLDER, { fetchImpl: g.fetchImpl })).toEqual({ folderName: "Coli Loterias - fotos" });

    const r = await importFromDrive(owner, clientId, { fetchImpl: g.fetchImpl });
    expect(r).toMatchObject({ imported: 1, already: 1, skipped: 1, remaining: 0 });
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]).toMatch(/^falso\.png: Formato não suportado/);

    const media = await withTx(systemCtx("teste"), (tx) =>
      many<{ filename: string; license_note: string; drive_file_id: string | null }>(tx, "SELECT filename, license_note, drive_file_id FROM media_assets WHERE client_id = $1", [clientId]),
    );
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ filename: "fachada.png", drive_file_id: "f1" });
    expect(media[0]!.license_note).toContain("Coli Loterias - fotos");

    // Segunda importação: nada novo (o falso continua sendo anotado como recusado).
    const again = await importFromDrive(owner, clientId, { fetchImpl: g.fetchImpl });
    expect(again.imported).toBe(0);
    const link = await getDriveLink(owner, clientId);
    expect(link?.lastImport?.imported).toBe(0);
  });

  it("pasta não compartilhada explica com qual e-mail compartilhar; leitura não importa", async () => {
    configure(true);
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    const g = fakeGoogle([], { shared: false });
    const err = await setDriveFolder(owner, clientId, FOLDER, { fetchImpl: g.fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationError);
    expect((err as Error).message).toContain(SA.client_email);
    const viewer = await addMember(owner, "viewer");
    await expect(importFromDrive(viewer, clientId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
