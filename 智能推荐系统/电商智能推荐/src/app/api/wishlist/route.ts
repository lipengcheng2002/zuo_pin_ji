import type { NextRequest } from "next/server";
import { z } from "zod";
import { PRODUCT_MAP } from "@/lib/data/catalog";
import { appendEvent, getWishlist, toggleWishlist } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { ensureSessionId } from "@/lib/store/session";
import { NO_STORE, assertSameOrigin, clientIp, jsonError, rateLimit } from "@/lib/security";

const schema = z.object({ productId: z.string().min(1).max(40) });

export async function GET() {
  const items = await getWishlist(await currentUserId());
  return Response.json({ items }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const limit = rateLimit(`wishlist:${clientIp(request)}`, 60, 60000);
  if (!limit.allowed) return jsonError("操作过于频繁，请稍后再试", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError("商品参数不合法");
  const product = PRODUCT_MAP[parsed.data.productId];
  if (!product) return jsonError("商品不存在", 404);

  const sessionId = await ensureSessionId();
  const userId = await currentUserId();
  const result = await toggleWishlist(userId, product.id);
  if (result.wishlisted) {
    await appendEvent({
      userId,
      type: "wishlist",
      productId: product.id,
      scene: "wishlist",
      weight: 3.5,
      sessionId,
    });
  }
  return Response.json(result, { headers: NO_STORE });
}
