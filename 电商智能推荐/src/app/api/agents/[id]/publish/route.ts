import type { NextRequest } from "next/server";
import { authorizeAgentAdmin, AGENT_ADMIN_ACTOR } from "@/lib/agents/admin";
import { publishAgentSchema } from "@/lib/agents/validation";
import { appendAudit, publishAgent } from "@/lib/store/db";
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
  const limit = rateLimit(`agents:publish:${ip}`, 30, 60_000);
  if (!limit.allowed) return jsonError("操作过于频繁", 429);

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }
  const parsed = publishAgentSchema.safeParse(payload ?? {});
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const { id } = await params;
  const result = await publishAgent(id, parsed.data.note ?? "", AGENT_ADMIN_ACTOR);
  if (!result.ok) return jsonError(result.error, 409);

  await appendAudit({
    operatorId: null,
    operatorName: "Agent Platform",
    action: "agent.published",
    resource: `agent/${result.agent.id}`,
    detail: `上架 v${result.version.version} · ${result.agent.slug}`,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "info",
  });

  return Response.json(
    { ok: true, agent: result.agent, version: result.version },
    { headers: NO_STORE },
  );
}
