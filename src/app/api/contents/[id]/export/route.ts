import JSZip from "jszip";
import { apiAuth, jsonError } from "@/server/http";
import { assertCan } from "@/server/authz/permissions";
import { getContent, getVersionDocument, recordExport } from "@/server/services/content";
import { renderStoredDocument } from "@/server/services/render-access";
import { svgToPng } from "@/server/render/engine";
import { ValidationError } from "@/server/errors";
import { slugify } from "@/lib/slug";

/**
 * Exporta PNGs em resolução final. Sem `version`, exporta a versão aprovada.
 * Versões não aprovadas só saem como rascunho identificado no nome do arquivo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await apiAuth();
    assertCan(auth.role, "content.export");
    const { id } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "zip" ? "zip" : "png";
    let versionId = url.searchParams.get("version");
    if (!versionId) {
      const detail = await getContent(auth, id);
      if (!detail.approvedVersionId) throw new ValidationError("Este conteúdo ainda não tem versão aprovada. Baixe como rascunho ou envie para aprovação.");
      versionId = detail.approvedVersionId;
    }
    const version = await getVersionDocument(auth, id, versionId);
    const slides = await renderStoredDocument(auth, id, version.document);
    const base = `${slugify(version.title, 50)}-v${version.number}${version.isApproved ? "-aprovado" : "-RASCUNHO"}`;
    await recordExport(auth, id, version.clientId, { versionId, versionNumber: version.number, approved: version.isApproved, format });

    if (format === "png") {
      const index = Math.max(0, Math.min(slides.length - 1, Number(url.searchParams.get("slide") ?? 0) || 0));
      const slide = slides[index]!;
      const png = svgToPng(slide.svg, slide.width);
      return new Response(new Uint8Array(png), {
        headers: {
          "content-type": "image/png",
          "content-disposition": `attachment; filename="${base}-${index + 1}.png"`,
          "cache-control": "no-store",
        },
      });
    }

    const zip = new JSZip();
    slides.forEach((s, i) => zip.file(`${base}-${String(i + 1).padStart(2, "0")}.png`, svgToPng(s.svg, s.width)));
    const doc = version.document;
    const caption = [doc.caption, doc.hashtags.join(" ")].filter(Boolean).join("\n\n");
    zip.file(`${base}-legenda.txt`, caption || "(sem legenda)");
    const alts = doc.slides.map((s, i) => `${i + 1}. ${s.alt || "(sem texto alternativo)"}`).join("\n");
    zip.file(`${base}-texto-alternativo.txt`, alts);
    if (!version.isApproved) zip.file("LEIA-ME.txt", "Esta exportação é um RASCUNHO: a versão não está aprovada e não deve ser publicada.");
    const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${base}.zip"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
