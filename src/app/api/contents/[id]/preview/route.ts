import { NextResponse } from "next/server";
import { apiAuth, assertSameOrigin, jsonError } from "@/server/http";
import { previewDocument } from "@/server/services/render-access";
import { assertCan } from "@/server/authz/permissions";

/** Pré-visualização de um documento ainda não salvo (render + controle de qualidade). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const auth = await apiAuth();
    assertCan(auth.role, "content.edit");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const { slides, quality } = await previewDocument(auth, id, body?.document);
    return NextResponse.json({
      slides: slides.map((s) => ({ index: s.index, slideId: s.slideId, svg: s.svg, width: s.width, height: s.height })),
      quality,
    });
  } catch (err) {
    return jsonError(err);
  }
}
