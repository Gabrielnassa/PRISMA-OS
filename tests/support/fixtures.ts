import { ContentDocumentSchema, type ContentDocument } from "@/lib/content/document";

export function sampleDocument(overrides: Partial<ContentDocument> = {}): ContentDocument {
  return ContentDocumentSchema.parse({
    schemaVersion: 1,
    format: "carousel",
    aspect: "4:5",
    templateId: "editorial-assimetrico",
    style: {
      colors: { primary: "#1d3557", secondary: "#457b9d", accent: "#e76f51", background: "#f8f5f0", text: "#1b1b1b" },
      headingFont: "playfair-display",
      bodyFont: "inter",
      logoAssetId: null,
      showLogo: true,
      handle: "@estudioexemplo",
    },
    slides: [
      { id: "s1-aaaa", kind: "cover", fields: { kicker: "Guia rápido", title: "Três decisões que mudam a reforma do seu apartamento", body: "", highlight: "", footer: "" } },
      { id: "s2-bbbb", kind: "content", fields: { kicker: "Decisão 1", title: "Planeje a iluminação antes do acabamento", body: "Pontos de luz definidos no projeto evitam quebra-quebra depois. Combine luz geral, de tarefa e de destaque em cada ambiente.", highlight: "", footer: "" } },
      { id: "s3-cccc", kind: "cta", fields: { kicker: "", title: "Quer revisar o seu projeto com a gente?", body: "Agende uma conversa de 30 minutos pelo link da bio.", highlight: "", footer: "estudioexemplo.com.br" } },
    ],
    caption: "Reforma sem retrabalho começa no planejamento.",
    hashtags: ["#arquitetura", "#reforma"],
    cta: "Agende pelo link da bio",
    notes: "",
    ...overrides,
  });
}
