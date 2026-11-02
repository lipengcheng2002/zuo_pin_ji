import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashAgentApiKey } from "@/lib/agents/admin";
import { AGENT_LIMITS } from "@/lib/agent/config";
import { runAgent } from "@/lib/agent/runtime";
import {
  appendAudit,
  demoUserId,
  findAgentApiKey,
  getAgentBySlug,
  noteAgentApiKeyUse,
} from "@/lib/store/db";
import {
  NO_STORE,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

const invokeSchema = z.object({
  message: z.string().min(1).max(AGENT_LIMITS.messageMaxChars),
  conversationId: z
    .string()
    .regex(/^[A-Za-z0-9._:-]{8,80}$/, "conversationId 格式不合法")
    .optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Params }) {
  const { slug } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent || agent.status !== "published") {
    return jsonError("Agent 不存在或未上架", 404);
  }
  const version = agent.publishedVersion;
  return Response.json(
    {
      agent: {
        slug: agent.slug,
        name: agent.name,
        description: agent.description,
        version,
        promptVersion: agent.config.promptVersion,
        channels: agent.channels,
        tools: agent.config.tools,
        status: agent.status,
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { slug } = await params;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return jsonError("缺少 Agent 调用 Key", 401);

  const found = await findAgentApiKey(hashAgentApiKey(token));
  if (!found || !found.key.scopes.includes("invoke")) {
    return jsonError("Agent 调用 Key 无效或已撤销", 401);
  }
  if (found.agent.slug !== slug) return jsonError("Key 与 Agent 不匹配", 403);
  if (found.agent.status !== "published") {
    return jsonError("Agent 已下架，暂不可调用", 409);
  }

  const limit = rateLimit(`agent-key:${found.key.id}`, 20, 60_000);
  if (!limit.allowed) return jsonError("调用过于频繁", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = invokeSchema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const sessionId =
    parsed.data.conversationId ?? `api_${randomBytes(9).toString("base64url")}`;
  try {
    const result = await runAgent({
      sessionId,
      userId: demoUserId,
      message: parsed.data.message,
    });
    await noteAgentApiKeyUse(found.key.id);
    await appendAudit({
      operatorId: null,
      operatorName: "Agent API",
      action: "agent.invoked",
      resource: `agent/${found.agent.id}`,
      detail: `${found.key.prefix}… · v${found.agent.publishedVersion} · ${result.trace.intent} · ${result.trace.latencyMs}ms`,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? "",
      severity: "info",
    });
    return Response.json(
      {
        ok: true,
        agent: {
          slug: found.agent.slug,
          version: found.agent.publishedVersion,
          promptVersion: result.trace.promptVersion,
        },
        conversationId: sessionId,
        message: result.message,
        trace: result.trace,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[agent-api] invoke failed", (error as Error).message);
    return jsonError("Agent 调用失败", 500);
  }
}
