import type { NextRequest } from "next/server";
import { authorizeAgentAdmin, AGENT_ADMIN_ACTOR } from "@/lib/agents/admin";
import { rollbackAgentSchema } from "@/lib/agents/validation";
import { appendAudit, rollbackAgent } from "@/lib/store/db";
import {
  NO_STORE,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const ip = clientIp(request);
  const limit = rateLimit(`agents:rollback:${ip}`, 20, 60_000);
  if (!limit.allowed) return jsonError("操作过于频繁", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = rollbackAgentSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const { id } = await params;
  const result = await rollbackAgent(id, parsed.data.version, AGENT_ADMIN_ACTOR);
  if (!result.ok) return jsonError(result.error, 409);

  await appendAudit({
    operatorId: null,
    operatorName: "Agent Platform",
    action: "agent.rollback",
    resource: `agent/${result.agent.id}`,
    detail: `以 v${parsed.data.version} 回滚并发布为 v${result.version.version}`,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "warning",
  });

  return Response.json(
    { ok: true, agent: result.agent, version: result.version },
    { headers: NO_STORE },
  );
}
