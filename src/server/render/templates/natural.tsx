import { AccentRule, Brandmark, Counter, Overlay, Photo, Rect, Root, SwipeHint, type TemplateDef } from "../kit";
import { mix } from "@/lib/color";
import { LIMITS_STANDARD, ORIGIN, footerItem, standardItems } from "./shared";

const COMMON = {
  version: 1,
  family: "natural" as const,
  formats: ["post", "carousel", "story"] as Array<"post" | "carousel" | "story">,
  aspects: ["1:1", "4:5", "9:16"] as Array<"1:1" | "4:5" | "9:16">,
  origin: ORIGIN,
};

export const naturalFotoCheia: TemplateDef = {
  ...COMMON,
  id: "natural-foto-cheia",
  name: "Natural foto cheia",
  description: "Foto real em tela cheia com película suave na base e texto curto sobre ela.",
  purposes: ["Clínicas", "Restaurantes", "Lojas e negócios locais", "Bastidores e equipe"],
  image: "required",
  defaultTheme: { cover: "brand", content: "brand", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: {
    cover: { kicker: 40, title: 70, body: 120, footer: 60 },
    content: { kicker: 40, title: 70, body: 220, footer: 80 },
    cta: { kicker: 40, title: 70, body: 140, footer: 80 },
  },
  compositionRules: [
    "Foto sangrada em toda a peça; ponto focal ajustável.",
    "Película escura em degradê na metade inferior (opacidade 72%).",
    "Texto branco curto ancorado na base.",
  ],
  qualityCriteria: ["Foto real fornecida ou licenciada", "Rostos e produtos fora da área de texto", "Contraste calculado no pior caso"],
  render(ctx) {
    const side = ctx.safe.side;
    const hasImage = ctx.image !== null;
    const fg = hasImage ? "#ffffff" : ctx.palette.fg;
    const accent = hasImage ? "#ffffff" : ctx.palette.accent;
    const background = hasImage ? ({ kind: "overlay", color: "#000000", alpha: 0.72 } as const) : ({ kind: "solid", color: ctx.palette.bg } as const);
    const textTop = Math.round(ctx.H * 0.45);
    const bottom = ctx.H - ctx.safe.bottom - 64;
    return (
      <Root ctx={ctx}>
        <Photo ctx={ctx} box={{ x: 0, y: 0, w: ctx.W, h: ctx.H }} fallback={ctx.palette.bg} />
        {hasImage ? (
          <>
            {/* Película sólida em toda a área de texto, com transição acima dela. */}
            <Overlay box={{ x: 0, y: textTop - 240, w: ctx.W, h: ctx.H - textTop + 240 }} color="#000000" alpha={0.72} solidFrom="bottom" solidFraction={(ctx.H - textTop) / (ctx.H - textTop + 240)} />
            {/* Faixa superior para logotipo e numeração legíveis sobre qualquer foto. */}
            <Overlay box={{ x: 0, y: 0, w: ctx.W, h: ctx.safe.top + 170 }} color="#000000" alpha={0.55} solidFrom="top" solidFraction={0.7} />
          </>
        ) : null}
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} color={fg} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} color={fg} />
        {ctx.textStack({
          key: "main",
          box: { x: side, y: textTop, w: ctx.W - side * 2, h: bottom - textTop },
          justify: "end",
          items: standardItems(ctx, { title: { cover: 92, content: 72, cta: 80 }, titleWeight: 800, kickerColor: accent, bodyColor: fg, titleColor: fg }),
          background,
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 40, w: ctx.W - side * 2 - 220, h: 64 },
          items: footerItem(ctx, fg),
          background,
        })}
        <SwipeHint ctx={ctx} x={ctx.W - side - 160} y={ctx.H - ctx.safe.bottom - 36} color={fg} />
      </Root>
    );
  },
};

