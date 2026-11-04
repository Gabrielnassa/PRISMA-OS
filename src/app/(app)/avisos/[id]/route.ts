import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth/next";
import { openInboxItem } from "@/server/services/inbox";

/** Abre um aviso (marca como lido) e leva para onde ele aponta. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  const url = new URL(request.url);
  if (!auth) return NextResponse.redirect(new URL("/login", url), 303);
  const { id } = await params;
  return NextResponse.redirect(new URL(await openInboxItem(auth, id), url), 303);
}
