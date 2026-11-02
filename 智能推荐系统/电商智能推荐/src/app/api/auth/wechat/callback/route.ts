import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CUSTOMER_COOKIE,
  customerCookieOptions,
  safeNextPath,
} from "@/lib/customer-auth";
import {
  WECHAT_STATE_COOKIE,
  exchangeWechatCode,
  fetchWechatNickname,
  openOAuthState,
  wechatOAuthConfigured,
} from "@/lib/wechat";
import {
  appendAudit,
  createCustomerSession,
  upsertCustomer,
} from "@/lib/store/db";
import { clientIp, rateLimit } from "@/lib/security";

export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  const limit = rateLimit(`wechat:callback:${ip}`, 20, 60_000);
  if (!limit.allowed) {
    return failure(request, "failed", "/account");
  }

  const secret = process.env.WECHAT_APP_SECRET?.trim();
  const appId = process.env.WECHAT_APP_ID?.trim();
  if (!wechatOAuthConfigured() || !secret || !appId) {
    return failure(request, "unconfigured", "/account");
  }

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const parsed = openOAuthState(request.cookies.get(WECHAT_STATE_COOKIE)?.value, secret);
  if (!parsed || !state || parsed.state !== state) {
    return failure(request, "failed", parsed?.next ?? "/account");
  }
  if (params.get("error") || !code) {
    return failure(request, "denied", parsed.next);
  }

  try {
    const token = await exchangeWechatCode({ code, appId, appSecret: secret });
    const nickname = await fetchWechatNickname({
      accessToken: token.accessToken,
      openid: token.openid,
    });
    const customer = await upsertCustomer({
      wechatOpenId: token.openid,
      nickname: nickname ?? undefined,
      source: "wechat",
    });
    const { token: sessionToken } = await createCustomerSession({
      customerId: customer.id,
      ip,
      userAgent: request.headers.get("user-agent") ?? "",
    });
    await appendAudit({
      operatorId: null,
      operatorName: customer.nickname,
      action: "customer.login",
      resource: `customer/${customer.id}`,
      detail: "微信 OAuth 授权登录",
      ip,
      userAgent: request.headers.get("user-agent") ?? "",
      severity: "info",
    });

    const response = NextResponse.redirect(
      new URL(safeNextPath(parsed.next), request.url),
    );
    response.cookies.set(CUSTOMER_COOKIE, sessionToken, customerCookieOptions);
    response.cookies.set(WECHAT_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.warn(
      "[wechat] oauth callback failed",
      (error as Error).message.slice(0, 160),
    );
    return failure(request, "failed", parsed.next);
  }
}

function failure(request: NextRequest, reason: string, next: string): NextResponse {
  const target = new URL("/login", request.url);
  target.searchParams.set("wechat", reason);
  target.searchParams.set("next", safeNextPath(next));
  const response = NextResponse.redirect(target);
  response.cookies.set(WECHAT_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
