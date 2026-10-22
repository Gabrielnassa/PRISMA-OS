import { NextResponse } from "next/server";
import { healthChecks } from "@/server/services/health";

/**
 * Verificação de saúde para orquestradores e monitoramento. Não exige login e
 * não expõe dados de clientes nem segredos. 503 quando algo essencial falha.
 */
export async function GET() {
  const result = await healthChecks();
  return NextResponse.json(
    { status: result.ok ? "ok" : "degraded", checks: result.checks.map((c) => ({ name: c.name, ok: c.ok })) },
    { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
