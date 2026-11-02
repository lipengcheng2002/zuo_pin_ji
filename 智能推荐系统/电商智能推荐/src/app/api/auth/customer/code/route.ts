import type { NextRequest } from "next/server";
import { z } from "zod";
import { demoAuthEnabled, hashOtp } from "@/lib/customer-auth";
import { saveCustomerOtp } from "@/lib/store/db";
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
});

const DEMO_OTP = /^\d{6}$/.test(process.env.DEMO_OTP_CODE ?? "")
  ? (process.env.DEMO_OTP_CODE as string)
  : "246810";

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const ip = clientIp(request);
  const ipLimit = rateLimit(`customer:otp:${ip}`, 8, 60_000);
  if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfter, "获取验证码过于频繁，请稍后再试");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "请输入有效手机号");
  const { phone } = parsed.data;

  const phoneLimit = rateLimit(`customer:otp:phone:${phone}`, 1, 30_000);
  if (!phoneLimit.allowed) {
    return rateLimited(phoneLimit.retryAfter, "验证码已发送，请稍后再试");
  }

  const demo = demoAuthEnabled();
  if (!demo) {
    return jsonError("短信服务尚未接入；请在 DEMO_AUTH=false 前配置短信供应商", 503);
  }

  const code = DEMO_OTP;
  await saveCustomerOtp({
    phone,
    codeHash: hashOtp(phone, code),
    ttlMs: 5 * 60_000,
  });

  return Response.json(
    {
      ok: true,
      expiresIn: 300,
      demo: true,
      demoCode: code,
    },
    { headers: NO_STORE },
  );
}
