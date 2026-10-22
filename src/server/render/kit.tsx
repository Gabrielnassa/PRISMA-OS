import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { FontId } from "@/lib/fonts";
import { contrastRatio, luminance, mix, readableOn } from "@/lib/color";
import type { TemplateFamily } from "@/lib/brand";
import {
  ASPECTS,
  type Aspect,
  type ContentDocument,
  type ContentFormat,
  type DocumentStyle,
  type FieldKey,
  type Slide,
  type SlideKind,
} from "@/lib/content/document";
import { familyName, fitText } from "./fonts";

// ---------------------------------------------------------------------------
// Tipos públicos dos templates
// ---------------------------------------------------------------------------

export type ThemeName = "light" | "dark" | "brand";

export interface TemplateDef {
  id: string;
  version: number;
  family: TemplateFamily;
  name: string;
  description: string;
  purposes: string[];
  formats: ContentFormat[];
  aspects: Aspect[];
  image: "required" | "optional" | "none";
  defaultTheme: Record<SlideKind, ThemeName>;
  defaultAlign: "left" | "center";
  /** Limite de caracteres por campo e tipo de lâmina. Campos ausentes não são exibidos. */
  fieldLimits: Record<SlideKind, Partial<Record<FieldKey, number>>>;
  compositionRules: string[];
  qualityCriteria: string[];
  origin: string;
  render(ctx: SlideCtx): ReactElement;
}

export interface LoadedImage {
  dataUri: string;
  width: number;
  height: number;
}

export type TextBackground = { kind: "solid"; color: string } | { kind: "overlay"; color: string; alpha: number };

export interface TextReport {
  key: string;
  field: FieldKey;
  text: string;
  font: FontId;
  weight: number;
  size: number;
  minSize: number;
  box: { x: number; y: number; w: number; h: number };
  fits: boolean;
  color: string;
  background: TextBackground;
}

export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  /** Cor de destaque garantidamente legível como texto pequeno (AA 4,5:1). */
  accentText: string;
  accentFg: string;
  surface: string;
  line: string;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Paleta: deriva cores legíveis a partir da identidade da marca
// ---------------------------------------------------------------------------

const isLight = (hex: string) => luminance(hex) > 0.45;

function pickText(bg: string, preferred: string[]): string {
  for (const c of preferred) if (contrastRatio(c, bg) >= 4.5) return c;
  return readableOn(bg, "#ffffff", "#111111");
}

function pickAccent(bg: string, candidates: string[], fallback: string): string {
  for (const c of candidates) if (contrastRatio(c, bg) >= 3) return c;
  return fallback;
}

export function resolvePalette(style: DocumentStyle, theme: ThemeName): Palette {
  const c = style.colors;
  let bg: string;
  if (theme === "light") bg = isLight(c.background) ? c.background : "#ffffff";
  else if (theme === "dark") bg = !isLight(c.primary) ? mix(c.primary, "#000000", 0.35) : !isLight(c.text) ? c.text : "#141416";
  else bg = c.primary;
  const fg = pickText(bg, theme === "light" ? [c.text, c.primary] : [c.background, "#ffffff"]);
  const accent = pickAccent(bg, [c.accent, c.secondary, theme === "light" ? c.primary : c.background], fg);
  // Texto secundário só é atenuado se continuar legível (AA) sobre o fundo.
  const softened = mix(fg, bg, 0.28);
  return {
    bg,
    fg,
    muted: contrastRatio(softened, bg) >= 4.5 ? softened : fg,
    accent,
    accentText: [c.accent, c.secondary, theme === "light" ? c.primary : c.background].find((x) => contrastRatio(x, bg) >= 4.5) ?? fg,
    accentFg: readableOn(accent, "#ffffff", "#111111"),
    surface: mix(bg, fg, 0.06),
    line: mix(bg, fg, 0.16),
  };
}

// ---------------------------------------------------------------------------
// Contexto de renderização de uma lâmina
// ---------------------------------------------------------------------------

export interface StackItem {
  field: FieldKey;
  font: "heading" | "body";
  weight: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  color?: string;
  uppercase?: boolean;
  letterSpacingEm?: number;
  gapAfter?: number;
  /** Texto alternativo (quando o campo do slide não é a fonte). */
  text?: string;
}

export interface StackOptions {
  key: string;
  box: Box;
  items: StackItem[];
  justify?: "start" | "center" | "end";
  align?: "left" | "center";
  background: TextBackground;
  /** Elemento decorativo acima do texto (ex.: filete), que acompanha a pilha. */
  lead?: { height: number; element: ReactElement };
}

export class SlideCtx {
  readonly W: number;
  readonly H: number;
  readonly reports: TextReport[] = [];
  readonly issues: string[] = [];
  readonly palette: Palette;
  readonly theme: ThemeName;
  readonly align: "left" | "center";
  /** Margens seguras: Story reserva áreas para a interface do aplicativo. */
  readonly safe: { top: number; bottom: number; side: number };

