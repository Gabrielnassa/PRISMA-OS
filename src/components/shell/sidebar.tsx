"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { cx } from "../ui";
import { PrismaWordmark } from "../brand/logo";

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
  {
    title: "Próximas fases",
    items: [
      { href: "#", label: "Estratégias", icon: "strategy", phase: "Fase 3" },
      { href: "#", label: "Calendário editorial", icon: "calendar", phase: "Fase 3" },
      { href: "#", label: "Automações", icon: "automations", phase: "Fase 3" },
      { href: "#", label: "Relatórios", icon: "reports", phase: "Fase 4" },
      { href: "#", label: "Sites e landing pages", icon: "sites", phase: "Fase 5" },
      { href: "#", label: "Campanhas e anúncios", icon: "ads", phase: "Fase 6" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Nav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-6">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{section.title}</div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const IconCmp = Icon[item.icon];
              if (item.phase) {
                return (
                  <li key={item.label}>
                    <span
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-500"
                      title={`Módulo previsto para a ${item.phase}; ainda não implementado.`}
                      aria-disabled="true"
                    >
                      <IconCmp />
                      <span className="flex-1">{item.label}</span>
                      <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-medium text-ink-400">{item.phase}</span>
                    </span>
                  </li>
                );
              }
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active ? "bg-violet-500/15 font-medium text-ink-50 ring-1 ring-inset ring-violet-500/30" : "text-ink-300 hover:bg-ink-800 hover:text-ink-50",
                    )}
                  >
                    <IconCmp className={active ? "text-violet-300" : undefined} />
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

/** Barra lateral fixa no desktop e gaveta no celular. */
export function Sidebar() {
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
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-ink-800 bg-ink-950 px-3 py-5 lg:flex">
        <div className="mb-8 px-3">
          <Link href="/" aria-label="PRISMA OS — início">
            <PrismaWordmark />
          </Link>
        </div>
        <Nav pathname={pathname} />
      </aside>
      <div className="fixed left-2 top-2 z-40 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-lg text-ink-200 hover:bg-ink-800"
          aria-label="Abrir menu"
          aria-expanded={open}
        >
          <Icon.menu />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-ink-800 bg-ink-950 px-3 py-5">
            <div className="mb-6 flex items-center justify-between px-3">
              <PrismaWordmark />
              <button type="button" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-ink-800" aria-label="Fechar menu">
                <Icon.close />
              </button>
            </div>
            <Nav pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
