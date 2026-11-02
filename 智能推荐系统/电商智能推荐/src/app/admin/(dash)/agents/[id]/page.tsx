import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAgentById,
  listAgentApiKeys,
  listAgentVersions,
} from "@/lib/store/db";
import { AgentAdminPanel } from "@/components/admin/AgentAdminPanel";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function AdminAgentPage({ params }: { params: Params }) {
  const { id } = await params;
  const agent = await getAgentById(id);
  if (!agent) notFound();
  const [versions, keys] = await Promise.all([
    listAgentVersions(id),
    listAgentApiKeys(id),
  ]);
  const publicKeys = keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
  }));

  return (
    <div className="space-y-4">
      <Link href="/admin" className="inline-flex items-center gap-1 text-[9px] text-muted hover:text-ink">
        <Icon name="arrow-left" size={10} />
        返回 Agent 列表
      </Link>
      <AgentAdminPanel agent={agent} versions={versions} keys={publicKeys} />
    </div>
  );
}