  constructor(
    readonly doc: ContentDocument,
    readonly slide: Slide,
    readonly index: number,
    readonly template: TemplateDef,
    readonly image: LoadedImage | null,
    readonly logo: LoadedImage | null,
  ) {
    const dims = ASPECTS[doc.aspect];
    this.W = dims.width;
    this.H = dims.height;
    this.theme = slide.theme === "auto" ? template.defaultTheme[slide.kind] : slide.theme;
    this.palette = resolvePalette(doc.style, this.theme);
    this.align = slide.align === "auto" ? template.defaultAlign : slide.align;
    const side = Math.round(this.W * 0.083);
    this.safe = doc.aspect === "9:16" ? { top: 250, bottom: 340, side } : { top: side, bottom: side, side };
  }

  get count(): number {
    return this.doc.slides.length;
  }

  get kind(): SlideKind {
    return this.slide.kind;
  }

  get isCarousel(): boolean {
    return this.doc.format === "carousel";
  }

  font(which: "heading" | "body"): FontId {
    return which === "heading" ? this.doc.style.headingFont : this.doc.style.bodyFont;
  }

  field(key: FieldKey): string {
    const limit = this.template.fieldLimits[this.slide.kind][key];
    if (limit === undefined) return "";
    return this.slide.fields[key].trim();
  }

