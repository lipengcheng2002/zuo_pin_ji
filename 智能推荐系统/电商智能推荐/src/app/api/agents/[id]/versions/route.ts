import type { NextRequest } from "next/server";
import { authorizeAgentAdmin } from "@/lib/agents/admin";
import { getAgentById, listAgentVersions } from "@/lib/store/db";
import { NO_STORE, jsonError } from "@/lib/security";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const authError = authorizeAgentAdmin(request);
  if (authError) return authError;
  const { id } = await params;
  const agent = await getAgentById(id);
  if (!agent) return jsonError("Agent 不存在", 404);
  const versions = await listAgentVersions(id);
  return Response.json({ agentId: id, versions }, { headers: NO_STORE });
}
