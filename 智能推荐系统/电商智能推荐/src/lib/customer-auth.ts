import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CUSTOMER_TTL_MS,
  demoUserId,
  findCustomerSession,
} from "@/lib/store/db";
import type { Customer, CustomerSource } from "@/lib/store/types";

export const CUSTOMER_COOKIE = "zy_customer";

export const customerCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(CUSTOMER_TTL_MS / 1000),
};

export type CustomerView = {
  id: string;
  nickname: string;
  phoneMasked: string | null;
  source: CustomerSource;
  avatarTone: string;
};

export const maskPhone = (phone: string | null): string | null => {
  if (!phone || phone.length < 7) return null;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
};

export const toCustomerView = (customer: Customer): CustomerView => ({
  id: customer.id,
  nickname: customer.nickname,
  phoneMasked: maskPhone(customer.phone),
  source: customer.source,
  avatarTone: customer.avatarTone,
});

export async function currentCustomer(): Promise<Customer | null> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const found = await findCustomerSession(token);
  return found?.customer ?? null;
}

export async function currentUserId(): Promise<string> {
  const customer = await currentCustomer();
  return customer?.userId ?? demoUserId;
}

export async function requireCustomer(nextPath: string): Promise<Customer> {
  const customer = await currentCustomer();
  if (!customer) {
    redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  }
  return customer;
}

export function safeNextPath(value: string | undefined, fallback = "/account"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/login/")) {
    return fallback;
  }
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

export function demoAuthEnabled(): boolean {
  return process.env.DEMO_AUTH !== "false";
}

export function hashOtp(phone: string, code: string): string {
  return createHash("sha256")
    .update(`zhiyan-otp:${phone}:${code}`)
    .digest("hex");
}
