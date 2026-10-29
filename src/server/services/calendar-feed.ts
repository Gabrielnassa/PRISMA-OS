import { maybeOne, systemCtx, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import { randomToken, sha256 } from "../crypto/secrets";
import { workerAuth } from "../jobs/worker-auth";
import { audit, userActor } from "./audit";
import { calendarEntries } from "./month";
import { currentMonth, shiftMonth } from "./editorial";
import { publicBase } from "./integration-apps";
import { listPublications } from "./publications";
import { NETWORK_LABELS } from "./social-accounts";
import { EDITORIAL_FORMAT_LABELS } from "@/lib/content/editorial";

/**
 * Agenda da agência para Google Agenda, Apple Calendário ou Outlook: um
 * endereço privado (por pessoa) que devolve as pautas e as publicações
 * agendadas em formato ICS. Mostra só os clientes que a pessoa acessa.
 * Gerar um endereço novo invalida o anterior.
 */

export async function calendarFeedStatus(auth: AuthContext): Promise<{ active: boolean; createdAt: string | null; lastUsedAt: string | null }> {
  const r = await withTx(userCtx(auth.userId), (tx) =>
    maybeOne<{ created_at: Date; last_used_at: Date | null }>(tx, "SELECT created_at, last_used_at FROM calendar_feeds WHERE organization_id = $1 AND user_id = $2", [auth.organizationId, auth.userId]),
  );
  return { active: Boolean(r), createdAt: r?.created_at.toISOString() ?? null, lastUsedAt: r?.last_used_at?.toISOString() ?? null };
}

/** Cria (ou troca) o endereço da agenda. O endereço aparece só agora. */
export async function createCalendarFeed(auth: AuthContext): Promise<string> {
  const base = publicBase().url;
  if (!base) throw new Error("APP_URL não definida");
  const token = randomToken(24);
  await withTx(userCtx(auth.userId), async (tx) => {
    await tx.query(
      `INSERT INTO calendar_feeds (organization_id, user_id, token_hash) VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = now(), last_used_at = NULL`,
      [auth.organizationId, auth.userId, sha256(token)],
    );
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "calendar.feed_created", entityType: "calendar_feed", entityId: auth.userId });
  });
  return `${base}/api/agenda/${token}.ics`;
}

export async function revokeCalendarFeed(auth: AuthContext): Promise<void> {
  await withTx(userCtx(auth.userId), (tx) => tx.query("DELETE FROM calendar_feeds WHERE organization_id = $1 AND user_id = $2", [auth.organizationId, auth.userId]));
}

/** Texto em ICS: escapa vírgula, ponto e vírgula, barra e quebra de linha; dobra linhas longas. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  url?: string;
  /** Dia inteiro (AAAA-MM-DD) ou horário exato. */
  date?: string;
  at?: Date;
  minutes?: number;
}

export function buildIcs(name: string, events: IcsEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PRISMA OS//Agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:America/Sao_Paulo"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`);
    if (e.date) {
      const d = e.date.replace(/-/g, "");
      const next = new Date(`${e.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`);
    } else if (e.at) {
      lines.push(`DTSTART:${stamp(e.at)}`, `DTEND:${stamp(new Date(e.at.getTime() + (e.minutes ?? 15) * 60_000))}`);
    }
    lines.push(`SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** Conteúdo da agenda para o endereço privado; `null` se o endereço não vale mais. */
export async function calendarFeedIcs(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const feed = await withTx(systemCtx("calendar.feed"), async (tx) => {
    const r = await maybeOne<{ organization_id: string; user_id: string }>(tx, "UPDATE calendar_feeds SET last_used_at = now() WHERE token_hash = $1 RETURNING organization_id, user_id", [sha256(token)]);
    return r;
  });
  if (!feed) return null;
  const auth = await workerAuth(feed.organization_id, feed.user_id);
  if (!auth) return null;
  const base = publicBase().url ?? "";
  const month = currentMonth();
  const months = [shiftMonth(month, -1), month, shiftMonth(month, 1), shiftMonth(month, 2)];
  const events: IcsEvent[] = [];
  for (const m of months) {
    for (const e of await calendarEntries(auth, m)) {
      events.push({
        uid: `pauta-${e.clientId}-${e.date}-${encodeURIComponent(e.title).slice(0, 40)}@prisma-os`,
        summary: `${e.clientName}: ${e.title}`,
        description: `${EDITORIAL_FORMAT_LABELS[e.format]}${e.planApproved ? "" : " (linha editorial em rascunho)"}`,
        url: `${base}${e.contentItemId ? `/conteudos/${e.contentItemId}` : `/clientes/${e.clientId}?aba=editorial&mes=${e.date.slice(0, 7)}`}`,
        date: e.date,
      });
    }
  }
  for (const p of await listPublications(auth, { status: "scheduled", limit: 300 })) {
    events.push({
      uid: `publicacao-${p.id}@prisma-os`,
      summary: `Publicar no ${NETWORK_LABELS[p.network]}: ${p.contentTitle ?? p.title} (${p.clientName})`,
      description: `Conta ${p.accountLabel}`,
      url: `${base}/publicacoes`,
      at: new Date(p.scheduledAt),
    });
  }
  return buildIcs(`PRISMA OS · ${auth.organizationName}`, events);
}
