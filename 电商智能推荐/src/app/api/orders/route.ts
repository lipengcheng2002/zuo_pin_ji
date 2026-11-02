import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  appendAudit,
  appendEvent,
  createOrder,
  getCart,
  getOrdersForUser,
  getIdempotentOrder,
  getStore,
  saveCart,
} from "@/lib/store/db";
import { ensureSessionId } from "@/lib/store/session";
import { currentUserId } from "@/lib/customer-auth";
import { emptyCart, priceCart } from "@/lib/commerce/pricing";
import { availableFor, committedStock } from "@/lib/commerce/inventory";
import {
  NO_STORE,
  assertSameOrigin,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";
import type { Address } from "@/lib/types";

const addressSchema = z.object({
  name: z.string().min(1).max(24),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  province: z.string().min(1).max(24),
  city: z.string().min(1).max(24),
  district: z.string().min(1).max(24),
  detail: z.string().min(4).max(120),
});

const schema = z.object({
  address: addressSchema,
  paymentMethod: z.enum(["支付宝", "微信支付", "银联卡"]),
  couponCode: z.string().max(24).nullable().optional(),
  channel: z.enum(["官网", "AI 造型师", "小程序"]).optional(),
  note: z.string().max(200).optional(),
});

/** Serialises the validate-then-write window inside this process. */
let checkoutQueue: Promise<unknown> = Promise.resolve();
const withCheckoutLock = <T,>(task: () => Promise<T>): Promise<T> => {
  const run = checkoutQueue.then(task, task);
  checkoutQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

export async function GET() {
  const userId = await currentUserId();
  const orders = await getOrdersForUser(userId);
  return Response.json({ orders }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const ip = clientIp(request);
  const limit = rateLimit(`orders:${ip}`, 12, 60_000);
  if (!limit.allowed) return jsonError("下单过于频繁，请稍后再试", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const rawKey = request.headers.get("idempotency-key") ?? "";
  const idempotencyKey = /^[A-Za-z0-9._:-]{8,128}$/.test(rawKey) ? rawKey : null;

  const sessionId = await ensureSessionId();
  const userId = await currentUserId();

  return withCheckoutLock(async () => {
    if (idempotencyKey) {
      const replay = await getIdempotentOrder(idempotencyKey);
      if (replay && replay.userId === userId) {
        return Response.json(
          { order: replay, replayed: true },
          { status: 200, headers: { ...NO_STORE, "Idempotency-Replayed": "true" } },
        );
      }
    }

    const cart = await getCart(sessionId);
    if (!cart.lines.length) return jsonError("购物袋为空", 409);

    const priced = priceCart(cart, parsed.data.couponCode ?? cart.couponCode);
    if (!priced.lines.length) return jsonError("购物袋为空", 409);
    const invalid = priced.lines.find((line) => !line.valid);
    if (invalid) {
      return jsonError(invalid.issue ?? "部分商品库存不足，请调整数量", 409);
    }
    if (priced.summary.couponError) {
      return jsonError(priced.summary.couponError, 400);
    }

    const state = await getStore();
    const committed = committedStock(state.orders);
    for (const line of priced.lines) {
      const available = availableFor(line.product, line.size, committed);
      if (line.qty > available) {
        return jsonError(
          `${line.product.name}（${line.size}）库存仅剩 ${available} 件，请调整数量`,
          409,
        );
      }
    }

    const address: Address = {
      id: `addr_${Date.now().toString(36)}`,
      ...parsed.data.address,
      isDefault: true,
    };

    const order = await createOrder({
      userId,
      items: priced.lines.map((line) => ({
        productId: line.productId,
        name: line.product.name,
        size: line.size,
        color: line.color,
        qty: line.qty,
        unitPrice: line.unitPrice,
        art: line.product.editorial.art,
      })),
      subtotal: priced.summary.subtotal,
      discount: priced.summary.discount,
      shipping: priced.summary.shipping,
      total: priced.summary.total,
      status: "待发货",
      createdAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      address,
      paymentMethod: parsed.data.paymentMethod,
      channel: parsed.data.channel ?? "官网",
      paymentStatus: "paid",
      paymentProvider: "demo",
      paymentRef: `demo_${Date.now().toString(36)}`,
      pointsEarned: priced.summary.points,
      idempotencyKey: idempotencyKey ?? undefined,
      statusHistory: [
        { status: "待发货", at: new Date().toISOString(), by: "system" },
      ],
    }, idempotencyKey);

    await saveCart({
      ...emptyCart(sessionId),
      userId,
      lines: [],
    });

    await Promise.all(
      priced.lines.map((line) =>
        appendEvent({
          userId,
          type: "purchase",
          productId: line.productId,
          scene: "checkout",
          weight: 8,
          sessionId,
        }),
      ),
    );

    await appendAudit({
      operatorId: null,
      operatorName: "前台客户",
      action: "order.created",
      resource: `order/${order.orderNo}`,
      detail: `${order.items.length} 件 · 实付 ¥${order.total} · ${parsed.data.paymentMethod}`,
      ip,
      userAgent: request.headers.get("user-agent") ?? "",
      severity: "info",
    });

    return Response.json(
      { order, note: parsed.data.note ?? null, replayed: false },
      { status: 201, headers: NO_STORE },
    );
  });
}
