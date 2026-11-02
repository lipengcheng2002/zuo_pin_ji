import type { NextRequest } from "next/server";
import { authorizeAgentAdmin, AGENT_ADMIN_ACTOR } from "@/lib/agents/admin";
import { updateAgentSchema } from "@/lib/agents/validation";
import {
  appendAudit,
  getAgentById,
  listAgentVersions,
  updateAgent,
} from "@/lib/store/db";
import type { AgentRuntimeConfig } from "@/lib/store/types";
import {
  NO_STORE,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const { id } = await params;
  const agent = await getAgentById(id);
  if (!agent) return jsonError("Agent 不存在", 404);
  const versions = await listAgentVersions(id);
  return Response.json({ agent, versions }, { headers: NO_STORE });
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const ip = clientIp(request);
  const limit = rateLimit(`agents:update:${ip}`, 60, 60_000);
  if (!limit.allowed) return jsonError("操作过于频繁", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = updateAgentSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const { id } = await params;
  const agent = await updateAgent(
    id,
    {
      ...parsed.data,
      config: parsed.data.config
        ? (parsed.data.config as AgentRuntimeConfig)
        : undefined,
    },
    AGENT_ADMIN_ACTOR,
  );
  if (!agent) return jsonError("Agent 不存在", 404);

  await appendAudit({
    operatorId: null,
    operatorName: "Agent Platform",
    action: "agent.updated",
    resource: `agent/${agent.id}`,
    detail: `更新工作副本 ${Object.keys(parsed.data).join(", ")}`,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "info",
  });

  return Response.json({ ok: true, agent }, { headers: NO_STORE });
}
