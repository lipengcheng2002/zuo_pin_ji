import type { NextRequest } from "next/server";
import { searchProducts } from "@/lib/engine/search";
import { NO_STORE, jsonError } from "@/lib/security";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").slice(0, 200);
  const rawLimit = Number(params.get("limit") ?? 24);
  const limit = Number.isFinite(rawLimit) ? Math.min(60, Math.max(1, rawLimit)) : 24;
  const category = params.get("category") ?? undefined;

  try {
    const result = searchProducts(q, {
      categories: category ? [category as never] : undefined,
      sort: "relevance",
    });
    return Response.json(
      {
        products: result.products.slice(0, limit),
        total: result.total,
        tookMs: result.tookMs,
        suggestions: result.suggestions,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[search] failed", error);
    return jsonError("检索服务暂时不可用", 503);
  }
}
