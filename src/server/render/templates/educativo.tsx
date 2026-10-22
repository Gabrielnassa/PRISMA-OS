import { AccentRule, Brandmark, Counter, Rect, Root, SwipeHint, type SlideCtx, type TemplateDef } from "../kit";
import { familyName } from "../fonts";
import { LIMITS_STANDARD, ORIGIN, footerItem, standardItems, typeScale } from "./shared";

const COMMON = {
  version: 1,
  family: "educativo" as const,
  formats: ["post", "carousel", "story"] as Array<"post" | "carousel" | "story">,
  aspects: ["1:1", "4:5", "9:16"] as Array<"1:1" | "4:5" | "9:16">,
  origin: ORIGIN,
  image: "none" as const,
};

/** Posição da lâmina entre as de desenvolvimento (1, 2, 3...). */
function contentNumber(ctx: SlideCtx): number {
  return ctx.doc.slides.slice(0, ctx.index + 1).filter((s) => s.kind === "content").length;
}

export const educativoLista: TemplateDef = {
  ...COMMON,
  id: "educativo-lista",
  name: "Educativo lista numerada",
  description: "Uma ideia por lâmina com numeração grande. Ideal para listas, dicas e passo a passo.",
  purposes: ["Autoridade", "Educação do público", "Geração de leads"],
  defaultTheme: { cover: "brand", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: LIMITS_STANDARD,
  compositionRules: ["Número da ideia em destaque na cor de acento", "Título objetivo seguido de explicação curta", "Abertura na cor da marca"],
  qualityCriteria: ["Uma ideia por lâmina", "Títulos objetivos", "Sequência narrativa clara"],
  render(ctx) {
    const side = ctx.safe.side;
    const s = typeScale(ctx);
    const isContent = ctx.kind === "content";
    const numberSize = Math.round(200 * s);
    const textTop = isContent ? ctx.safe.top + 110 + numberSize : Math.round(ctx.H * 0.3);
    const bottom = ctx.H - ctx.safe.bottom - 70;
    return (
      <Root ctx={ctx}>
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        {isContent ? (
          <div
            style={{
              position: "absolute",
              left: side - 8,
              top: ctx.safe.top + 90,
              display: "flex",
              fontFamily: familyName(ctx.font("heading")),
              fontWeight: 800,
              fontSize: numberSize,
              lineHeight: 1,
              color: ctx.palette.accent,
            }}
          >
            {String(contentNumber(ctx)).padStart(2, "0")}
          </div>
        ) : null}
        {ctx.textStack({
          key: "main",
          box: { x: side, y: textTop, w: ctx.W - side * 2, h: bottom - textTop },
          justify: isContent ? "start" : "end",
          items: standardItems(ctx, { title: { cover: 100, content: 68, cta: 84 }, includeHighlight: ctx.kind === "cta" }),
          background: { kind: "solid", color: ctx.palette.bg },
          lead: isContent ? undefined : { height: 36, element: <AccentRule color={ctx.palette.accent} /> },
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 40, w: ctx.W - side * 2 - 220, h: 44 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        <SwipeHint ctx={ctx} x={ctx.W - side - 160} y={ctx.H - ctx.safe.bottom - 36} />
      </Root>
    );
  },
};

export const educativoNumero: TemplateDef = {
  ...COMMON,
  id: "educativo-numero",
  name: "Educativo número em destaque",
  description: "Um dado ou número grande com contexto e fonte identificável no rodapé.",
  purposes: ["Dados de mercado", "Resultados verificados", "Comparativos"],
  defaultTheme: { cover: "light", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: {
    cover: { kicker: 40, highlight: 12, title: 90, body: 160, footer: 90 },
    content: { kicker: 40, highlight: 12, title: 80, body: 300, footer: 110 },
    cta: { kicker: 40, title: 80, body: 200, footer: 90 },
  },
  compositionRules: ["Número em corpo muito grande na cor de destaque", "Contexto do número logo abaixo", "Fonte do dado obrigatória no rodapé"],
  qualityCriteria: ["Número verificado e com fonte", "Unidade explícita (%, R$, dias...)", "Sem arredondamento enganoso"],
  render(ctx) {
    const side = ctx.safe.side;
    const s = typeScale(ctx);
    const top = ctx.safe.top + 120;
    const bottom = ctx.H - ctx.safe.bottom - 80;
    return (
      <Root ctx={ctx}>
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        {ctx.textStack({
          key: "main",
          box: { x: side, y: top, w: ctx.W - side * 2, h: bottom - top },
          justify: "center",
          items: [
            { field: "kicker", font: "body", weight: 600, maxSize: 30, minSize: 22, lineHeight: 1.25, uppercase: true, letterSpacingEm: 0.12, color: ctx.palette.accent, gapAfter: 20 },
            { field: "highlight", font: "heading", weight: 800, maxSize: Math.round(260 * s), minSize: 90, lineHeight: 1, color: ctx.palette.accent, gapAfter: 36 },
            { field: "title", font: "heading", weight: 800, maxSize: Math.round((ctx.kind === "cta" ? 84 : 60) * s), minSize: 38, lineHeight: 1.12, gapAfter: 28 },
            { field: "body", font: "body", weight: 400, maxSize: Math.round(36 * s), minSize: 26, lineHeight: 1.4, gapAfter: 0 },
          ],
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        <Rect box={{ x: side, y: ctx.H - ctx.safe.bottom - 64, w: ctx.W - side * 2, h: 2 }} color={ctx.palette.line} />
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 44, w: ctx.W - side * 2, h: 44 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
      </Root>
    );
  },
};

export const educativoPassos: TemplateDef = {
  ...COMMON,
  id: "educativo-passos",
  name: "Educativo passo a passo",
  description: "Barra de progresso no topo indica a etapa; texto direto e didático.",
  purposes: ["Tutoriais", "Processos", "Onboarding de clientes"],
  defaultTheme: { cover: "dark", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: LIMITS_STANDARD,
  compositionRules: ["Barra segmentada com a etapa atual destacada", "Rótulo da etapa no sobretítulo", "Texto alinhado ao topo"],
  qualityCriteria: ["Etapas em ordem lógica", "Verbos no imperativo", "Uma ação por etapa"],
  render(ctx) {
    const side = ctx.safe.side;
    const barY = ctx.safe.top;
    const segGap = 12;
    const segW = (ctx.W - side * 2 - segGap * (ctx.count - 1)) / ctx.count;
    const textTop = barY + 150;
    const bottom = ctx.H - ctx.safe.bottom - 70;
    return (
      <Root ctx={ctx}>
        {ctx.isCarousel
          ? ctx.doc.slides.map((sl, i) => (
              <Rect
                key={sl.id}
                box={{ x: side + i * (segW + segGap), y: barY, w: segW, h: 10 }}
                radius={5}
                color={i <= ctx.index ? ctx.palette.accent : ctx.palette.line}
              />
            ))
          : null}
        <Brandmark ctx={ctx} x={side} y={barY + 44} maxW={200} maxH={56} />
        {ctx.textStack({
          key: "main",
          box: { x: side, y: textTop, w: ctx.W - side * 2, h: bottom - textTop },
          justify: ctx.kind === "content" ? "start" : "center",
          items: standardItems(ctx, { title: { cover: 96, content: 70, cta: 84 }, includeHighlight: ctx.kind === "cta" }),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 40, w: ctx.W - side * 2 - 220, h: 44 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.H - ctx.safe.bottom - 36} />
      </Root>
    );
  },
};

export const EDUCATIVO_TEMPLATES = [educativoLista, educativoNumero, educativoPassos];
