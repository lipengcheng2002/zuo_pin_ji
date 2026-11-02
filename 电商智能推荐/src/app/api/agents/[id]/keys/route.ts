import type { NextRequest } from "next/server";
import {
  authorizeAgentAdmin,
  generateAgentApiKey,
  AGENT_ADMIN_ACTOR,
} from "@/lib/agents/admin";
import { createAgentKeySchema } from "@/lib/agents/validation";
import {
  appendAudit,
  createAgentApiKey,
  getAgentById,
  listAgentApiKeys,
} from "@/lib/store/db";
import {
  NO_STORE,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const publicKey = (key: Awaited<ReturnType<typeof listAgentApiKeys>>[number]) => ({
  id: key.id,
  agentId: key.agentId,
  name: key.name,
  prefix: key.prefix,
  scopes: key.scopes,
  createdAt: key.createdAt,
  createdBy: key.createdBy,
  lastUsedAt: key.lastUsedAt,
  expiresAt: key.expiresAt,
  revokedAt: key.revokedAt,
});

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const { id } = await params;
  const agent = await getAgentById(id);
  if (!agent) return jsonError("Agent 不存在", 404);
  const keys = await listAgentApiKeys(id);
  return Response.json({ keys: keys.map(publicKey) }, { headers: NO_STORE });
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const ip = clientIp(request);
  const limit = rateLimit(`agents:key:${ip}`, 20, 60_000);
  if (!limit.allowed) return jsonError("操作过于频繁", 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = createAgentKeySchema.safeParse(payload ?? {});
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const { id } = await params;
  const agent = await getAgentById(id);
  if (!agent) return jsonError("Agent 不存在", 404);

  const generated = generateAgentApiKey();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86400000).toISOString()
    : null;
  const key = await createAgentApiKey({
    agentId: id,
    name: parsed.data.name,
    prefix: generated.prefix,
    keyHash: generated.hash,
    scopes: parsed.data.scopes,
    expiresAt,
    actor: AGENT_ADMIN_ACTOR,
  });

  await appendAudit({
    operatorId: null,
    operatorName: "Agent Platform",
    action: "agent.key_created",
    resource: `agent/${id}/key/${key.id}`,
    detail: `创建调用 Key ${key.name} · ${key.prefix}… · scopes ${key.scopes.join(",")}`,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "warning",
  });

  return Response.json(
    {
      ok: true,
      key: publicKey(key),
      token: generated.token,
      warning: "token 只显示一次，请立即写入平台密钥管理服务",
    },
    { status: 201, headers: NO_STORE },
  );
}
