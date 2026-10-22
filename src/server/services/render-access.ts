import "server-only";
import { z } from "zod";
import { maybeOne, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import { NotFoundError, ValidationError } from "../errors";
import { ContentDocumentSchema, referencedAssetIds, type ContentDocument } from "@/lib/content/document";
import type { Briefing } from "@/lib/content/briefing";
import { renderDocument, renderSlide, type RenderedSlide } from "../render/engine";
import { runQualityChecks, type QualityReport } from "../quality/checks";
import { loadBrandProfile } from "./clients";
import { loadImagesForRender } from "./media";

/**
 * Renderização sob demanda com o mesmo isolamento do restante da aplicação:
 * imagens só são carregadas se pertencem ao cliente do conteúdo.
 */
async function loadContext(auth: AuthContext, contentId: string, doc: ContentDocument) {
  if (!z.string().uuid().safeParse(contentId).success) throw new NotFoundError("Conteúdo não encontrado.");
  return withTx(userCtx(auth.userId), async (tx) => {
    const item = await maybeOne<{ client_id: string; briefing: Briefing; format: string }>(
      tx,
      "SELECT client_id, briefing, format FROM content_items WHERE id = $1 AND organization_id = $2",
      [contentId, auth.organizationId],
    );
    if (!item) throw new NotFoundError("Conteúdo não encontrado.");
    const images = await loadImagesForRender(tx, item.client_id, referencedAssetIds(doc));
    const { brand } = await loadBrandProfile(tx, item.client_id);
    return { item, images, brand };
  });
}

export async function previewDocument(auth: AuthContext, contentId: string, raw: unknown): Promise<{ slides: RenderedSlide[]; quality: QualityReport }> {
  const parsed = ContentDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5).join("; "));
  }
  const doc = parsed.data;
  const { item, images, brand } = await loadContext(auth, contentId, doc);
  if (doc.format !== item.format) throw new ValidationError("O formato não pode ser alterado no editor.");
  const slides = await renderDocument(doc, { images });
  const quality = runQualityChecks({
    doc,
    rendered: slides,
    brand,
    briefing: { cta: item.briefing.cta, offer: item.briefing.offer },
    images: new Map([...images].map(([id, v]) => [id, { width: v.width, height: v.height }])),
  });
  return { slides, quality };
}

export async function renderStoredSlide(auth: AuthContext, contentId: string, doc: ContentDocument, index: number): Promise<RenderedSlide> {
  const { images } = await loadContext(auth, contentId, doc);
  return renderSlide(doc, index, { images });
}

export async function renderStoredDocument(auth: AuthContext, contentId: string, doc: ContentDocument): Promise<RenderedSlide[]> {
  const { images } = await loadContext(auth, contentId, doc);
  return renderDocument(doc, { images });
}
