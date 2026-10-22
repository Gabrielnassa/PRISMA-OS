import { apiAuth, jsonError } from "@/server/http";
import { getMediaFile } from "@/server/services/media";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await apiAuth();
    const { id } = await params;
    const file = await getMediaFile(auth, id);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers({
      "content-type": file.mimeType,
      "content-length": String(file.data.length),
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    });
    // SVG enviado por usuários nunca executa scripts no domínio da aplicação.
    if (file.mimeType === "image/svg+xml") headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return new Response(new Uint8Array(file.data), { headers });
  } catch (err) {
    return jsonError(err);
  }
}
