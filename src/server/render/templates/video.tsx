import { Brandmark, Counter, Overlay, Photo, Rect, Root, type TemplateDef } from "../kit";
import { familyName } from "../fonts";
import { ORIGIN, footerItem, typeScale } from "./shared";

/**
 * Família "Vídeo social profissional": capas e quadros estáticos para Reels,
 * Shorts e Stories. A produção do vídeo em si depende de integração de vídeo
 * (fase 5); aqui ficam as capas editáveis.
 */
const COMMON = {
  version: 1,
  family: "video" as const,
  formats: ["post", "carousel", "story"] as Array<"post" | "carousel" | "story">,
  aspects: ["1:1", "4:5", "9:16"] as Array<"1:1" | "4:5" | "9:16">,
  origin: ORIGIN,
};

const VIDEO_LIMITS = {
  cover: { kicker: 30, title: 60, body: 90, footer: 60 },
  content: { kicker: 30, title: 60, body: 160, footer: 60 },
  cta: { kicker: 30, title: 60, body: 120, footer: 70 },
};

export const videoCapaImpacto: TemplateDef = {
  ...COMMON,
  id: "video-capa-impacto",
  name: "Capa de vídeo impacto",
  description: "Capa de Reels/Shorts com frame do vídeo ao fundo e título centralizado na área segura.",
  purposes: ["Capas de Reels e Shorts", "Demonstrações", "Chamadas de vídeo"],
  image: "optional",
  defaultTheme: { cover: "dark", content: "dark", cta: "brand" },
  defaultAlign: "center",
  fieldLimits: VIDEO_LIMITS,
  compositionRules: ["Título centralizado dentro da área segura do aplicativo", "Película escura uniforme (62%) sobre o frame", "Poucas palavras, leitura em 2 segundos"],
  qualityCriteria: ["Legível em miniatura", "Texto fora das áreas da interface do app", "Frame real do vídeo"],
  render(ctx) {
    const side = ctx.safe.side;
    const hasImage = ctx.image !== null;
    const fg = hasImage ? "#ffffff" : ctx.palette.fg;
    const accent = hasImage ? "#ffffff" : ctx.palette.accent;
    const background = hasImage ? ({ kind: "overlay", color: "#000000", alpha: 0.62 } as const) : ({ kind: "solid", color: ctx.palette.bg } as const);
    const s = typeScale(ctx);
    const box = { x: side, y: ctx.safe.top + 120, w: ctx.W - side * 2, h: ctx.H - ctx.safe.top - ctx.safe.bottom - 240 };
    return (
      <Root ctx={ctx}>
        <Photo ctx={ctx} box={{ x: 0, y: 0, w: ctx.W, h: ctx.H }} fallback={ctx.palette.bg} />
        {hasImage ? <Overlay box={{ x: 0, y: 0, w: ctx.W, h: ctx.H }} color="#000000" alpha={0.62} /> : null}
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} color={fg} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} color={fg} />
        {ctx.textStack({
          key: "main",
          box,
          justify: "center",
          align: "center",
          items: [
            { field: "kicker", font: "body", weight: 700, maxSize: 34, minSize: 24, lineHeight: 1.2, uppercase: true, letterSpacingEm: 0.14, color: accent, gapAfter: 28 },
            { field: "title", font: "heading", weight: 800, maxSize: Math.round(124 * s), minSize: 52, lineHeight: 1.02, uppercase: true, color: fg, gapAfter: 32 },
            { field: "body", font: "body", weight: 600, maxSize: Math.round(40 * s), minSize: 28, lineHeight: 1.3, color: fg, gapAfter: 0 },
          ],
          background,
        })}
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 50, w: ctx.W - side * 2, h: 44 },
          align: "center",
          items: footerItem(ctx, fg),
          background,
        })}
      </Root>
    );
  },
};

