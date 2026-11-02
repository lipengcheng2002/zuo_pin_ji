import type { NextRequest } from "next/server";
import { authorizeAgentAdmin } from "@/lib/agents/admin";
import { appendAudit, revokeAgentApiKey } from "@/lib/store/db";
import { NO_STORE, clientIp, jsonError } from "@/lib/security";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; keyId: string }>;

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const { id, keyId } = await params;
  const key = await revokeAgentApiKey(id, keyId);
  if (!key) return jsonError("Key 不存在", 404);

  await appendAudit({
    operatorId: null,
    operatorName: "Agent Platform",
    action: "agent.key_revoked",
    resource: `agent/${id}/key/${keyId}`,
    detail: `撤销调用 Key ${key.name} · ${key.prefix}…`,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? "",
    severity: "warning",
  });

  return Response.json(
    { ok: true, key: { id: key.id, revokedAt: key.revokedAt } },
    { headers: NO_STORE },
  );
}
