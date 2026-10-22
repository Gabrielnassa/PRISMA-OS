import type { SlideKind } from "@/lib/content/document";
import type { SlideCtx, StackItem } from "../kit";

export const ORIGIN =
  "Layout original PRISMA OS. Não utiliza imagens, marcas ou código de terceiros; fontes empacotadas sob licença SIL OFL 1.1.";

/** Fator de escala tipográfica por proporção (base 4:5). */
export function typeScale(ctx: SlideCtx): number {
  return ctx.doc.aspect === "1:1" ? 0.9 : ctx.doc.aspect === "9:16" ? 1.04 : 1;
}

export function titleSize(ctx: SlideCtx, sizes: Record<SlideKind, number>): number {
  return Math.round(sizes[ctx.kind] * typeScale(ctx));
}

/** Pilha padrão: sobretítulo, título, texto de apoio (e destaque/rodapé quando pedidos). */
export function standardItems(
  ctx: SlideCtx,
  o: {
    title: Record<SlideKind, number>;
    titleWeight?: number;
    titleUppercase?: boolean;
    titleLineHeight?: number;
    kickerColor?: string;
    bodyColor?: string;
    titleColor?: string;
    includeHighlight?: boolean;
    highlightColor?: string;
    includeFooter?: boolean;
  },
): StackItem[] {
  const s = typeScale(ctx);
  const items: StackItem[] = [
    {
      field: "kicker",
      font: "body",
      weight: 600,
      maxSize: Math.round(30 * s),
      minSize: 22,
      lineHeight: 1.25,
      uppercase: true,
      letterSpacingEm: 0.12,
      color: o.kickerColor ?? ctx.palette.accentText,
      gapAfter: 28,
    },
  ];
  if (o.includeHighlight) {
    items.push({
      field: "highlight",
      font: "heading",
      weight: 800,
      maxSize: Math.round((ctx.kind === "cta" ? 64 : 120) * s),
      minSize: ctx.kind === "cta" ? 36 : 48,
      lineHeight: 1.0,
      color: o.highlightColor ?? ctx.palette.accent,
      gapAfter: 24,
    });
  }
  items.push(
    {
      field: "title",
      font: "heading",
      weight: o.titleWeight ?? 800,
      maxSize: titleSize(ctx, o.title),
      minSize: 40,
      lineHeight: o.titleLineHeight ?? 1.08,
      uppercase: o.titleUppercase,
      color: o.titleColor ?? ctx.palette.fg,
      gapAfter: 32,
    },
    {
      field: "body",
      font: "body",
      weight: 400,
      maxSize: Math.round((ctx.kind === "content" ? 38 : 36) * s),
      minSize: 26,
      lineHeight: 1.38,
      color: o.bodyColor ?? ctx.palette.fg,
      gapAfter: 28,
    },
  );
  if (o.includeFooter) {
    items.push({ field: "footer", font: "body", weight: 600, maxSize: Math.round(28 * s), minSize: 20, lineHeight: 1.3, color: ctx.palette.muted, gapAfter: 0 });
  }
  return items;
}

/** Linha de rodapé (fonte, assinatura ou contato). */
export function footerItem(ctx: SlideCtx, color?: string): StackItem[] {
  return [{ field: "footer", font: "body", weight: 600, maxSize: 28, minSize: 20, lineHeight: 1.3, color: color ?? ctx.palette.muted, gapAfter: 0 }];
}

export const LIMITS_STANDARD = {
  cover: { kicker: 40, title: 90, body: 160, footer: 70 },
  content: { kicker: 40, title: 80, body: 420, footer: 90 },
  cta: { kicker: 40, title: 80, body: 200, highlight: 28, footer: 90 },
} as const;
