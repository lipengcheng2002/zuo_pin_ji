import { cookies } from "next/headers";

export const SESSION_COOKIE = "zy_sid";
export const USER_COOKIE = "zy_uid";

const NEW_SESSION = () => `s_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

/** Read the current session id without mutating cookies (safe in RSC). */
export async function getSessionId(): Promise<string> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? "s_anonymous_web";
}

/** Ensure a session id, setting the cookie when allowed (route handlers / actions). */
export async function ensureSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) return existing;
  const created = NEW_SESSION();
  try {
    jar.set(SESSION_COOKIE, created, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  } catch {
    // Server Components cannot set cookies; the next API call will persist it.
  }
  return created;
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(USER_COOKIE)?.value ?? null;
}

export async function setSessionUserId(userId: string): Promise<void> {
  const jar = await cookies();
  try {
    jar.set(USER_COOKIE, userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  } catch {
    // ignore in RSC context
  }
}
