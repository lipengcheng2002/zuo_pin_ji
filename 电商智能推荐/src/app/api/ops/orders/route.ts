import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { appendAudit, transitionOrder } from "@/lib/store/db";
import {
  NO_STORE,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  orderNo: z.string().min(6).max(32),
  action: z.enum(["ship", "complete", "refund"]),
  trackingNo: z.string().min(4).max(60).optional(),
  amount: z.number().int().min(0).max(999999).optional(),
});

const authorized = (request: NextRequest): boolean => {
  const configured = process.env.OPS_TOKEN?.trim();
  if (!configured) return false;
  const header = request.headers.get("authorization") ?? "";
  const actual = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(actual);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(request: NextRequest) {
  const configured = process.env.OPS_TOKEN?.trim();
  if (!configured) {
    return jsonError("履约接口未启用：请配置 OPS_TOKEN", 503);
  }
  if (!authorized(request)) {
    return jsonError("未授权的履约请求", 401);
  }
  const ip = clientIp(request);
  const limit = rateLimit(`ops:orders:${ip}`, 60, 60_000);
  if (!limit.allowed) return jsonError("操作过于频繁", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const result = await transitionOrder({
    orderNo: parsed.data.orderNo,
    action: parsed.data.action,
    trackingNo: parsed.data.trackingNo,
    amount: parsed.data.amount,
    actor: "oms",
  });
  if (!result.ok) return jsonError(result.error, 409);

  await appendAudit({
    operatorId: null,
    operatorName: "OMS",
    action:
      parsed.data.action === "refund"
        ? "order.refund"
        : parsed.data.action === "ship"
          ? "order.shipped"
          : "order.completed",
    resource: `order/${result.order.orderNo}`,
    detail:
      parsed.data.action === "refund"
        ? `退款 ¥${result.order.refundAmount ?? result.order.total} · 原路退回`
        : parsed.data.action === "ship"
          ? `发货 · 运单 ${result.order.trackingNo ?? "-"}`
          : "订单完成",
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: parsed.data.action === "refund" ? "warning" : "info",
  });

  return Response.json({ ok: true, order: result.order }, { headers: NO_STORE });
}
