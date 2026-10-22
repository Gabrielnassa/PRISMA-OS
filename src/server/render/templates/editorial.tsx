import { AccentRule, Brandmark, Counter, Photo, Rect, Root, SwipeHint, type TemplateDef } from "../kit";
import { familyName } from "../fonts";
import { LIMITS_STANDARD, ORIGIN, footerItem, standardItems, typeScale } from "./shared";

const COMMON = {
  version: 1,
  family: "editorial" as const,
  formats: ["post", "carousel", "story"] as Array<"post" | "carousel" | "story">,
  aspects: ["1:1", "4:5", "9:16"] as Array<"1:1" | "4:5" | "9:16">,
  origin: ORIGIN,
};

export const editorialAssimetrico: TemplateDef = {
  ...COMMON,
  id: "editorial-assimetrico",
  name: "Editorial assimétrico",
  description: "Títulos marcantes ancorados na base, margem direita ampla e muito espaço em branco.",
  purposes: ["Consultorias", "Arquitetura", "Serviços profissionais", "Marcas sofisticadas"],
  image: "optional",
  defaultTheme: { cover: "light", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: LIMITS_STANDARD,
  compositionRules: [
    "Texto alinhado à esquerda e ancorado na parte inferior.",
    "Coluna de texto ocupa 86% da largura útil (assimetria intencional).",
    "Foto opcional em bloco recuado na parte superior.",
    "Filete na cor de destaque acima do sobretítulo.",
  ],
  qualityCriteria: ["Título com no máximo 3–4 linhas", "Contraste AA entre texto e fundo", "Margens seguras preservadas"],
  render(ctx) {
    const side = ctx.safe.side;
    const top = ctx.safe.top;
    const hasImage = ctx.image !== null;
    const imageBox = { x: side, y: top + 80, w: ctx.W - side * 2, h: Math.round(ctx.H * 0.36) };
    const textTop = hasImage ? imageBox.y + imageBox.h + 64 : Math.round(ctx.H * 0.28);
    const bottom = ctx.H - ctx.safe.bottom - 70;
    const colW = Math.round((ctx.W - side * 2) * 0.86);
    return (
      <Root ctx={ctx}>
        {hasImage ? <Photo ctx={ctx} box={imageBox} /> : null}
        <Brandmark ctx={ctx} x={side} y={top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={top} />
        {ctx.textStack({
          key: "main",
          box: { x: side, y: textTop, w: colW, h: bottom - textTop },
          justify: "end",
          items: standardItems(ctx, { title: { cover: 104, content: 76, cta: 88 }, includeHighlight: ctx.kind === "cta" }),
          background: { kind: "solid", color: ctx.palette.bg },
          lead: { height: 36, element: <AccentRule color={ctx.palette.accent} /> },
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 40, w: ctx.W - side * 2 - 220, h: 64 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        <SwipeHint ctx={ctx} x={ctx.W - side - 160} y={ctx.H - ctx.safe.bottom - 36} />
      </Root>
    );
  },
};

export const editorialFoto: TemplateDef = {
  ...COMMON,
  id: "editorial-foto",
  name: "Editorial com fotografia",
  description: "Fotografia real ocupando a metade superior e painel editorial de texto abaixo.",
  purposes: ["Bastidores", "Projetos e portfólio", "Equipe", "Ambientes"],
  image: "required",
  defaultTheme: { cover: "light", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: {
    cover: { kicker: 40, title: 80, body: 120, footer: 70 },
    content: { kicker: 40, title: 70, body: 300, footer: 90 },
    cta: { kicker: 40, title: 70, body: 160, footer: 90 },
  },
  compositionRules: [
    "Foto sangrada ocupando 55% da altura (50% em Story).",
    "Painel de texto com margem lateral constante.",
    "Logotipo no rodapé do painel, nunca sobre a foto.",
  ],
  qualityCriteria: ["Foto real e licenciada", "Ponto focal ajustado ao recorte", "Contraste AA no painel"],
  render(ctx) {
    const side = ctx.safe.side;
    const imgH = Math.round(ctx.H * (ctx.doc.aspect === "9:16" ? 0.5 : 0.55));
    const panelTop = imgH + 56;
    const bottom = ctx.H - ctx.safe.bottom - 70;
    return (
      <Root ctx={ctx}>
        <Photo ctx={ctx} box={{ x: 0, y: 0, w: ctx.W, h: imgH }} />
        {ctx.isCarousel ? (
          <div
            style={{
              position: "absolute",
              right: side,
              top: Math.max(48, ctx.safe.top - 20),
              display: "flex",
              padding: "10px 18px",
              borderRadius: 999,
              backgroundColor: "rgba(0, 0, 0, 0.55)",
              color: "#ffffff",
              fontFamily: familyName(ctx.font("body")),
              fontWeight: 600,
              fontSize: 26,
            }}
          >
            {ctx.counterLabel()}
          </div>
        ) : null}
        {ctx.textStack({
          key: "main",
          box: { x: side, y: panelTop, w: ctx.W - side * 2, h: bottom - panelTop },
          justify: "start",
          items: standardItems(ctx, { title: { cover: 80, content: 64, cta: 72 } }),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 40, w: ctx.W - side * 2 - 260, h: 64 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        <Brandmark ctx={ctx} x={ctx.W - side - 220} y={ctx.H - ctx.safe.bottom - 56} maxW={220} maxH={60} align="right" />
      </Root>
    );
  },
};

export const editorialCitacao: TemplateDef = {
  ...COMMON,
  id: "editorial-citacao",
  name: "Editorial citação",
  description: "Frase em destaque com aspas tipográficas e assinatura. Para posicionamento e reflexões.",
  purposes: ["Posicionamento", "Opinião de especialista", "Valores da marca"],
  image: "none",
  defaultTheme: { cover: "light", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: {
    cover: { title: 140, footer: 70 },
    content: { title: 140, body: 200, footer: 70 },
    cta: { title: 80, body: 200, footer: 90 },
  },
  compositionRules: ["Aspas na cor de destaque", "Barra vertical à esquerda", "Assinatura no rodapé (campo rodapé)"],
  qualityCriteria: ["Citação atribuída a pessoa real e autorizada", "Sem frases genéricas"],
  render(ctx) {
    const side = ctx.safe.side;
    const s = typeScale(ctx);
    const quoteTop = ctx.safe.top + 120;
    const textTop = quoteTop + Math.round(200 * s);
    const bottom = ctx.H - ctx.safe.bottom - 110;
    return (
      <Root ctx={ctx}>
        <Rect box={{ x: side, y: quoteTop, w: 8, h: bottom - quoteTop + 60 }} color={ctx.palette.accent} />
        <div
          style={{
            position: "absolute",
            left: side + 44,
            top: quoteTop - 40,
            display: "flex",
            fontFamily: familyName(ctx.font("heading")),
            fontWeight: 800,
            fontSize: Math.round(260 * s),
            lineHeight: 1,
            color: ctx.palette.accent,
          }}
        >
          “
        </div>
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        {ctx.textStack({
          key: "main",
          box: { x: side + 44, y: textTop, w: ctx.W - side * 2 - 60, h: bottom - textTop },
          justify: "start",
          items: [
            { field: "title", font: "heading", weight: 600, maxSize: Math.round(76 * s), minSize: 40, lineHeight: 1.18, gapAfter: 36 },
            { field: "body", font: "body", weight: 400, maxSize: Math.round(36 * s), minSize: 26, lineHeight: 1.4, gapAfter: 0 },
          ],
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side + 44, y: bottom + 30, w: ctx.W - side * 2 - 60, h: 70 },
          items: [{ field: "footer", font: "body", weight: 600, maxSize: 32, minSize: 22, lineHeight: 1.3, color: ctx.palette.fg, text: ctx.field("footer") ? `— ${ctx.field("footer")}` : "" }],
          background: { kind: "solid", color: ctx.palette.bg },
        })}
      </Root>
    );
  },
};

export const EDITORIAL_TEMPLATES = [editorialAssimetrico, editorialFoto, editorialCitacao];
