import { NextResponse } from "next/server";
import { apiAuth, assertSameOrigin, jsonError } from "@/server/http";
import { uploadMedia, MEDIA_KINDS, type MediaKind } from "@/server/services/media";
import { AppError, ValidationError, toUserMessage } from "@/server/errors";
import { assertCan } from "@/server/authz/permissions";
import { env } from "@/server/env";

const MAX_FILES = 20;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await apiAuth();
    // Permissão e tamanho são verificados ANTES de ler o corpo (evita esgotar memória).
    assertCan(auth.role, "media.upload");
    const declared = Number(request.headers.get("content-length"));
    const maxBody = (env().MAX_UPLOAD_MB * MAX_FILES + 1) * 1024 * 1024;
    if (!Number.isFinite(declared) || declared <= 0) {
      return NextResponse.json({ error: { code: "length_required", message: "Envio sem tamanho declarado." } }, { status: 411 });
    }
    if (declared > maxBody) throw new ValidationError(`Envio grande demais. Limite: ${env().MAX_UPLOAD_MB} MB por arquivo e ${MAX_FILES} arquivos por vez.`);
    const form = await request.formData();
    const clientId = String(form.get("clientId") ?? "");
    const kindRaw = String(form.get("kind") ?? "");
    const kind = (MEDIA_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as MediaKind) : undefined;
    const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
    if (files.length === 0) throw new ValidationError("Selecione ao menos um arquivo.");
    if (files.length > MAX_FILES) throw new ValidationError(`Envie no máximo ${MAX_FILES} arquivos por vez.`);
    const results: Array<{ filename: string; id?: string; duplicate?: boolean; error?: string }> = [];
    for (const file of files) {
      try {
        const data = Buffer.from(await file.arrayBuffer());
        const r = await uploadMedia(auth, clientId, { filename: file.name, data }, {
          kind,
          altText: String(form.get("altText") ?? ""),
          licenseNote: String(form.get("licenseNote") ?? ""),
        });
        results.push({ filename: file.name, ...r });
      } catch (err) {
        if (!(err instanceof AppError)) {
          console.error(JSON.stringify({ level: "error", msg: "media.upload_failed", error: (err as Error)?.message }));
        }
        results.push({ filename: file.name, error: toUserMessage(err) });
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    return jsonError(err);
  }
}
