import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { safeNextPath } from "@/lib/customer-auth";

export const WECHAT_STATE_COOKIE = "zy_wx_state";
export const WECHAT_STATE_TTL_SECONDS = 600;
export const WECHAT_AUTHORIZE_URL = "https://open.weixin.qq.com/connect/oauth2/authorize";
export const WECHAT_API_BASE = "https://api.weixin.qq.com";

export type WechatOAuthState = { state: string; next: string };

export function wechatOAuthConfigured(): boolean {
  return Boolean(
    process.env.WECHAT_APP_ID?.trim() && process.env.WECHAT_APP_SECRET?.trim(),
  );
}

export function wechatScope(): "snsapi_userinfo" | "snsapi_base" {
  return process.env.WECHAT_OAUTH_SCOPE === "snsapi_base" ? "snsapi_base" : "snsapi_userinfo";
}

export function buildWechatAuthorizeUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  scope?: "snsapi_userinfo" | "snsapi_base";
}): string {
  const params = new URLSearchParams({
    appid: input.appId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scope ?? "snsapi_userinfo",
    state: input.state,
  });
  return `${WECHAT_AUTHORIZE_URL}?${params.toString()}#wechat_redirect`;
}

export function newWechatState(): string {
  return randomBytes(18).toString("base64url");
}

export function sealOAuthState(
  state: string,
  next: string,
  secret: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({ state, next: safeNextPath(next) }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function openOAuthState(
  value: string | undefined,
  secret: string,
): WechatOAuthState | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<WechatOAuthState>;
    if (typeof parsed.state !== "string" || typeof parsed.next !== "string") {
      return null;
    }
    return { state: parsed.state, next: safeNextPath(parsed.next) };
  } catch {
    return null;
  }
}

export function oauthCallbackUrl(origin?: string): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || origin || "").replace(
    /\/+$/,
    "",
  );
  return `${site}/api/auth/wechat/callback`;
}

export type WechatToken = {
  openid: string;
  accessToken: string;
  unionid?: string;
};

export async function exchangeWechatCode(input: {
  code: string;
  appId: string;
  appSecret: string;
}): Promise<WechatToken> {
  const url = new URL(`${WECHAT_API_BASE}/sns/oauth2/access_token`);
  url.searchParams.set("appid", input.appId);
  url.searchParams.set("secret", input.appSecret);
  url.searchParams.set("code", input.code);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json = (await response.json()) as {
    openid?: string;
    access_token?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!response.ok || !json.openid || !json.access_token) {
    throw new Error(`wechat token exchange failed${json.errcode ? ` (${json.errcode})` : ""}`);
  }
  return {
    openid: json.openid,
    accessToken: json.access_token,
    unionid: json.unionid,
  };
}

export async function fetchWechatNickname(input: {
  accessToken: string;
  openid: string;
}): Promise<string | null> {
  try {
    const url = new URL(`${WECHAT_API_BASE}/sns/userinfo`);
    url.searchParams.set("access_token", input.accessToken);
    url.searchParams.set("openid", input.openid);
    url.searchParams.set("lang", "zh_CN");
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = (await response.json()) as { nickname?: string };
    const nickname = json.nickname?.trim().replace(/\s+/g, " ").slice(0, 24);
    return nickname || null;
  } catch {
    return null;
  }
}
