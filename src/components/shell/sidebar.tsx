"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { cx } from "../ui";
import { PrismaWordmark } from "../brand/logo";
import { logoutAction } from "@/app/(app)/actions";

type Item = { href: string; label: string; icon: keyof typeof Icon; phase?: string };

const SECTIONS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Operação",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/clientes", label: "Clientes", icon: "clients" },
      { href: "/criar", label: "Central de criação", icon: "create" },
      { href: "/conteudos", label: "Conteúdos", icon: "contents" },
      { href: "/aprovacoes", label: "Aprovações", icon: "approvals" },
      { href: "/midia", label: "Biblioteca de mídia", icon: "media" },
      { href: "/templates", label: "Biblioteca de layouts", icon: "templates" },
    ],
  },
  {
    title: "Inteligência",
    items: [{ href: "/skills", label: "Agentes e skills", icon: "skills" }],
  },
  {
    title: "Gestão",
    items: [
      { href: "/integracoes", label: "Integrações", icon: "integrations" },
      { href: "/custos", label: "Custos e consumo", icon: "costs" },
      { href: "/usuarios", label: "Usuários e permissões", icon: "users" },
      { href: "/configuracoes", label: "Configurações", icon: "settings" },
    ],
  },
];

const PLANNED: Item[] = [
  { href: "#", label: "Estratégias", icon: "strategy", phase: "Fase 3" },
  { href: "#", label: "Calendário editorial", icon: "calendar", phase: "Fase 3" },
  { href: "#", label: "Automações", icon: "automations", phase: "Fase 3" },
  { href: "#", label: "Relatórios", icon: "reports", phase: "Fase 4" },
  { href: "#", label: "Sites e landing pages", icon: "sites", phase: "Fase 5" },
  { href: "#", label: "Campanhas e anúncios", icon: "ads", phase: "Fase 6" },
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
          <div className="mb-1.5 px-2.5 text-[11.5px] font-medium text-ink-400">{section.title}</div>
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
                      "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
                      active ? "bg-ink-850 font-medium text-ink-50" : "text-ink-300 hover:bg-ink-900 hover:text-ink-100",
                    )}
                  >
                    {active ? <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-[2px] rounded-r bg-violet-400" /> : null}
                    <IconCmp width={16} height={16} className={active ? "text-violet-300" : "text-ink-400"} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 text-[11.5px] font-medium text-ink-400 hover:text-ink-200 [&::-webkit-details-marker]:hidden">
          <Icon.chevron width={12} height={12} className="transition-transform group-open:rotate-90" />
          Próximas fases
          <span className="ml-auto font-mono text-[10.5px] text-ink-400">{PLANNED.length}</span>
        </summary>
        <ul className="mt-1.5 flex flex-col gap-px">
          {PLANNED.map((item) => {
            const IconCmp = Icon[item.icon];
            return (
              <li key={item.label}>
                <span
                  className="flex h-8 cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink-500"
                  title={`Módulo previsto para a ${item.phase}; ainda não implementado.`}
                  aria-disabled="true"
                >
                  <IconCmp width={16} height={16} />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="font-mono text-[10.5px] text-ink-600">{item.phase?.replace("Fase ", "F")}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </nav>
  );
}

const AI_DOT = { ready: "bg-teal-400", demo: "bg-amber-400", off: "bg-red-400" } as const;

function Footer({ info }: { info: ShellInfo }) {
  return (
    <div className="mt-auto border-t border-ink-800 px-3 pb-3 pt-3">
      <Link href="/integracoes" title={info.ai.detail} className="mb-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-ink-400 hover:bg-ink-900 hover:text-ink-200">
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
          <button type="submit" className="inline-flex size-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-850 hover:text-ink-50" title="Sair" aria-label="Sair">
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
          <Link href="/" aria-label="PRISMA OS — início">
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
          className="inline-flex size-9 items-center justify-center rounded-md text-ink-200 hover:bg-ink-850"
          aria-label="Abrir menu"
          aria-expanded={open}
        >
          <Icon.menu />
        </button>
        <Link href="/" aria-label="PRISMA OS — início">
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
              <button type="button" onClick={() => setOpen(false)} className="-mr-2 inline-flex size-9 items-center justify-center rounded-md hover:bg-ink-850" aria-label="Fechar menu">
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
