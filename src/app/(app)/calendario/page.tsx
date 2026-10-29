import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listClients } from "@/server/services/clients";
import { calendarEntries, type CalendarEntry } from "@/server/services/month";
import { currentMonth, shiftMonth } from "@/server/services/editorial";
import { EDITORIAL_FORMAT_LABELS, monthLabel } from "@/lib/content/editorial";
import { STATUS_LABELS } from "@/lib/content/status";
import { calendarFeedStatus } from "@/server/services/calendar-feed";
import { FeedPanel } from "./feed-panel";
import { Card, EmptyState, LinkButton, PageHeader, Select, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Calendário" };

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Cor do ponto: pauta planejada, em produção (pela situação da peça), feita. */
function tone(e: CalendarEntry): string {
  if (e.itemStatus === "done" || e.contentStatus === "approved" || e.contentStatus === "published") return "bg-emerald-400";
  if (e.contentStatus === "awaiting_approval") return "bg-amber-400";
  if (e.contentStatus === "failed" || e.contentStatus === "rejected") return "bg-red-400";
  if (e.contentItemId) return "bg-iris-400";
  return e.planApproved ? "bg-ink-400" : "bg-ink-600";
}

function statusText(e: CalendarEntry): string {
  if (e.contentStatus) return STATUS_LABELS[e.contentStatus];
  if (e.itemStatus === "done") return "Feito";
  return e.planApproved ? "Planejada" : "Em rascunho";
}

function Entry({ e, showClient }: { e: CalendarEntry; showClient: boolean }) {
  const href = e.contentItemId ? `/conteudos/${e.contentItemId}` : `/clientes/${e.clientId}?aba=editorial&mes=${e.date.slice(0, 7)}`;
  return (
    <Link href={href} title={`${e.clientName} · ${EDITORIAL_FORMAT_LABELS[e.format]} · ${statusText(e)}`} className="group flex items-start gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/[0.05]">
      <span aria-hidden className={cx("mt-[6px] size-1.5 shrink-0 rounded-full", tone(e))} />
      <span className="min-w-0 text-[12px] leading-snug">
        {showClient ? <span className="block truncate text-ink-400">{e.clientName}</span> : null}
        <span className="block truncate text-ink-100 group-hover:text-white">
          {e.format === "video" ? "▶ " : ""}
          {e.title}
        </span>
      </span>
    </Link>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ mes?: string; cliente?: string }> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const month = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : currentMonth();
  const clients = await listClients(auth);
  const clientId = clients.some((c) => c.id === sp.cliente) ? sp.cliente : undefined;
  const entries = await calendarEntries(auth, month, clientId);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // segunda = 0
  const cells: Array<string | null> = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const href = (mm: string) => `/calendario?mes=${mm}${clientId ? `&cliente=${clientId}` : ""}`;

  return (
    <>
      <PageHeader
        title="Calendário"
        actions={
          <span className="flex items-center gap-1">
            <LinkButton href={href(shiftMonth(month, -1))} variant="ghost" size="sm" aria-label="Mês anterior">
              ←
            </LinkButton>
            <span className="min-w-[150px] text-center text-[14px] font-medium text-ink-50">{monthLabel(month)}</span>
            <LinkButton href={href(shiftMonth(month, 1))} variant="ghost" size="sm" aria-label="Próximo mês">
              →
            </LinkButton>
          </span>
        }
      />
      <form className="mb-6 flex flex-wrap gap-2" action="/calendario">
        <input type="hidden" name="mes" value={month} />
        <Select name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente" className="max-w-xs">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-400">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ink-400" />Planejada</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-iris-400" />Em produção</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-400" />Aguardando aprovação</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400" />Aprovada ou feita</span>
        </span>
      </form>

      {entries.length === 0 ? (
        <EmptyState
          title={`Nada planejado em ${monthLabel(month).toLowerCase()}`}
          description="As pautas aparecem aqui quando a linha editorial do cliente é montada."
          action={clients[0] ? <LinkButton href={`/clientes/${clientId ?? clients[0].id}?aba=editorial&mes=${month}`}>Abrir linha editorial</LinkButton> : undefined}
        />
      ) : (
        <>
          {/* Desktop: grade do mês. */}
          <Card className="hidden overflow-hidden md:block">
            <div className="grid grid-cols-7 border-b border-ink-800 text-[12px] font-medium text-ink-400">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-3 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-ink-800">
              {cells.map((day, i) => (
                <div key={i} className={cx("min-h-[112px] bg-ink-900 p-1.5", !day && "bg-ink-950/60")}>
                  {day ? (
                    <>
                      <div className={cx("mb-1 px-1.5 text-[12px] tabular", day === today ? "font-semibold text-iris-300" : "text-ink-400")}>{Number(day.slice(8))}</div>
                      {(byDay.get(day) ?? []).map((e, k) => (
                        <Entry key={k} e={e} showClient={!clientId} />
                      ))}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
          {/* Celular: lista por dia. */}
          <ol className="flex flex-col gap-3 md:hidden">
            {[...byDay.entries()].map(([day, list]) => (
              <li key={day}>
                <Card>
                  <div className={cx("border-b border-ink-800 px-4 py-2 text-[12.5px] font-medium", day === today ? "text-iris-300" : "text-ink-300")}>
                    {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}
                  </div>
                  <div className="p-2">
                    {list.map((e, k) => (
                      <Entry key={k} e={e} showClient={!clientId} />
                    ))}
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </>
      )}
      <FeedPanel active={(await calendarFeedStatus(auth)).active} />
    </>
  );
}
