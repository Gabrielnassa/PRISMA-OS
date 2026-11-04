import { publicReportCover } from "@/server/services/reports";

/** Capa de uma peça do relatório enviado ao cliente. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; contentId: string }> }) {
  const { token, contentId } = await params;
  const png = await publicReportCover(token, contentId).catch(() => null);
  if (!png) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600", "x-robots-tag": "noindex" } });
}
