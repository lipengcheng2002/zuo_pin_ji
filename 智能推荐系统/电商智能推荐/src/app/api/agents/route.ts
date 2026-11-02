import type { NextRequest } from "next/server";
import { authorizeAgentAdmin, AGENT_ADMIN_ACTOR } from "@/lib/agents/admin";
import { createAgentSchema } from "@/lib/agents/validation";
import { defaultAgent } from "@/lib/data/agent-registry";
import { appendAudit, createAgent, listAgents } from "@/lib/store/db";
import type { AgentRuntimeConfig } from "@/lib/store/types";
import {
  NO_STORE,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const status = request.nextUrl.searchParams.get("status");
  const all = await listAgents();
  const agents = status
    ? all.filter((agent) => agent.status === status)
    : all;
  return Response.json(
    {
      agents,
      counts: {
        total: all.length,
        draft: all.filter((agent) => agent.status === "draft").length,
        published: all.filter((agent) => agent.status === "published").length,
        unpublished: all.filter((agent) => agent.status === "unpublished").length,
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const ip = clientIp(request);
  const limit = rateLimit(`agents:create:${ip}`, 30, 60_000);
  if (!limit.allowed) return jsonError("操作过于频繁", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = createAgentSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const result = await createAgent({
    ...parsed.data,
    owner: parsed.data.owner ?? "agent-team",
    channels: parsed.data.channels,
    config: (parsed.data.config ?? defaultAgent().config) as AgentRuntimeConfig,
    actor: AGENT_ADMIN_ACTOR,
  });
  if (!result.ok) return jsonError(result.error, 409);

  await appendAudit({
    operatorId: null,
    operatorName: "Agent Platform",
    action: "agent.created",
    resource: `agent/${result.agent.id}`,
    detail: `创建草稿 ${result.agent.slug} · ${result.agent.name}`,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "info",
  });

  return Response.json({ ok: true, agent: result.agent }, { status: 201, headers: NO_STORE });
}
