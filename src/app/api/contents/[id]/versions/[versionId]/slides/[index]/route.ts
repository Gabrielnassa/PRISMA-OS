import { apiAuth, jsonError } from "@/server/http";
import { getVersionDocument } from "@/server/services/content";
import { renderStoredSlide } from "@/server/services/render-access";
import { NotFoundError } from "@/server/errors";

/** SVG de uma lâmina de uma versão salva (histórico, comparação e miniaturas). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; versionId: string; index: string }> }) {
  try {
    const auth = await apiAuth();
    const { id, versionId, index } = await params;
    const version = await getVersionDocument(auth, id, versionId);
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= version.document.slides.length) throw new NotFoundError("Lâmina não encontrada.");
    const slide = await renderStoredSlide(auth, id, version.document, i);
    return new Response(slide.svg, {
      headers: {
        "content-type": "image/svg+xml",
        // Versões são imutáveis: o SVG pode ficar em cache privado.
        "cache-control": "private, max-age=3600, immutable",
        "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
