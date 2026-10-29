import { renderPublicSlide } from "@/server/services/approval-links";

/** Imagem de uma lâmina para a página pública de aprovação. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; index: string }> }) {
  const { token, index } = await params;
  const png = await renderPublicSlide(token, Number(index)).catch(() => null);
  if (!png) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300", "x-robots-tag": "noindex" } });
}
