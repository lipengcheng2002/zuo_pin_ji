import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { jsonError, NO_STORE } from "@/lib/security";

export const AGENT_ADMIN_ACTOR = "agent-platform";
export const ADMIN_COOKIE = "zy_admin";
export const ADMIN_TTL_MS = 8 * 60 * 60 * 1000;

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(ADMIN_TTL_MS / 1000),
};

export function agentAdminConfigured(): boolean {
  return Boolean(process.env.AGENT_ADMIN_TOKEN?.trim());
}

export function verifyAgentAdminToken(value: string): boolean {
  const configured = process.env.AGENT_ADMIN_TOKEN?.trim();
  if (!configured) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sealAdminCookie(configured: string): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + ADMIN_TTL_MS }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", configured).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminCookie(value: string | undefined): boolean {
  const configured = process.env.AGENT_ADMIN_TOKEN?.trim();
  if (!configured || !value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", configured).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export async function isAdminAuthed(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value);
}

export function authorizeAgentAdmin(request: NextRequest): Response | null {
  const configured = process.env.AGENT_ADMIN_TOKEN?.trim();
  if (!configured) {
    return jsonError("Agent 管理接口未启用：请配置 AGENT_ADMIN_TOKEN", 503);
  }
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!verifyAgentAdminToken(bearer) && !verifyAdminCookie(cookie)) {
    return Response.json(
      { error: "未授权的 Agent 管理请求" },
      { status: 401, headers: NO_STORE },
    );
  }
  return null;
}

export function generateAgentApiKey(): {
  token: string;
  prefix: string;
  hash: string;
} {
  const token = `zya_${randomBytes(24).toString("base64url")}`;
  return {
    token,
    prefix: token.slice(0, 12),
    hash: hashAgentApiKey(token),
  };
}

export function hashAgentApiKey(token: string): string {
  return createHash("sha256").update(`zhiyan-agent-key:${token}`).digest("hex");
}
