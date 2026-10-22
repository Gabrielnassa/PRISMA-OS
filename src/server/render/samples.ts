import { ContentDocumentSchema, type Aspect, type ContentDocument, type ContentFormat, type SlideKind } from "@/lib/content/document";
import { effectiveLimits } from "@/lib/content/limits";
import type { LoadedImage, TemplateDef } from "./kit";
import { svgToPng } from "./engine";

export const SAMPLE_IMAGE_ID = "00000000-0000-4000-8000-000000000001";

/** Imagem ilustrativa gerada localmente (formas abstratas), usada só em pré-visualizações. */
export function sampleImage(): LoadedImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7b8a3"/><stop offset="1" stop-color="#5b6b73"/></linearGradient></defs>
    <rect width="1200" height="1200" fill="url(#g)"/>
    <circle cx="820" cy="380" r="220" fill="#e9dccb" opacity="0.85"/>
    <rect x="160" y="620" width="560" height="420" rx="40" fill="#3f4b52" opacity="0.8"/>
    <rect x="240" y="700" width="400" height="40" rx="20" fill="#e9dccb" opacity="0.6"/>
  </svg>`;
  const png = svgToPng(svg, 1200);
  return { dataUri: `data:image/png;base64,${png.toString("base64")}`, width: 1200, height: 1200 };
}

/**
 * Conteúdo de DEMONSTRAÇÃO usado apenas para pré-visualizar templates na
 * biblioteca. Marca e textos são fictícios e identificados como exemplo.
 */
const SAMPLE_FIELDS: Record<SlideKind, Record<string, string>> = {
  cover: {
    kicker: "Exemplo de layout",
    title: "Como organizar a rotina da sua equipe em 3 passos",
    body: "Um guia prático para começar ainda esta semana.",
    highlight: "3 passos",
    footer: "Marca Exemplo",
  },
  content: {
    kicker: "Passo 1",
    title: "Defina prioridades antes de distribuir tarefas",
    body: "Liste o que gera mais resultado para o cliente e comece por aí. O restante entra na fila com prazo combinado.",
    highlight: "40%",
    footer: "Fonte: dado fictício de exemplo",
  },
  cta: {
    kicker: "Próximo passo",
    title: "Quer ajuda para aplicar no seu negócio?",
    body: "Fale com a nossa equipe pelo link da bio.",
    highlight: "Condição exemplo",
    footer: "marcaexemplo.com.br",
  },
};

export function sampleDocumentFor(t: TemplateDef, format: ContentFormat, aspect: Aspect): ContentDocument {
  const kinds: SlideKind[] = format === "carousel" ? ["cover", "content", "cta"] : ["cover"];
  return ContentDocumentSchema.parse({
    schemaVersion: 1,
    format,
    aspect,
    templateId: t.id,
    style: {
      colors: { primary: "#2b2d42", secondary: "#8d99ae", accent: "#7c3aed", background: "#f7f7f5", text: "#16161a" },
      headingFont: t.family === "editorial" ? "playfair-display" : t.family === "produto" ? "montserrat" : t.family === "tech" ? "space-grotesk" : t.family === "natural" ? "nunito" : "dm-sans",
      bodyFont: t.family === "tech" ? "space-grotesk" : t.family === "natural" ? "nunito" : "inter",
      logoAssetId: null,
      showLogo: true,
      handle: "@marcaexemplo",
    },
    slides: kinds.map((kind, i) => {
      const limits = effectiveLimits(t.fieldLimits[kind], t.capacity, aspect, kind, t.image !== "none");
      const fields: Record<string, string> = {};
      for (const [k, max] of Object.entries(limits)) fields[k] = (SAMPLE_FIELDS[kind][k] ?? "").slice(0, max);
      return { id: `s${i + 1}-exemplo`, kind, fields, imageAssetId: t.image === "none" ? null : SAMPLE_IMAGE_ID };
    }),
    caption: "Legenda de exemplo.",
    hashtags: [],
    cta: "",
    notes: "Documento de demonstração gerado para pré-visualização de template.",
  });
}
