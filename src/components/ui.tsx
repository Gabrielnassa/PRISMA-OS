import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Primitivas visuais da interface (sem estado; usáveis em Server Components). */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";
const BUTTON: Record<Variant, string> = {
  // Uma ação principal por tela: íris cheio com texto branco (contraste 4,6:1).
  primary: "bg-iris-500 text-white hover:bg-iris-600 hover:shadow-[0_0_0_4px_rgb(86_131_218/0.18)] disabled:bg-ink-800 disabled:text-ink-500 disabled:shadow-none",
  secondary: "border border-ink-600 bg-transparent text-ink-50 hover:border-ink-400 hover:bg-ink-850 disabled:border-ink-700 disabled:text-ink-500 disabled:hover:bg-transparent",
  ghost: "text-ink-300 hover:bg-ink-850 hover:text-ink-50 disabled:text-ink-500 disabled:hover:bg-transparent",
  danger: "border border-red-400/35 text-red-300 hover:border-red-400/60 hover:bg-red-400/[0.08] disabled:border-ink-700 disabled:text-ink-500",
  // Pílula branca: só onde a página é uma vitrine (tela de acesso).
  light: "bg-white text-ink-950 hover:bg-ink-100 disabled:bg-ink-700 disabled:text-ink-400",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md"): string {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow] duration-150 disabled:cursor-not-allowed",
    size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-9 px-[18px] text-[14px]",
    BUTTON[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("min-w-0 rounded-[var(--radius-card)] border border-ink-700/80 bg-ink-900", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-ink-800 px-5 pb-3.5 pt-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-50">{title}</h2>
        {description ? <p className="mt-1 text-[13px] leading-relaxed text-ink-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Cabeçalho de página. `eyebrow` é a trilha de contexto (ex.: "Clientes / Café
 * da Esquina"), em texto discreto acima do título.
 */
export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-enter mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <div className="mb-2 text-[13px] text-ink-400">{eyebrow}</div> : null}
        <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.04em] text-ink-50 md:text-[36px]">{title}</h1>
        {description ? <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Título de seção fora de cartões (agrupa blocos da página). */
export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-4 flex flex-wrap items-baseline justify-between gap-2", className)}>
      <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-ink-50">{children}</h2>
      {aside ? <div className="text-[13px] text-ink-400">{aside}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "accent" | "ember";
// Etiqueta: a cor do assunto a 12% no fundo e cheia no texto.
const TONES: Record<Tone, string> = {
  neutral: "bg-white/[0.07] text-ink-200",
  info: "bg-sky-400/[0.12] text-sky-300",
  warning: "bg-amber-400/[0.12] text-amber-300",
  success: "bg-emerald-400/[0.12] text-emerald-300",
  danger: "bg-red-400/[0.12] text-red-300",
  accent: "bg-iris-400/[0.14] text-iris-300",
  ember: "bg-ember-400/[0.12] text-ember-300",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium leading-[22px]", TONES[tone], className)}>
      {children}
    </span>
  );
}

const DOTS: Record<Tone, string> = {
  neutral: "bg-ink-400",
  info: "bg-sky-400",
  warning: "bg-amber-400",
  success: "bg-emerald-400",
  danger: "bg-red-400",
  accent: "bg-iris-400",
  ember: "bg-ember-400",
};

/** Estado em texto com um ponto colorido (menos ruído que um selo em listas longas). */
export function Dot({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-200", className)}>
      <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", DOTS[tone])} />
      {children}
    </span>
  );
}

const ALERT_BAR = { info: "bg-sky-400", warning: "bg-amber-400", danger: "bg-red-400", success: "bg-emerald-400" } as const;

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className="relative overflow-hidden rounded-[var(--radius-card)] border border-ink-700/80 bg-ink-900 py-3 pl-5 pr-4 text-[13.5px] leading-relaxed text-ink-300">
      <span aria-hidden className={cx("absolute inset-y-0 left-0 w-[3px]", ALERT_BAR[tone])} />
      {title ? <div className="font-semibold text-ink-50">{title}</div> : null}
      {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-ink-700 px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-ink-400">{icon}</div> : null}
      <div className="text-[16px] font-semibold tracking-[-0.02em] text-ink-50">{title}</div>
      {description ? <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-400">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

const STAT_TONES = { iris: "text-iris-300", ember: "text-ember-300", success: "text-emerald-300", warning: "text-amber-300", danger: "text-red-300" } as const;

/**
 * Indicador. Sozinho vira um cartão; dentro de `StatGroup` vira uma célula
 * separada por linhas finas.
 */
export function Stat({ label, value, hint, tone, className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof STAT_TONES; className?: string }) {
  return (
    <div className={cx("min-w-0 px-5 py-4", className)}>
      <div className="text-[12.5px] text-ink-400">{label}</div>
      <div className={cx("mt-2 truncate font-display text-[32px] font-medium leading-none tracking-[-0.05em] tabular", tone ? STAT_TONES[tone] : "text-ink-50")}>{value}</div>
      {hint ? <div className="tabular mt-2 text-[12px] leading-snug text-ink-400">{hint}</div> : null}
    </div>
  );
}

/**
 * Faixa de indicadores com divisórias finas em qualquer quebra de linha (o
 * espaço de 1px entre células mostra a cor da linha). Defina as colunas em
 * `className`; no celular, um último indicador sozinho ocupa a linha inteira.
 */
export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-ink-700/80 bg-ink-700/80 [&>*]:bg-ink-900 max-md:[&>*:last-child:nth-child(odd)]:col-span-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-[6px] border border-ink-700 bg-ink-950 px-3 py-[7px] text-[14px] text-ink-50 placeholder:text-ink-500 transition-colors hover:border-ink-600 focus:border-iris-400 focus:outline-none focus:ring-[3px] focus:ring-iris-400/20 disabled:opacity-60";

export function Field({ label, htmlFor, hint, error, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-200">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-red-300" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] leading-relaxed text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(inputClass, "min-h-24 resize-y leading-relaxed", props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, "h-9 appearance-auto py-0 pr-8", props.className)} />;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13.5px]">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("border-b border-ink-800 px-5 py-2.5 text-[12px] font-medium tracking-normal text-ink-400", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-ink-800/70 px-5 py-3 align-middle text-ink-200", className)}>{children}</td>;
}

export function TabLinks({ tabs, active }: { tabs: Array<{ id: string; label: ReactNode; href: string }>; active: string }) {
  return (
    <nav className="mb-8 flex gap-6 overflow-x-auto border-b border-ink-800" aria-label="Seções">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13.5px] font-medium transition-colors",
            t.id === active ? "border-iris-400 text-ink-50" : "border-transparent text-ink-400 hover:text-ink-100",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export function formatUsd(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) }).format(v);
}

export function formatNumber(v: number): string {
  return new Intl.NumberFormat("pt-BR").format(v);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
