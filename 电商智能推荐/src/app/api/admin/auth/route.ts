import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  sealAdminCookie,
  verifyAgentAdminToken,
} from "@/lib/agents/admin";
import { appendAudit } from "@/lib/store/db";
import {
  NO_STORE,
  assertSameOrigin,
  clientIp,
  jsonError,
  rateLimit,
} from "@/lib/security";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(1).max(300),
});

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const configured = process.env.AGENT_ADMIN_TOKEN?.trim();
  if (!configured) {
    return jsonError("管理端未启用：请配置 AGENT_ADMIN_TOKEN", 503);
  }
  const ip = clientIp(request);
  const limit = rateLimit(`admin-login:${ip}`, 8, 60_000);
  if (!limit.allowed) return jsonError("尝试过于频繁，请稍后再试", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError("请输入管理 Token");
  if (!verifyAgentAdminToken(parsed.data.token)) {
    await appendAudit({
      operatorId: null,
      operatorName: "Agent Admin",
      action: "admin.login_failed",
      resource: "admin",
      detail: "管理 Token 校验失败",
      ip,
      userAgent: request.headers.get("user-agent") ?? "",
      severity: "warning",
    });
    return jsonError("管理 Token 不正确", 401);
  }

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, sealAdminCookie(configured), adminCookieOptions);
  await appendAudit({
    operatorId: null,
    operatorName: "Agent Admin",
    action: "admin.login",
    resource: "admin",
    detail: "管理端登录成功",
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "info",
  });
  return Response.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  await appendAudit({
    operatorId: null,
    operatorName: "Agent Admin",
    action: "admin.logout",
    resource: "admin",
    detail: "管理端退出",
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "info",
  });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