export const videoDepoimento: TemplateDef = {
  ...COMMON,
  id: "video-depoimento",
  name: "Depoimento",
  description: "Trecho de depoimento real com foto circular e assinatura. Exige depoimento confirmado e autorizado.",
  purposes: ["Prova social", "Casos reais", "Capas de vídeo-depoimento"],
  image: "optional",
  defaultTheme: { cover: "dark", content: "dark", cta: "brand" },
  defaultAlign: "center",
  fieldLimits: {
    cover: { kicker: 30, title: 140, footer: 70 },
    content: { kicker: 30, title: 140, body: 160, footer: 70 },
    cta: { kicker: 30, title: 60, body: 120, footer: 70 },
  },
  compositionRules: ["Foto circular da pessoa (opcional)", "Aspas na cor de destaque", "Nome e contexto no rodapé"],
  qualityCriteria: ["Depoimento real, literal e autorizado", "Nome/identificação com consentimento", "Sem edição que altere o sentido"],
  render(ctx) {
    const side = ctx.safe.side;
    const s = typeScale(ctx);
    const hasImage = ctx.image !== null;
    const avatar = Math.round(200 * s);
    const top = ctx.safe.top + 90;
    const textTop = top + (hasImage ? avatar + 40 : 0) + Math.round(130 * s);
    const bottom = ctx.H - ctx.safe.bottom - 130;
    return (
      <Root ctx={ctx}>
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        {hasImage ? <Photo ctx={ctx} box={{ x: (ctx.W - avatar) / 2, y: top, w: avatar, h: avatar }} radius={avatar / 2} /> : null}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: top + (hasImage ? avatar + 10 : 0),
            width: ctx.W,
            display: "flex",
            justifyContent: "center",
            fontFamily: familyName(ctx.font("heading")),
            fontWeight: 800,
            fontSize: Math.round(200 * s),
            lineHeight: 1,
            color: ctx.palette.accent,
          }}
        >
          “
        </div>
        {ctx.textStack({
          key: "main",
          box: { x: side, y: textTop, w: ctx.W - side * 2, h: bottom - textTop },
          justify: "start",
          align: "center",
          items: [
            { field: "kicker", font: "body", weight: 600, maxSize: 30, minSize: 22, lineHeight: 1.25, uppercase: true, letterSpacingEm: 0.12, color: ctx.palette.accentText, gapAfter: 24 },
            { field: "title", font: "heading", weight: 600, maxSize: Math.round((ctx.kind === "cta" ? 84 : 64) * s), minSize: 36, lineHeight: 1.2, gapAfter: 28 },
            { field: "body", font: "body", weight: 400, maxSize: Math.round(36 * s), minSize: 26, lineHeight: 1.4, gapAfter: 0 },
          ],
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        <Rect box={{ x: (ctx.W - 80) / 2, y: bottom + 30, w: 80, h: 4 }} color={ctx.palette.accent} />
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: bottom + 56, w: ctx.W - side * 2, h: 50 },
          align: "center",
          items: [{ field: "footer", font: "body", weight: 700, maxSize: 32, minSize: 22, lineHeight: 1.3, color: ctx.palette.fg, gapAfter: 0 }],
          background: { kind: "solid", color: ctx.palette.bg },
        })}
      </Root>
    );
  },
};

export const videoLegenda: TemplateDef = {
  ...COMMON,
  id: "video-legenda",
  name: "Faixa de legenda",
  description: "Frame do vídeo com faixa sólida no terço inferior, como legenda de telejornal.",
  purposes: ["Cortes de entrevistas", "Bastidores", "Séries de vídeo"],
  image: "required",
  defaultTheme: { cover: "brand", content: "brand", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: {
    cover: { kicker: 30, title: 60, body: 90 },
    content: { kicker: 30, title: 60, body: 160 },
    cta: { kicker: 30, title: 60, body: 120 },
  },
  compositionRules: ["Frame em tela cheia", "Faixa sólida na cor da marca no terço inferior", "Sobretítulo em etiqueta acima da faixa"],
  qualityCriteria: ["Rosto/assunto fora da faixa", "Texto curto na faixa", "Contraste AA na faixa"],
  render(ctx) {
    const side = ctx.safe.side;
    const s = typeScale(ctx);
    const bandH = Math.round((ctx.doc.aspect === "1:1" ? 300 : 340) * s);
    const bandY = ctx.H - ctx.safe.bottom - bandH - 30;
    const kicker = ctx.field("kicker");
    return (
      <Root ctx={ctx}>
        <Photo ctx={ctx} box={{ x: 0, y: 0, w: ctx.W, h: ctx.H }} />
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} color="#ffffff" />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} color="#ffffff" />
        <Rect box={{ x: 0, y: bandY, w: ctx.W, h: bandH }} color={ctx.palette.bg} />
        {kicker ? (
          <>
            <Rect box={{ x: side, y: bandY - 64, w: Math.min(ctx.W - side * 2, 520), h: 64 }} color={ctx.palette.accent} />
            {ctx.textStack({
              key: "tag",
              box: { x: side + 24, y: bandY - 56, w: Math.min(ctx.W - side * 2, 520) - 48, h: 48 },
              justify: "center",
              items: [{ field: "kicker", font: "body", weight: 700, maxSize: 28, minSize: 20, lineHeight: 1.2, uppercase: true, letterSpacingEm: 0.1, color: ctx.palette.accentFg, gapAfter: 0 }],
              background: { kind: "solid", color: ctx.palette.accent },
            })}
          </>
        ) : null}
        {ctx.textStack({
          key: "main",
          box: { x: side, y: bandY + 40, w: ctx.W - side * 2, h: bandH - 80 },
          justify: "center",
          items: [
            { field: "title", font: "heading", weight: 800, maxSize: Math.round(72 * s), minSize: 36, lineHeight: 1.08, gapAfter: 18 },
            { field: "body", font: "body", weight: 400, maxSize: Math.round(34 * s), minSize: 24, lineHeight: 1.35, gapAfter: 0 },
          ],
          background: { kind: "solid", color: ctx.palette.bg },
        })}
      </Root>
    );
  },
};

export const VIDEO_TEMPLATES = [videoCapaImpacto, videoDepoimento, videoLegenda];
