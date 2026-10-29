import JSZip from "jszip";
import { apiAuth, jsonError } from "@/server/http";
import { assertCan } from "@/server/authz/permissions";
import { getVersionDocument, recordExport } from "@/server/services/content";
import { getClient } from "@/server/services/clients";
import { approvedInMonth } from "@/server/services/month";
import { renderStoredDocument } from "@/server/services/render-access";
import { svgToPng } from "@/server/render/engine";
import { ValidationError } from "@/server/errors";
import { slugify } from "@/lib/slug";
import { monthLabel } from "@/lib/content/editorial";

/**
 * Entrega do mês: todas as peças com versão aprovada no mês, num ZIP só, uma
 * pasta por peça (PNGs, legenda com hashtags e textos alternativos), na ordem
 * da linha editorial. Só versões aprovadas: rascunhos não entram.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await apiAuth();
    assertCan(auth.role, "content.export");
    const { id } = await params;
    const month = new URL(request.url).searchParams.get("mes") ?? "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ValidationError("Mês inválido.");
    const client = await getClient(auth, id);
    const pieces = await approvedInMonth(auth, id, month);
    if (pieces.length === 0) throw new ValidationError(`Nenhuma peça aprovada em ${monthLabel(month).toLowerCase()} para este cliente.`);

    const zip = new JSZip();
    const index: string[] = [`Entrega de ${monthLabel(month)} · ${client.name}`, `${pieces.length} peça(s) aprovada(s)`, ""];
    for (const [i, p] of pieces.entries()) {
      const version = await getVersionDocument(auth, p.id, p.approvedVersionId);
      const slides = await renderStoredDocument(auth, p.id, version.document);
      const day = p.plannedDate ? `${p.plannedDate.slice(8, 10)}-${p.plannedDate.slice(5, 7)} ` : "";
      const folder = zip.folder(`${String(i + 1).padStart(2, "0")} ${day}${slugify(p.title, 50)}`)!;
      slides.forEach((s, k) => folder.file(`${String(k + 1).padStart(2, "0")}.png`, svgToPng(s.svg, s.width)));
      const doc = version.document;
      folder.file("legenda.txt", [doc.caption, doc.hashtags.join(" ")].filter(Boolean).join("\n\n") || "(sem legenda)");
      folder.file("texto-alternativo.txt", doc.slides.map((s, k) => `${k + 1}. ${s.alt || "(sem texto alternativo)"}`).join("\n"));
      index.push(`${String(i + 1).padStart(2, "0")}. ${p.plannedDate ? `${p.plannedDate.slice(8, 10)}/${p.plannedDate.slice(5, 7)} · ` : ""}${p.title} (v${version.number}, ${slides.length} imagem(ns))`);
      await recordExport(auth, p.id, id, { versionId: p.approvedVersionId, versionNumber: version.number, approved: true, format: "delivery" });
    }
    zip.file("LEIA-ME.txt", index.join("\n"));
    const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const name = `${slugify(client.name, 40)}-entrega-${month}.zip`;
    return new Response(buffer as unknown as BodyInit, {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
    });
  } catch (err) {
    return jsonError(err);
  }
}
