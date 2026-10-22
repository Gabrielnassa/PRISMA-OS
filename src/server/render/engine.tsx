import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ContentDocument } from "@/lib/content/document";
import { ASPECTS } from "@/lib/content/document";
import { satoriFonts } from "./fonts";
import { SlideCtx, type LoadedImage, type TextReport } from "./kit";
import { getTemplate } from "./templates";

export interface RenderAssets {
  images: Map<string, LoadedImage>;
}

export interface RenderedSlide {
  slideId: string;
  index: number;
  width: number;
  height: number;
  svg: string;
  texts: TextReport[];
  /** Ocorrências detectadas na composição (ex.: missing_image, missing_logo, unknown_template). */
  issues: string[];
}

interface DetectedNode {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export async function renderSlide(doc: ContentDocument, index: number, assets: RenderAssets): Promise<RenderedSlide> {
  const slide = doc.slides[index];
  if (!slide) throw new Error(`Lâmina ${index} inexistente`);
  const { template, known } = getTemplate(doc.templateId);
  const image = slide.imageAssetId ? (assets.images.get(slide.imageAssetId) ?? null) : null;
  const logo = doc.style.logoAssetId ? (assets.images.get(doc.style.logoAssetId) ?? null) : null;
  const ctx = new SlideCtx(doc, slide, index, template, image, logo);
  if (!known) ctx.issues.push("unknown_template");
  if (slide.imageAssetId && !image) ctx.issues.push("image_unavailable");
  if (doc.style.showLogo && doc.style.logoAssetId && !logo) ctx.issues.push("logo_unavailable");

  const element = template.render(ctx);
  const { width, height } = ASPECTS[doc.aspect];
  const nodes: DetectedNode[] = [];
  const svg = await satori(element, {
    width,
    height,
    fonts: satoriFonts([doc.style.headingFont, doc.style.bodyFont]),
    onNodeDetected: (n) => {
      if (typeof n.key === "string" && (n.key.startsWith("t:") || n.key.startsWith("stack:"))) {
        nodes.push({ key: n.key, left: n.left, top: n.top, width: n.width, height: n.height });
      }
    },
  });

  // Verificação definitiva de transbordo usando o layout calculado pelo Satori.
  const stacks = new Map(nodes.filter((n) => n.key.startsWith("stack:")).map((n) => [n.key.slice("stack:".length), n]));
  for (const report of ctx.reports) {
    const node = nodes.find((n) => n.key === `t:${report.key}`);
    const stackKey = report.key.split(":")[0]!;
    const stack = stacks.get(stackKey);
    if (!node || !stack) continue;
    const overflowY = node.top + node.height > stack.top + stack.height + 2 || node.top < stack.top - 2;
    const overflowX = node.left + node.width > width + 1 || node.left < -1;
    if (overflowY || overflowX) report.fits = false;
  }

  return { slideId: slide.id, index, width, height, svg, texts: ctx.reports, issues: ctx.issues };
}

export async function renderDocument(doc: ContentDocument, assets: RenderAssets): Promise<RenderedSlide[]> {
  const out: RenderedSlide[] = [];
  for (let i = 0; i < doc.slides.length; i++) out.push(await renderSlide(doc, i, assets));
  return out;
}

export function svgToPng(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } });
  return Buffer.from(resvg.render().asPng());
}
