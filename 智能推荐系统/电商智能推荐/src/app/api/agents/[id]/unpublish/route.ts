import type { NextRequest } from "next/server";
import { authorizeAgentAdmin, AGENT_ADMIN_ACTOR } from "@/lib/agents/admin";
import { appendAudit, unpublishAgent } from "@/lib/store/db";
import { NO_STORE, clientIp, jsonError, rateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const ip = clientIp(request);
  const limit = rateLimit(`agents:unpublish:${ip}`, 30, 60_000);
  if (!limit.allowed) return jsonError("操作过于频繁", 429);

  const { id } = await params;
  const result = await unpublishAgent(id, AGENT_ADMIN_ACTOR);
  if (!result.ok) return jsonError(result.error, 409);

  await appendAudit({
    operatorId: null,
    operatorName: "Agent Platform",
    action: "agent.unpublished",
    resource: `agent/${result.agent.id}`,
    detail: `下架 ${result.agent.slug}；运行时立即拒绝新会话`,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "warning",
  });

  return Response.json({ ok: true, agent: result.agent }, { headers: NO_STORE });
}