export const naturalCartao: TemplateDef = {
  ...COMMON,
  id: "natural-cartao",
  name: "Natural cartão",
  description: "Foto em cartão com cantos arredondados e texto acolhedor abaixo, sobre fundo suave.",
  purposes: ["Escolas", "Saúde e bem-estar", "Serviços de bairro", "Atendimento"],
  image: "optional",
  defaultTheme: { cover: "light", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: LIMITS_STANDARD,
  compositionRules: ["Fundo levemente tingido pela cor de destaque", "Foto em cartão com raio de 36 px", "Texto em linguagem conversacional"],
  qualityCriteria: ["Tom de voz próximo e claro", "Foto humana e autêntica", "Contraste AA"],
  render(ctx) {
    const side = ctx.safe.side;
    const bg = ctx.theme === "light" ? mix(ctx.palette.bg, ctx.palette.accent, 0.06) : ctx.palette.bg;
    const hasImage = ctx.image !== null;
    const card = { x: side, y: ctx.safe.top + 80, w: ctx.W - side * 2, h: Math.round(ctx.H * (ctx.doc.aspect === "1:1" ? 0.38 : 0.42)) };
    const textTop = hasImage ? card.y + card.h + 56 : Math.round(ctx.H * 0.3);
    const bottom = ctx.H - ctx.safe.bottom - 64;
    return (
      <Root ctx={ctx} bg={bg}>
        {hasImage ? <Photo ctx={ctx} box={card} radius={36} /> : null}
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        {ctx.textStack({
          key: "main",
          box: { x: side, y: textTop, w: ctx.W - side * 2, h: bottom - textTop },
          justify: hasImage ? "start" : "center",
          items: standardItems(ctx, { title: { cover: 84, content: 66, cta: 76 }, titleWeight: 800, includeHighlight: ctx.kind === "cta" }),
          background: { kind: "solid", color: bg },
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 40, w: ctx.W - side * 2 - 220, h: 64 },
          items: footerItem(ctx),
          background: { kind: "solid", color: bg },
        })}
        <SwipeHint ctx={ctx} x={ctx.W - side - 160} y={ctx.H - ctx.safe.bottom - 36} />
      </Root>
    );
  },
};

export const naturalConversa: TemplateDef = {
  ...COMMON,
  id: "natural-conversa",
  name: "Natural conversa",
  description: "Balão de conversa com texto em primeira pessoa, sem foto. Para dicas e respostas a dúvidas.",
  purposes: ["Dúvidas frequentes", "Dicas rápidas", "Atendimento humanizado"],
  image: "none",
  defaultTheme: { cover: "light", content: "light", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: {
    cover: { kicker: 40, title: 100, body: 160, footer: 60 },
    content: { kicker: 40, title: 80, body: 380, footer: 80 },
    cta: { kicker: 40, title: 80, body: 200, footer: 80 },
  },
  compositionRules: ["Balão com cantos arredondados e ponta inferior", "Título na fonte de texto, peso forte", "Sem foto"],
  qualityCriteria: ["Linguagem natural, sem jargão", "Uma ideia por lâmina"],
  render(ctx) {
    const side = ctx.safe.side;
    const bubble = { x: side, y: ctx.safe.top + 110, w: ctx.W - side * 2, h: ctx.H - ctx.safe.top - ctx.safe.bottom - 230 };
    const pad = 64;
    const bubbleColor = ctx.palette.surface;
    return (
      <Root ctx={ctx}>
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        <Rect box={bubble} color={bubbleColor} radius={48} />
        <div
          style={{
            position: "absolute",
            left: bubble.x + 80,
            top: bubble.y + bubble.h - 2,
            width: 0,
            height: 0,
            borderLeft: "0px solid transparent",
            borderRight: "56px solid transparent",
            borderTop: `56px solid ${bubbleColor}`,
            display: "flex",
          }}
        />
        {ctx.textStack({
          key: "main",
          box: { x: bubble.x + pad, y: bubble.y + pad, w: bubble.w - pad * 2, h: bubble.h - pad * 2 },
          justify: "center",
          items: [
            { field: "kicker", font: "body", weight: 600, maxSize: 30, minSize: 22, lineHeight: 1.25, uppercase: true, letterSpacingEm: 0.1, color: ctx.palette.accentText, gapAfter: 24 },
            { field: "title", font: "body", weight: 800, maxSize: ctx.kind === "content" ? 60 : 72, minSize: 38, lineHeight: 1.15, gapAfter: 28 },
            { field: "body", font: "body", weight: 400, maxSize: 40, minSize: 26, lineHeight: 1.4, gapAfter: 0 },
          ],
          background: { kind: "solid", color: bubbleColor },
          lead: ctx.kind === "cover" ? { height: 36, element: <AccentRule color={ctx.palette.accent} width={64} /> } : undefined,
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side + 160, y: ctx.H - ctx.safe.bottom - 50, w: ctx.W - side * 2 - 160, h: 64 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
      </Root>
    );
  },
};

export const NATURAL_TEMPLATES = [naturalFotoCheia, naturalCartao, naturalConversa];
