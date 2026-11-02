import type { NextRequest } from "next/server";
import { z } from "zod";
import { listAgentLogs, rateAgentLog } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { ensureSessionId } from "@/lib/store/session";
import { NO_STORE, assertSameOrigin, jsonError } from "@/lib/security";

const schema = z.object({
  rating: z.enum(["up", "down"]),
  logId: z.string().max(60).optional(),
});

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError("反馈参数不合法");

  const sessionId = await ensureSessionId();
  const userId = await currentUserId();
  const logs = await listAgentLogs(120);
  const target = parsed.data.logId
    ? logs.find((log) => log.id === parsed.data.logId && log.userId === userId)
    : logs.find((log) => log.sessionId === sessionId && log.userId === userId);
  if (!target) return jsonError("未找到对应对话记录", 404);
  await rateAgentLog(target.id, parsed.data.rating);
  return Response.json({ ok: true, logId: target.id }, { headers: NO_STORE });
}
