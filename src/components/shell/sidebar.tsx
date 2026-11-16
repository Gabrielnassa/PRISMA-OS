"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { cx } from "../ui";
import { PrismaWordmark } from "../brand/logo";
import { logoutAction } from "@/app/(app)/actions";
import { CommandPalette, SearchButton } from "./command-palette";

/** `admin`: só aparece para proprietários e administradores (as páginas também recusam os demais). */
type Item = { href: string; label: string; icon: keyof typeof Icon; admin?: boolean };

const SECTIONS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Operação",
    items: [
      { href: "/", label: "Início", icon: "dashboard" },
      { href: "/clientes", label: "Clientes", icon: "clients" },
      { href: "/criar", label: "Criar", icon: "create" },
      { href: "/calendario", label: "Calendário", icon: "calendar" },
      { href: "/conteudos", label: "Conteúdos", icon: "contents" },
      { href: "/aprovacoes", label: "Aprovações", icon: "approvals" },
      { href: "/publicacoes", label: "Publicações", icon: "send" },
    ],
  },
  {
    title: "Acervo",
    items: [
      { href: "/midia", label: "Mídia", icon: "media" },
      { href: "/templates", label: "Layouts", icon: "templates" },
      { href: "/skills", label: "Skills", icon: "skills" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/integracoes", label: "Integrações", icon: "integrations" },
      { href: "/custos", label: "Custos", icon: "costs", admin: true },
      { href: "/usuarios", label: "Equipe", icon: "users", admin: true },
      { href: "/historico", label: "Histórico", icon: "reports", admin: true },
      { href: "/configuracoes", label: "Configurações", icon: "settings" },
    ],
  },
];

export interface ShellInfo {
  organizationName: string;
  userName: string;
  roleLabel: string;
  isAdmin: boolean;
  unread: number;
  ai: { state: "ready" | "demo" | "off"; label: string; detail: string };
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

function Nav({ pathname, onNavigate, isAdmin }: { pathname: string; onNavigate?: () => void; isAdmin: boolean }) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="mb-1 px-2 text-xs font-medium tracking-[0.05em] text-muted uppercase">{section.title}</div>
          <ul className="flex flex-col gap-px">
            {section.items
              .filter((item) => isAdmin || !item.admin)
              .map((item) => {
                const IconCmp = Icon[item.icon];
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "relative flex h-7 items-center gap-2 rounded-sm px-2 text-base transition-colors max-lg:h-11",
                        active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <IconCmp width={15} height={15} className={active ? "text-fg" : "text-faint"} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const AI_DOT = { ready: "bg-ok", demo: "bg-warn", off: "bg-danger" } as const;

function Footer({ info }: { info: ShellInfo }) {
  return (
    <div className="mt-auto border-t border-line px-2 pt-2 pb-3">
      <Link
        href="/avisos"
        className="flex h-7 items-center gap-2 rounded-sm px-2 text-base text-muted hover:bg-surface-2 hover:text-fg"
      >
        <Icon.bell width={15} height={15} className="text-faint" />
        <span className="flex-1">Avisos</span>
        {info.unread ? (
          <span className="tabular font-mono text-sm text-fg">{info.unread > 99 ? "99+" : info.unread}</span>
        ) : null}
      </Link>
      <Link
        href="/integracoes"
        title={info.ai.detail}
        className="mb-2 flex h-7 items-center gap-2 rounded-sm px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
      >
        <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", AI_DOT[info.ai.state])} />
        <span className="truncate">{info.ai.label}</span>
      </Link>
      <div className="flex items-center gap-2 px-2">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted"
        >
          {initials(info.userName)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-base font-medium text-fg">{info.userName}</div>
          <div className="truncate text-sm text-muted">{info.roleLabel}</div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-fg"
            title="Sair"
            aria-label="Sair"
          >
            <Icon.logout width={16} height={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

function Workspace({ name }: { name: string }) {
  return (
    <div className="px-4 pt-3 pb-3">
      <div className="text-sm text-muted">Agência</div>
      <div className="truncate text-base font-medium text-fg" title={name}>
        {name}
      </div>
      <SearchButton className="mt-2" />
    </div>
  );
}

/** Barra lateral fixa no desktop; no celular, barra superior com gaveta. */
export function Sidebar({ info }: { info: ShellInfo }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <CommandPalette />
      <aside className="sticky top-0 hidden h-dvh w-54 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-12 shrink-0 items-center border-b border-line px-4">
          <Link href="/" aria-label="PRISMA OS, início">
            <PrismaWordmark />
          </Link>
        </div>
        <Workspace name={info.organizationName} />
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          <Nav pathname={pathname} isAdmin={info.isAdmin} />
        </div>
        <Footer info={info} />
      </aside>

      <div className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-line bg-surface px-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex size-11 items-center justify-center rounded-sm text-fg hover:bg-surface-2"
          aria-label="Abrir menu"
          aria-expanded={open}
        >
          <Icon.menu />
        </button>
        <Link href="/" aria-label="PRISMA OS, início">
          <PrismaWordmark />
        </Link>
        <Link
          href="/avisos"
          className="relative ml-auto inline-flex size-11 items-center justify-center rounded-sm text-muted hover:bg-surface-2"
          aria-label={info.unread ? `Avisos, ${info.unread} não lidos` : "Avisos"}
        >
          <Icon.bell width={17} height={17} />
          {info.unread ? <span className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-accent" /> : null}
        </Link>
        <Link
          href="/integracoes"
          className="inline-flex items-center gap-2 pr-2 text-sm text-muted"
          title={info.ai.detail}
        >
          <span aria-hidden className={cx("size-1.5 rounded-full", AI_DOT[info.ai.state])} />
          <span className="hidden sm:inline">{info.ai.label}</span>
        </Link>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-surface shadow-lg">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
              <PrismaWordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-2 inline-flex size-11 items-center justify-center rounded-sm hover:bg-surface-2"
                aria-label="Fechar menu"
              >
                <Icon.close />
              </button>
            </div>
            <Workspace name={info.organizationName} />
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
              <Nav pathname={pathname} onNavigate={() => setOpen(false)} isAdmin={info.isAdmin} />
            </div>
            <Footer info={info} />
          </div>
        </div>
      ) : null}
    </>
  );
}