  counterLabel(): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(this.index + 1)}/${pad(this.count)}`;
  }

  /**
   * Distribui campos de texto numa caixa, reduzindo proporcionalmente as
   * fontes até caber. Registra o resultado para o controle de qualidade.
   */
  textStack(o: StackOptions): ReactElement | null {
    const scale = this.slide.textScale;
    const items = o.items
      .map((it) => ({ ...it, text: (it.text ?? this.field(it.field)).trim() }))
      .filter((it) => it.text.length > 0);
    if (items.length === 0) return null;

    type Measured = { item: (typeof items)[number]; size: number; height: number; fits: boolean };
    let measured: Measured[] = [];
    let total = 0;
    let factor = 1;
    for (; factor >= 0.3; factor -= 0.05) {
      measured = items.map((item) => {
        const r = fitText(item.text, {
          font: this.font(item.font),
          weight: item.weight,
          maxWidth: o.box.w,
          maxHeight: Number.POSITIVE_INFINITY,
          maxSize: Math.max(item.minSize, item.maxSize * scale * factor),
          minSize: item.minSize,
          lineHeight: item.lineHeight,
          uppercase: item.uppercase,
          letterSpacingEm: item.letterSpacingEm,
        });
        return { item, size: r.size, height: r.height, fits: r.fits };
      });
      total =
        (o.lead?.height ?? 0) +
        measured.reduce((acc, m, i) => acc + m.height + (i < measured.length - 1 ? (m.item.gapAfter ?? 24) : 0), 0);
      const allAtMin = measured.every((m) => m.size <= m.item.minSize);
      if (total <= o.box.h || allAtMin) break;
    }
    const stackFits = total <= o.box.h + 1;

    const children = measured.map((m) => {
      const font = this.font(m.item.font);
      const color = m.item.color ?? this.palette.fg;
      this.reports.push({
        key: `${o.key}:${m.item.field}`,
        field: m.item.field,
        text: m.item.text,
        font,
        weight: m.item.weight,
        size: m.size,
        minSize: m.item.minSize,
        box: o.box,
        fits: stackFits && m.fits,
        color,
        background: o.background,
      });
      const style: CSSProperties = {
        display: "flex",
        width: o.box.w,
        fontFamily: familyName(font),
        fontWeight: m.item.weight,
        fontSize: m.size,
        lineHeight: m.item.lineHeight,
        color,
        textAlign: o.align ?? this.align,
        justifyContent: (o.align ?? this.align) === "center" ? "center" : "flex-start",
        marginBottom: m.item.gapAfter ?? 24,
        whiteSpace: "pre-wrap",
      };
      if (m.item.uppercase) style.textTransform = "uppercase";
      if (m.item.letterSpacingEm) style.letterSpacing = `${m.item.letterSpacingEm}em`;
      return (
        <div key={`t:${o.key}:${m.item.field}`} style={style}>
          {m.item.text}
        </div>
      );
    });
    // Remove a margem do último item para o alinhamento inferior ficar exato.
    const last = children[children.length - 1];
    if (last) children[children.length - 1] = { ...last, props: { ...last.props, style: { ...last.props.style, marginBottom: 0 } } };

    return (
      <div
        key={`stack:${o.key}`}
        style={{
          position: "absolute",
          left: o.box.x,
          top: o.box.y,
          width: o.box.w,
          height: o.box.h,
          display: "flex",
          flexDirection: "column",
          justifyContent: o.justify === "end" ? "flex-end" : o.justify === "center" ? "center" : "flex-start",
          alignItems: (o.align ?? this.align) === "center" ? "center" : "flex-start",
        }}
      >
        {o.lead ? (
          <div key={`lead:${o.key}`} style={{ display: "flex", height: o.lead.height, width: o.box.w, flexShrink: 0 }}>
            {o.lead.element}
          </div>
        ) : null}
        {children}
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// Primitivas visuais
// ---------------------------------------------------------------------------

export function Root({ ctx, bg, children }: { ctx: SlideCtx; bg?: string; children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        width: ctx.W,
        height: ctx.H,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        backgroundColor: bg ?? ctx.palette.bg,
        fontFamily: familyName(ctx.font("body")),
        color: ctx.palette.fg,
      }}
    >
      {children}
    </div>
  );
}

export function Rect({ box, color, radius = 0, opacity, style }: { box: Box; color: string; radius?: number; opacity?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        backgroundColor: color,
        borderRadius: radius,
        opacity,
        display: "flex",
        ...style,
      }}
    />
  );
}

/** Foto com recorte controlável (ponto focal e zoom). Sem imagem, mostra um bloco neutro. */
export function Photo({ ctx, box, radius = 0, fallback }: { ctx: SlideCtx; box: Box; radius?: number; fallback?: string }) {
  const img = ctx.image;
  if (!img) {
    if (ctx.template.image !== "none") ctx.issues.push("missing_image");
    return <Rect box={box} color={fallback ?? ctx.palette.surface} radius={radius} />;
  }
  const zoom = ctx.slide.imageZoom;
  const w = box.w * zoom;
  const h = box.h * zoom;
  const fx = ctx.slide.imageFocus.x / 100;
  const fy = ctx.slide.imageFocus.y / 100;
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        overflow: "hidden",
        borderRadius: radius,
        display: "flex",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.dataUri}
        alt=""
        width={w}
        height={h}
        style={{
          position: "absolute",
          left: -(w - box.w) * fx,
          top: -(h - box.h) * fy,
          width: w,
          height: h,
          objectFit: "cover",
          objectPosition: `${ctx.slide.imageFocus.x}% ${ctx.slide.imageFocus.y}%`,
        }}
      />
    </div>
  );
}

/** Película sobre foto. O controle de qualidade calcula o contraste no pior caso. */
export function Overlay({ box, color, alpha, gradient }: { box: Box; color: string; alpha: number; gradient?: "to-bottom" | "to-top" }) {
  const rgba = (a: number) => {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };
  const fill = gradient
    ? { backgroundImage: `linear-gradient(${gradient === "to-bottom" ? "180deg" : "0deg"}, ${rgba(0)} 0%, ${rgba(alpha)} 55%, ${rgba(alpha)} 100%)` }
    : { backgroundColor: rgba(alpha) };
  return <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", ...fill }} />;
}

/** Logotipo (se configurado e habilitado) ou o @ da marca. */
export function Brandmark({ ctx, x, y, maxW, maxH, color, align = "left" }: { ctx: SlideCtx; x: number; y: number; maxW: number; maxH: number; color?: string; align?: "left" | "right" }) {
  if (!ctx.doc.style.showLogo) return null;
  const logo = ctx.logo;
  if (logo) {
    const ratio = logo.width / Math.max(1, logo.height);
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    const left = align === "right" ? x + maxW - w : x;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo.dataUri} alt="" width={w} height={h} style={{ position: "absolute", left, top: y, width: w, height: h, objectFit: "contain" }} />;
  }
  const handle = ctx.doc.style.handle.trim();
  if (!handle) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: maxW,
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        fontFamily: familyName(ctx.font("body")),
        fontWeight: 600,
        fontSize: 30,
        color: color ?? ctx.palette.fg,
      }}
    >
      {handle}
    </div>
  );
}

/** Numeração da lâmina em carrosséis. */
export function Counter({ ctx, x, y, color, align = "right", width = 200 }: { ctx: SlideCtx; x: number; y: number; color?: string; align?: "left" | "right"; width?: number }) {
  if (!ctx.isCarousel) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        fontFamily: familyName(ctx.font("body")),
        fontWeight: 600,
        fontSize: 28,
        letterSpacing: "0.08em",
        color: color ?? ctx.palette.muted,
      }}
    >
      {ctx.counterLabel()}
    </div>
  );
}

/** Indicação de continuidade na abertura de carrosséis. */
export function SwipeHint({ ctx, x, y, color }: { ctx: SlideCtx; x: number; y: number; color?: string }) {
  if (!ctx.isCarousel || ctx.index !== 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        display: "flex",
        fontFamily: familyName(ctx.font("body")),
        fontWeight: 600,
        fontSize: 28,
        color: color ?? ctx.palette.muted,
        alignItems: "center",
      }}
    >
      <span style={{ marginRight: 12 }}>Deslize</span>
      <svg width="34" height="20" viewBox="0 0 34 20">
        <path d="M2 10 H30 M22 2 L31 10 L22 18" stroke={color ?? ctx.palette.muted} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Filete de destaque usado como `lead` de pilhas de texto. */
export function AccentRule({ color, width = 96, height = 6, gap = 30 }: { color: string; width?: number; height?: number; gap?: number }) {
  return <div style={{ display: "flex", width, height, backgroundColor: color, marginBottom: gap }} />;
}

export function inset(ctx: SlideCtx): Box {
  return { x: ctx.safe.side, y: ctx.safe.top, w: ctx.W - ctx.safe.side * 2, h: ctx.H - ctx.safe.top - ctx.safe.bottom };
}
