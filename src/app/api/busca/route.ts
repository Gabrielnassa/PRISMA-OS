import { NextResponse } from "next/server";
import { apiAuth, jsonError } from "@/server/http";
import { quickSearch } from "@/server/services/search";

export async function GET(request: Request) {
  try {
    const auth = await apiAuth();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ hits: await quickSearch(auth, q) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return jsonError(err);
  }
}
