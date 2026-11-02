import type { NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE,
  customerCookieOptions,
  demoAuthEnabled,
  toCustomerView,
} from "@/lib/customer-auth";
import {
  appendAudit,
  createCustomerSession,
  upsertCustomer,
} from "@/lib/store/db";
import {
  assertSameOrigin,
  clientIp,
  jsonError,
  NO_STORE,
  rateLimit,
  rateLimited,
} from "@/lib/security";

const schema = z.object({
  consent: z.boolean().refine((value) => value, "请先同意会员服务协议与隐私政策"),
});

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const ip = clientIp(request);
  const limit = rateLimit(`customer:wechat:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimited(limit.retryAfter, "登录尝试过于频繁，请稍后再试");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "请先同意协议");

  if (!demoAuthEnabled()) {
    return jsonError(
      "微信 OAuth 尚未完成配置；请接入微信开放平台后关闭 DEMO_AUTH，或使用手机号登录",
      503,
    );
  }

  const customer = await upsertCustomer({
    wechatOpenId: "demo_wechat_member",
    source: "wechat",
  });
  const { token } = await createCustomerSession({
    customerId: customer.id,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
  });
  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, token, customerCookieOptions);

  await appendAudit({
    operatorId: null,
    operatorName: customer.nickname,
    action: "customer.login",
    resource: `customer/${customer.id}`,
    detail: "微信一键登录（演示授权）",
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "info",
  });

  return Response.json(
    { ok: true, customer: toCustomerView(customer) },
    { headers: NO_STORE },
  );
}
