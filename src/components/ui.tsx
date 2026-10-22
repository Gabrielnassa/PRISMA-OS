import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Primitivas visuais da interface (sem estado; usáveis em Server Components). */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const BUTTON: Record<Variant, string> = {
  primary: "bg-violet-600 text-white hover:bg-violet-500 disabled:bg-ink-600 disabled:text-ink-400",
  secondary: "bg-ink-800 text-ink-100 border border-ink-600 hover:bg-ink-700 disabled:text-ink-500",
  ghost: "text-ink-200 hover:bg-ink-800 disabled:text-ink-500",
  danger: "bg-red-600/90 text-white hover:bg-red-500 disabled:bg-ink-600",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap",
    size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
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
    <section className={cx("rounded-[var(--radius-card)] border border-ink-700 bg-ink-900", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-700 px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold text-ink-50">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-violet-400">{eyebrow}</div> : null}
        <h1 className="font-display text-2xl font-bold text-ink-50 md:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-ink-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "accent" | "teal";
const TONES: Record<Tone, string> = {
  neutral: "bg-ink-700/70 text-ink-200 ring-ink-600",
  info: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  warning: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  success: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  danger: "bg-red-500/10 text-red-300 ring-red-500/30",
  accent: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  teal: "bg-teal-500/10 text-teal-300 ring-teal-500/30",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode }) {
  const styles = {
    info: "border-sky-500/30 bg-sky-500/5 text-sky-100",
    warning: "border-amber-500/30 bg-amber-500/5 text-amber-100",
    danger: "border-red-500/30 bg-red-500/5 text-red-100",
    success: "border-emerald-500/30 bg-emerald-500/5 text-emerald-100",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", styles)}>
      {title ? <div className="font-semibold">{title}</div> : null}
      {children ? <div className={title ? "mt-1 opacity-90" : ""}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-ink-600 px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-ink-400">{icon}</div> : null}
      <div className="font-display text-base font-semibold text-ink-100">{title}</div>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "violet" | "teal" | "warning" | "danger" }) {
  const color = tone === "violet" ? "text-violet-300" : tone === "teal" ? "text-teal-300" : tone === "warning" ? "text-amber-300" : tone === "danger" ? "text-red-300" : "text-ink-50";
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-700 bg-ink-900 px-4 py-4">
      <div className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</div>
      <div className={cx("mt-1 font-display text-2xl font-bold", color)}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-400">{hint}</div> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-60";

export function Field({ label, htmlFor, hint, error, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-200">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-400">{hint}</p>
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
  return <select {...props} className={cx(inputClass, "appearance-auto pr-8", props.className)} />;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("border-b border-ink-700 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink-400", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-ink-800 px-4 py-3 align-middle text-ink-200", className)}>{children}</td>;
}

export function TabLinks({ tabs, active }: { tabs: Array<{ id: string; label: ReactNode; href: string }>; active: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-700" aria-label="Seções">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.id === active ? "border-violet-500 text-ink-50" : "border-transparent text-ink-400 hover:text-ink-100",
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
