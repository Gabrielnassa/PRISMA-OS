import { Brandmark, Counter, Photo, Rect, Root, SwipeHint, type TemplateDef } from "../kit";
import { ORIGIN, footerItem, standardItems, typeScale } from "./shared";

const COMMON = {
  version: 1,
  family: "produto" as const,
  formats: ["post", "carousel", "story"] as Array<"post" | "carousel" | "story">,
  aspects: ["1:1", "4:5", "9:16"] as Array<"1:1" | "4:5" | "9:16">,
  origin: ORIGIN,
};

const PRODUCT_LIMITS = {
  cover: { kicker: 40, title: 70, body: 140, highlight: 24, footer: 80 },
  content: { kicker: 40, title: 70, body: 280, highlight: 24, footer: 90 },
  cta: { kicker: 40, title: 70, body: 180, highlight: 24, footer: 90 },
};

export const produtoVitrine: TemplateDef = {
  ...COMMON,
  id: "produto-vitrine",
  name: "Produto vitrine",
  description: "Produto protagonista em cartão, com selo de condição comercial e texto centralizado.",
  purposes: ["Comércio", "Lançamentos", "Catálogo"],
  image: "required",
  defaultTheme: { cover: "light", content: "light", cta: "brand" },
  defaultAlign: "center",
  fieldLimits: PRODUCT_LIMITS,
  compositionRules: ["Foto fiel do produto em cartão central", "Selo com a condição comercial confirmada", "Título e CTA centralizados"],
  qualityCriteria: ["Foto fiel ao produto real", "Preço/condição confirmados pelo cliente", "CTA visível"],
  render(ctx) {
    const side = ctx.safe.side;
    const cardW = ctx.W - side * 2;
    const cardH = Math.round(ctx.H * (ctx.doc.aspect === "1:1" ? 0.36 : ctx.doc.aspect === "9:16" ? 0.4 : 0.46));
    const card = { x: side, y: ctx.safe.top + 90, w: cardW, h: cardH };
    const textTop = card.y + card.h + 48;
    const bottom = ctx.H - ctx.safe.bottom - 64;
    const badgeText = ctx.field("highlight");
    return (
      <Root ctx={ctx}>
        <Rect box={card} color={ctx.palette.surface} radius={40} />
        <Photo ctx={ctx} box={card} radius={40} />
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        {badgeText ? (
          <>
            <Rect box={{ x: card.x + card.w - 380, y: card.y + 32, w: 348, h: 96 }} color={ctx.palette.accent} radius={48} />
            {ctx.textStack({
              key: "badge",
              box: { x: card.x + card.w - 360, y: card.y + 40, w: 308, h: 80 },
              justify: "center",
              align: "center",
              items: [{ field: "highlight", font: "heading", weight: 800, maxSize: 44, minSize: 24, lineHeight: 1.1, color: ctx.palette.accentFg, gapAfter: 0 }],
              background: { kind: "solid", color: ctx.palette.accent },
            })}
          </>
        ) : null}
        {ctx.textStack({
          key: "main",
          box: { x: side, y: textTop, w: ctx.W - side * 2, h: bottom - textTop },
          justify: "start",
          items: standardItems(ctx, { title: { cover: 76, content: 62, cta: 70 } }),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 40, w: ctx.W - side * 2, h: 64 },
          align: "center",
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
      </Root>
    );
  },
};

export const produtoOferta: TemplateDef = {
  ...COMMON,
  id: "produto-oferta",
  name: "Produto oferta",
  description: "Chamada forte em caixa alta com bloco de condição comercial e CTA claro.",
  purposes: ["Promoções", "Datas comerciais", "Campanhas de venda"],
  image: "optional",
  defaultTheme: { cover: "brand", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: PRODUCT_LIMITS,
  compositionRules: ["Título em caixa alta", "Bloco de condição na cor de destaque", "Foto opcional à direita (posts) ou ao topo (Story)"],
  qualityCriteria: ["Condições e prazos confirmados", "Sem promessas exageradas", "CTA explícito"],
  render(ctx) {
    const side = ctx.safe.side;
    const s = typeScale(ctx);
    const hasImage = ctx.image !== null;
    const story = ctx.doc.aspect === "9:16";
    const imgBox = story
      ? { x: side, y: ctx.safe.top + 90, w: ctx.W - side * 2, h: Math.round(ctx.H * 0.3) }
      : { x: Math.round(ctx.W * 0.55), y: 0, w: Math.round(ctx.W * 0.45), h: ctx.H };
    const textX = side;
    const textW = hasImage && !story ? Math.round(ctx.W * 0.55) - side * 2 : ctx.W - side * 2;
    const textTop = hasImage && story ? imgBox.y + imgBox.h + 56 : ctx.safe.top + 120;
    const highlight = ctx.field("highlight");
    const blockH = highlight ? Math.round(150 * s) : 0;
    const bottom = ctx.H - ctx.safe.bottom - 70 - (highlight ? blockH + 40 : 0);
    return (
      <Root ctx={ctx}>
        {hasImage ? <Photo ctx={ctx} box={imgBox} radius={story ? 32 : 0} /> : null}
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        {!hasImage || story ? <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} /> : null}
        {ctx.textStack({
          key: "main",
          box: { x: textX, y: textTop, w: textW, h: bottom - textTop },
          justify: "end",
          items: standardItems(ctx, { title: { cover: 120, content: 84, cta: 100 }, titleUppercase: true, titleLineHeight: 1.0 }),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        {highlight ? (
          <>
            <Rect box={{ x: textX, y: bottom + 40, w: textW, h: blockH }} color={ctx.palette.accent} radius={20} />
            {ctx.textStack({
              key: "offer",
              box: { x: textX + 36, y: bottom + 40 + 20, w: textW - 72, h: blockH - 40 },
              justify: "center",
              items: [{ field: "highlight", font: "heading", weight: 800, maxSize: Math.round(84 * s), minSize: 32, lineHeight: 1.05, uppercase: true, color: ctx.palette.accentFg, gapAfter: 0 }],
              background: { kind: "solid", color: ctx.palette.accent },
            })}
          </>
        ) : null}
        {ctx.textStack({
          key: "footer",
          box: { x: textX, y: ctx.H - ctx.safe.bottom - 40, w: hasImage ? textW : textW - 180, h: 64 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        {!hasImage ? <SwipeHint ctx={ctx} x={ctx.W - side - 160} y={ctx.H - ctx.safe.bottom - 36} /> : null}
      </Root>
    );
  },
};

export const produtoDividido: TemplateDef = {
  ...COMMON,
  id: "produto-dividido",
  name: "Produto dividido",
  description: "Layout dividido: metade foto, metade texto. Equilíbrio entre produto e argumento.",
  purposes: ["Benefícios de produto", "Antes e depois autorizado", "Serviços com foto"],
  image: "required",
  defaultTheme: { cover: "light", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: PRODUCT_LIMITS,
  compositionRules: ["Divisão vertical 50/50 (horizontal em Story)", "Texto com margem interna constante", "Destaque opcional acima do título"],
  qualityCriteria: ["Foto nítida com o produto inteiro visível", "Benefício concreto no título"],
  render(ctx) {
    const story = ctx.doc.aspect === "9:16";
    const side = ctx.safe.side;
    const half = story ? Math.round(ctx.H * 0.48) : Math.round(ctx.W / 2);
    const imgBox = story ? { x: 0, y: 0, w: ctx.W, h: half } : { x: 0, y: 0, w: half, h: ctx.H };
    // Em Story o logotipo fica acima do painel de texto, sem sobrepor o sobretítulo.
    const panel = story
      ? { x: side, y: half + 100, w: ctx.W - side * 2, h: ctx.H - half - 100 - ctx.safe.bottom - 70 }
      : { x: half + 64, y: ctx.safe.top + 100, w: ctx.W - half - 64 - side, h: ctx.H - ctx.safe.top - 100 - ctx.safe.bottom - 70 };
    return (
      <Root ctx={ctx}>
        <Photo ctx={ctx} box={imgBox} />
        <Brandmark ctx={ctx} x={panel.x} y={story ? half + 20 : ctx.safe.top - 10} maxW={200} maxH={56} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={story ? half + 24 : ctx.safe.top} />
        {ctx.textStack({
          key: "main",
          box: panel,
          justify: story ? "start" : "center",
          items: standardItems(ctx, { title: { cover: 72, content: 56, cta: 64 }, includeHighlight: true }),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: panel.x, y: ctx.H - ctx.safe.bottom - 40, w: panel.w, h: 64 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
      </Root>
    );
  },
};

export const PRODUTO_TEMPLATES = [produtoVitrine, produtoOferta, produtoDividido];
