import type { NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE,
  customerCookieOptions,
  hashOtp,
  maskPhone,
  toCustomerView,
} from "@/lib/customer-auth";
import {
  appendAudit,
  consumeCustomerOtp,
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
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  code: z.string().regex(/^\d{6}$/, "请输入 6 位验证码"),
  consent: z.boolean().refine((value) => value, "请先同意会员服务协议与隐私政策"),
});

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const ip = clientIp(request);
  const ipLimit = rateLimit(`customer:login:${ip}`, 12, 60_000);
  if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfter, "登录尝试过于频繁，请稍后再试");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "登录信息不完整");
  const { phone } = parsed.data;

  const phoneLimit = rateLimit(`customer:login:phone:${phone}`, 6, 10 * 60_000);
  if (!phoneLimit.allowed) return rateLimited(phoneLimit.retryAfter, "该手机号尝试次数过多，请稍后再试");

  const result = await consumeCustomerOtp(phone, hashOtp(phone, parsed.data.code));
  if (result === "missing" || result === "expired") {
    return jsonError("验证码已失效，请重新获取", 401);
  }
  if (result === "invalid") return jsonError("验证码不正确", 401);
  if (result === "locked") return jsonError("验证码错误次数过多，请重新获取", 429);

  const customer = await upsertCustomer({ phone, source: "phone" });
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
    detail: `手机号 ${maskPhone(phone)} 登录成功`,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "info",
  });

  return Response.json(
    { ok: true, customer: toCustomerView(customer) },
    { headers: NO_STORE },
  );
}
