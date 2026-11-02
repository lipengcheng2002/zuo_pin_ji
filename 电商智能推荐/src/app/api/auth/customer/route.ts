import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE,
  currentCustomer,
} from "@/lib/customer-auth";
import {
  appendAudit,
  revokeCustomerSession,
} from "@/lib/store/db";
import {
  assertSameOrigin,
  clientIp,
  NO_STORE,
} from "@/lib/security";

export async function DELETE(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  const customer = await currentCustomer();
  if (token) await revokeCustomerSession(token);
  jar.delete(CUSTOMER_COOKIE);
  if (customer) {
    await appendAudit({
      operatorId: null,
      operatorName: customer.nickname,
      action: "customer.logout",
      resource: `customer/${customer.id}`,
      detail: "会员主动退出登录",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? "",
      severity: "info",
    });
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}
