import type { NextRequest } from "next/server";
import { z } from "zod";
import { PRODUCT_MAP } from "@/lib/data/catalog";
import { appendEvent, getCart, getStore, saveCart } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { availableFor, committedStock } from "@/lib/commerce/inventory";
import { ensureSessionId } from "@/lib/store/session";
import {
  addLine,
  priceCart,
  removeLine,
  updateLineQty,
} from "@/lib/commerce/pricing";
import {
  NO_STORE,
  assertSameOrigin,
  jsonError,
  zodMessage,
} from "@/lib/security";

const cartActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    productId: z.string().min(1).max(40),
    size: z.string().min(1).max(16),
    color: z.string().min(1).max(24),
    qty: z.number().int().min(1).max(9).optional(),
  }),
  z.object({
    action: z.literal("update"),
    index: z.number().int().min(0).max(60),
    qty: z.number().int().min(0).max(9),
  }),
  z.object({
    action: z.literal("remove"),
    index: z.number().int().min(0).max(60),
  }),
  z.object({
    action: z.literal("coupon"),
    code: z.string().max(24),
  }),
]);

export async function GET() {
  const sessionId = await ensureSessionId();
  const cart = await getCart(sessionId);
  return Response.json({ cart: priceCart(cart) }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const sessionId = await ensureSessionId();
  const userId = await currentUserId();
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = cartActionSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const input = parsed.data;
  const cart = await getCart(sessionId);

  if (input.action === "add") {
    const product = PRODUCT_MAP[input.productId];
    if (!product) return jsonError("商品不存在", 404);
    const size = product.sizes.find((option) => option.label === input.size);
    if (!size) return jsonError("该尺码不存在");
    if (size.stock <= 0) return jsonError("该尺码暂时缺货");
    const color = product.colors.find((option) => option.name === input.color);
    if (!color) return jsonError("该颜色不存在");

    const state = await getStore();
    const available = availableFor(product, size.label, committedStock(state.orders));
    const existing = cart.lines.find(
      (line) =>
        line.productId === product.id &&
        line.size === size.label &&
        line.color === color.name,
    );
    const desired = (existing?.qty ?? 0) + (input.qty ?? 1);
    if (desired > available) {
      return jsonError(`该尺码库存仅剩 ${available} 件`, 409);
    }

    const next = addLine(cart, {
      productId: product.id,
      size: size.label,
      color: color.name,
      qty: input.qty ?? 1,
    });
    await saveCart({ ...next, userId });
    await appendEvent({
      userId,
      type: "add_to_cart",
      productId: product.id,
      scene: "cart",
      weight: 5,
      sessionId,
    });
    return Response.json({ cart: priceCart(next) }, { headers: NO_STORE });
  }

  if (input.action === "update") {
    const line = cart.lines[input.index];
    if (line && input.qty > 0) {
      const product = PRODUCT_MAP[line.productId];
      if (product) {
        const state = await getStore();
        const available = availableFor(
          product,
          line.size,
          committedStock(state.orders),
        );
        if (input.qty > available) {
          return jsonError(`该尺码库存仅剩 ${available} 件`, 409);
        }
      }
    }
    const next = updateLineQty(cart, input.index, input.qty);
    await saveCart({ ...next, userId });
    return Response.json({ cart: priceCart(next) }, { headers: NO_STORE });
  }

  if (input.action === "remove") {
    const next = removeLine(cart, input.index);
    await saveCart({ ...next, userId });
    return Response.json({ cart: priceCart(next) }, { headers: NO_STORE });
  }

  const code = input.code.trim().toUpperCase();
  const next = { ...cart, couponCode: code || null };
  await saveCart({ ...next, userId });
  return Response.json({ cart: priceCart(next) }, { headers: NO_STORE });
}
