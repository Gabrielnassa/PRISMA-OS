import type { ReactElement } from "react";
import { AccentRule, Brandmark, Counter, Rect, Root, SwipeHint, type SlideCtx, type TemplateDef } from "../kit";
import { mix } from "@/lib/color";
import { LIMITS_STANDARD, ORIGIN, footerItem, standardItems, typeScale } from "./shared";

const COMMON = {
  version: 1,
  family: "tech" as const,
  formats: ["post", "carousel", "story"] as Array<"post" | "carousel" | "story">,
  aspects: ["1:1", "4:5", "9:16"] as Array<"1:1" | "4:5" | "9:16">,
  origin: ORIGIN,
  image: "none" as const,
};

function Grid({ ctx, step = 90 }: { ctx: SlideCtx; step?: number }): ReactElement {
  const color = mix(ctx.palette.bg, ctx.palette.fg, 0.07);
  const lines: ReactElement[] = [];
  for (let x = step; x < ctx.W; x += step) lines.push(<Rect key={`v${x}`} box={{ x, y: 0, w: 1, h: ctx.H }} color={color} />);
  for (let y = step; y < ctx.H; y += step) lines.push(<Rect key={`h${y}`} box={{ x: 0, y, w: ctx.W, h: 1 }} color={color} />);
  return <>{lines}</>;
}

function GradientBar({ ctx, x, y, w, h }: { ctx: SlideCtx; x: number; y: number; w: number; h: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: h / 2,
        backgroundImage: `linear-gradient(90deg, ${ctx.doc.style.colors.accent}, ${ctx.doc.style.colors.secondary})`,
        display: "flex",
      }}
    />
  );
}

