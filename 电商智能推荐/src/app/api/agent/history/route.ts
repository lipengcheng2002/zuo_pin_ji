import type { NextRequest } from "next/server";
import { getRecentMessages, updateStore } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { ensureSessionId } from "@/lib/store/session";
import { NO_STORE, assertSameOrigin, jsonError } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionId = await ensureSessionId();
  const userId = await currentUserId();
  const messages = await getRecentMessages(sessionId, 12, userId);
  return Response.json(
    { messages, userId },
    { headers: NO_STORE },
  );
}

export async function DELETE(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const sessionId = await ensureSessionId();
  if (!sessionId) return jsonError("会话不存在", 400);
  await updateStore((state) => {
    const session = state.sessions[sessionId];
    if (session) {
      session.messages = [];
      session.lastSlots = {};
      session.updatedAt = new Date().toISOString();
    }
  });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
