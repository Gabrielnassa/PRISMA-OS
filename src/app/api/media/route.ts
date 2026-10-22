import { NextResponse } from "next/server";
import { apiAuth, assertSameOrigin, jsonError } from "@/server/http";
import { uploadMedia, MEDIA_KINDS, type MediaKind } from "@/server/services/media";
import { ValidationError } from "@/server/errors";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await apiAuth();
    const form = await request.formData();
    const clientId = String(form.get("clientId") ?? "");
    const kindRaw = String(form.get("kind") ?? "");
    const kind = (MEDIA_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as MediaKind) : undefined;
    const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
    if (files.length === 0) throw new ValidationError("Selecione ao menos um arquivo.");
    if (files.length > 20) throw new ValidationError("Envie no máximo 20 arquivos por vez.");
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
        results.push({ filename: file.name, error: err instanceof Error ? err.message : "Falha no envio" });
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    return jsonError(err);
  }
}
