import type { NextRequest } from "next/server";
import { z } from "zod";
import { appendAudit, findOrderByNo, setOrderStatus } from "@/lib/store/db";
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

const schema = z.object({
  orderNo: z.string().min(6).max(32),
  action: z.enum(["cancel", "return"]),
});

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const ip = clientIp(request);
  const limit = rateLimit(`order-actions:${ip}`, 20, 60_000);
  if (!limit.allowed) return jsonError("操作过于频繁，请稍后再试", 429);
  await ensureSessionId();
  const userId = await currentUserId();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const order = await findOrderByNo(parsed.data.orderNo);
  if (!order || order.userId !== userId) {
    return jsonError("订单不存在", 404);
  }

  if (parsed.data.action === "cancel") {
    if (order.status !== "待发货") {
      return jsonError("只有待发货订单可以取消", 409);
    }
    const updated = await setOrderStatus({
      orderNo: order.orderNo,
      userId,
      status: "已取消",
      actor: "customer",
    });
    await appendAudit({
      operatorId: null,
      operatorName: "前台客户",
      action: "order.cancel",
      resource: `order/${order.orderNo}`,
      detail: `取消订单 · 释放 ¥${order.total} 的库存占用`,
      ip,
      userAgent: request.headers.get("user-agent") ?? "",
      severity: "warning",
    });
    return Response.json({ ok: true, order: updated }, { headers: NO_STORE });
  }

  if (order.status !== "已发货" && order.status !== "已完成") {
    return jsonError("只有已发货或已完成订单可以申请退货", 409);
  }
  const updated = await setOrderStatus({
    orderNo: order.orderNo,
    userId,
    status: "已退货",
    actor: "customer",
  });
  await appendAudit({
    operatorId: null,
    operatorName: "前台客户",
    action: "order.refund",
    resource: `order/${order.orderNo}`,
    detail: `退货申请 · 退款 ¥${order.total}`,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "warning",
  });
  return Response.json({ ok: true, order: updated }, { headers: NO_STORE });
}
