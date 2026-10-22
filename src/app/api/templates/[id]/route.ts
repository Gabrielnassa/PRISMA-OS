import { apiAuth, jsonError } from "@/server/http";
import { getTemplate } from "@/server/render/templates";
import { renderSlide } from "@/server/render/engine";
import { SAMPLE_IMAGE_ID, sampleDocumentFor, sampleImage } from "@/server/render/samples";
import { NotFoundError } from "@/server/errors";
import type { Aspect } from "@/lib/content/document";

const cache = new Map<string, string>();

/** Pré-visualização de template com conteúdo de demonstração (rotulado como exemplo). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await apiAuth();
    const { id } = await params;
    const { template, known } = getTemplate(id);
    if (!known) throw new NotFoundError("Template não encontrado.");
    const url = new URL(request.url);
    const aspect = (["1:1", "4:5", "9:16"].includes(url.searchParams.get("aspect") ?? "") ? url.searchParams.get("aspect") : "4:5") as Aspect;
    const slide = Math.max(0, Math.min(2, Number(url.searchParams.get("slide") ?? 0) || 0));
    const key = `${template.id}@${template.version}:${aspect}:${slide}`;
    let svg = cache.get(key);
    if (!svg) {
      const format = aspect === "9:16" ? "story" : "carousel";
      const doc = sampleDocumentFor(template, format, aspect);
      const rendered = await renderSlide(doc, Math.min(slide, doc.slides.length - 1), { images: new Map([[SAMPLE_IMAGE_ID, sampleImage()]]) });
      svg = rendered.svg;
      cache.set(key, svg);
    }
    return new Response(svg, {
      headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
    });
  } catch (err) {
    return jsonError(err);
  }
}
