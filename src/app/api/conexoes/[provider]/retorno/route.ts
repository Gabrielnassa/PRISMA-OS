import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth/next";
import { AppError, toUserMessage } from "@/server/errors";
import { APP_PROVIDERS, type AppProvider } from "@/server/services/integration-apps";
import { finishConnection } from "@/server/services/social-accounts";

/** Volta do login da plataforma: guarda a conta e leva para a aba Redes do cliente. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const auth = await getAuth();
  if (!auth || auth.mustChangePassword) return NextResponse.redirect(new URL("/login", url), 303);
  if (!(APP_PROVIDERS as readonly string[]).includes(provider)) return NextResponse.redirect(new URL("/clientes", url), 303);
  try {
    const r = await finishConnection(auth, provider as AppProvider, {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error") ?? url.searchParams.get("error_code"),
    });
    const target = r.kind === "choose" ? `/clientes/${r.clientId}?aba=redes&escolher=${r.stateId}` : `/clientes/${r.clientId}?aba=redes&ok=${encodeURIComponent(r.message)}`;
    return NextResponse.redirect(new URL(target, url), 303);
  } catch (err) {
    if (!(err instanceof AppError)) console.error(JSON.stringify({ level: "error", msg: "oauth.callback_failed", provider, error: (err as Error).message }));
    return NextResponse.redirect(new URL(`/clientes?erro=${encodeURIComponent(toUserMessage(err))}`, url), 303);
  }
}
