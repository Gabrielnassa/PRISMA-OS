import { readSignedFile } from "@/server/services/publications";

/**
 * Arquivo que a rede social baixa durante a publicação (Instagram e TikTok
 * pedem uma URL pública). Só responde com assinatura válida e dentro do prazo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const url = new URL(request.url);
  const f = await readSignedFile(id, file, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (!f) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: { "content-type": f.mimeType, "content-length": String(f.data.length), "cache-control": "private, no-store", "x-robots-tag": "noindex" } });
}
