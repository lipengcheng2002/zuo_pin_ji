import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/customer-auth";
import {
  WECHAT_STATE_COOKIE,
  WECHAT_STATE_TTL_SECONDS,
  buildWechatAuthorizeUrl,
  newWechatState,
  oauthCallbackUrl,
  sealOAuthState,
  wechatOAuthConfigured,
  wechatScope,
} from "@/lib/wechat";

export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next") ?? undefined);
  const appId = process.env.WECHAT_APP_ID?.trim();
  const secret = process.env.WECHAT_APP_SECRET?.trim();
  if (!wechatOAuthConfigured() || !appId || !secret) {
    const target = new URL("/login", request.url);
    target.searchParams.set("wechat", "unconfigured");
    target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  }

  const state = newWechatState();
  const redirectUri = oauthCallbackUrl(request.nextUrl.origin);
  const authorizeUrl = buildWechatAuthorizeUrl({
    appId,
    redirectUri,
    state,
    scope: wechatScope(),
  });
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(WECHAT_STATE_COOKIE, sealOAuthState(state, next, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WECHAT_STATE_TTL_SECONDS,
  });
  return response;
}
