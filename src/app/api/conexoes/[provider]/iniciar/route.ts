import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth/next";
import { toUserMessage } from "@/server/errors";
import { APP_PROVIDERS, type AppProvider } from "@/server/services/integration-apps";
import { startConnection } from "@/server/services/social-accounts";

/** Leva ao login oficial da plataforma para conectar a conta de um cliente. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const clientId = url.searchParams.get("cliente") ?? "";
  const back = (msg: string) => NextResponse.redirect(new URL(`/clientes/${encodeURIComponent(clientId)}?aba=redes&erro=${encodeURIComponent(msg)}`, url), 303);
  const auth = await getAuth();
  if (!auth || auth.mustChangePassword) return NextResponse.redirect(new URL("/login", url), 303);
  if (!(APP_PROVIDERS as readonly string[]).includes(provider)) return back("Plataforma desconhecida.");
  try {
    return NextResponse.redirect(await startConnection(auth, clientId, provider as AppProvider), 303);
  } catch (err) {
    return back(toUserMessage(err));
  }
}