export const techGrade: TemplateDef = {
  ...COMMON,
  id: "tech-grade",
  name: "Tech grade",
  description: "Fundo escuro com grade técnica discreta, barra em degradê e tipografia forte.",
  purposes: ["Tecnologia", "SaaS", "Produtos digitais", "O próprio PRISMA OS"],
  defaultTheme: { cover: "dark", content: "dark", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: LIMITS_STANDARD,
  compositionRules: ["Grade de 90 px com 7% de contraste", "Barra em degradê destaque → secundária", "Sobretítulo em caixa alta espaçada"],
  qualityCriteria: ["Grade não compete com o texto", "Contraste AA", "Sem gráficos com dados inventados"],
  render(ctx) {
    const side = ctx.safe.side;
    const textTop = Math.round(ctx.H * 0.3);
    const bottom = ctx.H - ctx.safe.bottom - 70;
    return (
      <Root ctx={ctx}>
        <Grid ctx={ctx} />
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        {ctx.textStack({
          key: "main",
          box: { x: side, y: textTop, w: ctx.W - side * 2, h: bottom - textTop },
          justify: ctx.kind === "content" ? "start" : "end",
          items: standardItems(ctx, { title: { cover: 100, content: 70, cta: 84 }, includeHighlight: ctx.kind === "cta" }),
          background: { kind: "solid", color: ctx.palette.bg },
          lead: { height: 44, element: <AccentRule color={ctx.palette.accent} width={140} height={8} gap={36} /> },
        })}
        <GradientBar ctx={ctx} x={side} y={ctx.safe.top + 70} w={160} h={8} />
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

export const techMetrica: TemplateDef = {
  ...COMMON,
  id: "tech-metrica",
  name: "Tech métrica",
  description: "Indicador em destaque com contexto e fonte, em painel escuro. Sem gráficos ilustrativos.",
  purposes: ["Resultados verificados", "Benchmarks com fonte", "Relatórios"],
  defaultTheme: { cover: "dark", content: "dark", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: {
    cover: { kicker: 40, highlight: 12, title: 90, body: 160, footer: 100 },
    content: { kicker: 40, highlight: 12, title: 80, body: 280, footer: 110 },
    cta: { kicker: 40, title: 80, body: 200, footer: 90 },
  },
  compositionRules: ["Indicador em corpo grande", "Contexto curto", "Fonte do dado no rodapé, separada por linha"],
  qualityCriteria: ["Dado real com fonte", "Período de referência explícito", "Nada de números inventados"],
  render(ctx) {
    const side = ctx.safe.side;
    const s = typeScale(ctx);
    const top = ctx.safe.top + 140;
    const bottom = ctx.H - ctx.safe.bottom - 90;
    return (
      <Root ctx={ctx}>
        <Grid ctx={ctx} step={135} />
        <GradientBar ctx={ctx} x={side} y={ctx.safe.top + 70} w={ctx.W - side * 2} h={4} />
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={56} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        {ctx.textStack({
          key: "main",
          box: { x: side, y: top, w: ctx.W - side * 2, h: bottom - top },
          justify: "center",
          items: [
            { field: "kicker", font: "body", weight: 600, maxSize: 30, minSize: 22, lineHeight: 1.25, uppercase: true, letterSpacingEm: 0.14, color: ctx.palette.accentText, gapAfter: 24 },
            { field: "highlight", font: "heading", weight: 700, maxSize: Math.round(240 * s), minSize: 90, lineHeight: 1, color: ctx.palette.accent, gapAfter: 36 },
            { field: "title", font: "heading", weight: 700, maxSize: Math.round((ctx.kind === "cta" ? 84 : 58) * s), minSize: 36, lineHeight: 1.12, gapAfter: 28 },
            { field: "body", font: "body", weight: 400, maxSize: Math.round(34 * s), minSize: 26, lineHeight: 1.4, gapAfter: 0 },
          ],
          background: { kind: "solid", color: ctx.palette.bg },
        })}
        <Rect box={{ x: side, y: ctx.H - ctx.safe.bottom - 70, w: ctx.W - side * 2, h: 2 }} color={ctx.palette.line} />
        {ctx.textStack({
          key: "footer",
          box: { x: side, y: ctx.H - ctx.safe.bottom - 48, w: ctx.W - side * 2, h: 68 },
          items: footerItem(ctx),
          background: { kind: "solid", color: ctx.palette.bg },
        })}
      </Root>
    );
  },
};

export const techPainel: TemplateDef = {
  ...COMMON,
  id: "tech-painel",
  name: "Tech painel",
  description: "Conteúdo dentro de um painel de interface com controles de janela, sobre fundo escuro.",
  purposes: ["Funcionalidades de produto", "Tutoriais de software", "Novidades"],
  defaultTheme: { cover: "dark", content: "dark", cta: "brand" },
  defaultAlign: "left",
  fieldLimits: LIMITS_STANDARD,
  compositionRules: ["Painel com raio de 28 px e borda sutil", "Três controles de janela no topo", "Texto dentro do painel"],
  qualityCriteria: ["Não simular telas de produtos de terceiros", "Contraste AA dentro do painel"],
  render(ctx) {
    const side = ctx.safe.side;
    const panel = { x: side, y: ctx.safe.top + 100, w: ctx.W - side * 2, h: ctx.H - ctx.safe.top - ctx.safe.bottom - 190 };
    const panelBg = mix(ctx.palette.bg, ctx.palette.fg, 0.07);
    const pad = 64;
    const dots = [ctx.doc.style.colors.accent, ctx.doc.style.colors.secondary, mix(ctx.palette.bg, ctx.palette.fg, 0.35)];
    return (
      <Root ctx={ctx}>
        <Brandmark ctx={ctx} x={side} y={ctx.safe.top - 10} maxW={220} maxH={64} />
        <Counter ctx={ctx} x={ctx.W - side - 200} y={ctx.safe.top} />
        <Rect box={panel} color={panelBg} radius={28} style={{ border: `2px solid ${ctx.palette.line}` }} />
        {dots.map((c, i) => (
          <Rect key={c + i} box={{ x: panel.x + 40 + i * 40, y: panel.y + 36, w: 22, h: 22 }} radius={11} color={c} />
        ))}
        <Rect box={{ x: panel.x, y: panel.y + 92, w: panel.w, h: 2 }} color={ctx.palette.line} />
        {ctx.textStack({
          key: "main",
          box: { x: panel.x + pad, y: panel.y + 92 + pad, w: panel.w - pad * 2, h: panel.h - 92 - pad * 2 },
          justify: "center",
          items: standardItems(ctx, { title: { cover: 88, content: 64, cta: 76 }, includeHighlight: ctx.kind === "cta" }),
          background: { kind: "solid", color: panelBg },
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

export const TECH_TEMPLATES = [techGrade, techMetrica, techPainel];
