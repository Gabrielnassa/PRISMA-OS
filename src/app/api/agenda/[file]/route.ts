import { calendarFeedIcs } from "@/server/services/calendar-feed";

/** Agenda privada (ICS) para assinar no Google Agenda, Apple Calendário ou Outlook. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const token = file.replace(/\.ics$/, "");
  const ics = await calendarFeedIcs(token).catch((err: unknown) => {
    console.error(JSON.stringify({ level: "error", msg: "calendar.feed_failed", error: (err as Error).message }));
    return null;
  });
  if (!ics) return new Response("Agenda não encontrada", { status: 404 });
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=600", "content-disposition": 'inline; filename="prisma-os.ics"' } });
}
