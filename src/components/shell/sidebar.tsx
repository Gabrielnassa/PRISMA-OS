"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { cx } from "../ui";
import { PrismaWordmark } from "../brand/logo";
import { logoutAction } from "@/app/(app)/actions";

type Item = { href: string; label: string; icon: keyof typeof Icon };

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
      { href: "/custos", label: "Custos", icon: "costs" },
      { href: "/usuarios", label: "Equipe", icon: "users" },
      { href: "/configuracoes", label: "Configurações", icon: "settings" },
    ],
  },
];

export interface ShellInfo {
  organizationName: string;
  userName: string;
  roleLabel: string;
  ai: { state: "ready" | "demo" | "off"; label: string; detail: string };
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

function Nav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-6">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="mb-1.5 px-3 text-[11.5px] font-medium text-ink-400">{section.title}</div>
          <ul className="flex flex-col gap-px">
            {section.items.map((item) => {
              const IconCmp = Icon[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "relative flex h-9 items-center gap-2.5 rounded-full px-3 text-[14px] transition-colors",
                      active ? "bg-white/[0.07] font-medium text-ink-50" : "text-ink-300 hover:bg-white/[0.04] hover:text-ink-100",
                    )}
                  >
                    <IconCmp width={16} height={16} className={active ? "text-iris-400" : "text-ink-400"} />
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

const AI_DOT = { ready: "bg-emerald-400", demo: "bg-amber-400", off: "bg-red-400" } as const;

function Footer({ info }: { info: ShellInfo }) {
  return (
    <div className="mt-auto border-t border-ink-800 px-3 pb-3 pt-3">
      <Link href="/integracoes" title={info.ai.detail} className="mb-2 flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-ink-400 hover:bg-white/[0.04] hover:text-ink-200">
        <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", AI_DOT[info.ai.state])} />
        <span className="truncate">{info.ai.label}</span>
      </Link>
      <div className="flex items-center gap-2.5 px-2.5">
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-ink-200 ring-1 ring-ink-700">
          {initials(info.userName)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-ink-100">{info.userName}</div>
          <div className="truncate text-[11.5px] text-ink-400">{info.roleLabel}</div>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="inline-flex size-8 items-center justify-center rounded-full text-ink-400 hover:bg-ink-850 hover:text-ink-50" title="Sair" aria-label="Sair">
            <Icon.logout width={16} height={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

function Workspace({ name }: { name: string }) {
  return (
    <div className="px-5 pb-5 pt-4">
      <div className="text-[11.5px] text-ink-400">Agência</div>
      <div className="truncate text-[13.5px] font-medium text-ink-100" title={name}>
        {name}
      </div>
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
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-950 lg:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-ink-800 px-5">
          <Link href="/" aria-label="PRISMA OS, início">
            <PrismaWordmark />
          </Link>
        </div>
        <Workspace name={info.organizationName} />
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <Nav pathname={pathname} />
        </div>
        <Footer info={info} />
      </aside>

      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-950/90 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-full text-ink-200 hover:bg-ink-850"
          aria-label="Abrir menu"
          aria-expanded={open}
        >
          <Icon.menu />
        </button>
        <Link href="/" aria-label="PRISMA OS, início">
          <PrismaWordmark />
        </Link>
        <Link href="/integracoes" className="ml-auto inline-flex items-center gap-2 text-[12px] text-ink-400" title={info.ai.detail}>
          <span aria-hidden className={cx("size-1.5 rounded-full", AI_DOT[info.ai.state])} />
          <span className="hidden sm:inline">{info.ai.label}</span>
        </Link>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-ink-800 bg-ink-950">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-800 px-5">
              <PrismaWordmark />
              <button type="button" onClick={() => setOpen(false)} className="-mr-2 inline-flex size-9 items-center justify-center rounded-full hover:bg-ink-850" aria-label="Fechar menu">
                <Icon.close />
              </button>
            </div>
            <Workspace name={info.organizationName} />
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
              <Nav pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <Footer info={info} />
          </div>
        </div>
      ) : null}
    </>
  );
}
