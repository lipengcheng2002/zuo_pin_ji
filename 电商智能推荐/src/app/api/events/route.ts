import type { NextRequest } from "next/server";
import { z } from "zod";
import { PRODUCT_MAP } from "@/lib/data/catalog";
import { appendEvent } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { ensureSessionId } from "@/lib/store/session";
import {
  NO_STORE,
  assertSameOrigin,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";
import type { BehaviorType } from "@/lib/types";

const WEIGHTS: Record<BehaviorType, number> = {
  view: 1,
  click: 2,
  wishlist: 3.5,
  add_to_cart: 5,
  purchase: 8,
  search: 1.2,
  chat: 1.5,
};

const schema = z.object({
  type: z.enum(["view", "click", "search", "chat", "wishlist", "add_to_cart"]),
  productId: z.string().max(40).optional(),
  query: z.string().max(120).optional(),
  scene: z.string().max(40).default("web"),
});

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const limit = rateLimit(`events:${clientIp(request)}`, 180, 60000);
  if (!limit.allowed) return jsonError("事件上报过于频繁", 429, );

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  if (parsed.data.productId && !PRODUCT_MAP[parsed.data.productId]) {
    return jsonError("商品不存在", 404);
  }
  const sessionId = await ensureSessionId();
  const event = await appendEvent({
    userId: await currentUserId(),
    type: parsed.data.type,
    productId: parsed.data.productId,
    query: parsed.data.query,
    scene: parsed.data.scene,
    weight: WEIGHTS[parsed.data.type],
    sessionId,
  });
  return Response.json({ ok: true, eventId: event.id }, { headers: NO_STORE });
}
