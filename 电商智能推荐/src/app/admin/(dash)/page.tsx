import Link from "next/link";
import { listAgents } from "@/lib/store/db";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  published: "border-moss/30 bg-[#eef1ec] text-moss",
  draft: "border-line-strong bg-paper text-muted",
  unpublished: "border-warning/30 bg-[#faf3e8] text-warning",
};

const STATUS_LABEL: Record<string, string> = {
  published: "已上架",
  draft: "草稿",
  unpublished: "已下架",
};

export default async function AdminOverviewPage() {
  const agents = await listAgents();
  const counts = {
    published: agents.filter((agent) => agent.status === "published").length,
    draft: agents.filter((agent) => agent.status === "draft").length,
    unpublished: agents.filter((agent) => agent.status === "unpublished").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Agent Registry · Lifecycle</p>
          <h1 className="display mt-2 text-[38px] leading-none md:text-[48px]">智能体管理端</h1>
          <p className="mt-2 text-[10.5px] leading-5 text-muted">
            草稿、上架、下架、不可变版本、回滚与调用 Key。管理端独立于用户端，不进入前台导航。
          </p>
        </div>
        <Link href="/admin/new" className="btn btn-primary h-10 shrink-0 px-4 text-[10px]">
          <Icon name="plus" size={12} />
          新建 Agent
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["全部 Agent", agents.length, "个"],
          ["已上架", counts.published, "个"],
          ["草稿", counts.draft, "个"],
          ["已下架", counts.unpublished, "个"],
        ].map(([label, value, unit]) => (
          <div key={label} className="border border-line bg-white p-4">
            <p className="text-[8.5px] uppercase tracking-[0.16em] text-muted">{label}</p>
            <p className="num mt-2 text-[28px] leading-none">
              {value}
              <span className="ml-1 text-[9px] font-sans text-muted">{unit}</span>
            </p>
          </div>
        ))}
      </div>

      <section className="border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <div>
            <h2 className="text-[12px]">Agent 列表</h2>
            <p className="mt-0.5 text-[8.5px] text-muted">工作副本用于编辑，上架版本只读。</p>
          </div>
          <span className="num text-[8px] text-muted">{agents.length} total</span>
        </div>
        {agents.length === 0 ? (
          <div className="px-6 py-16 text-center text-[10px] text-muted">
            还没有 Agent，先创建一个草稿。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-line text-[8px] uppercase tracking-[0.14em] text-muted">
                  <th className="px-4 py-2.5 font-normal">Agent</th>
                  <th className="px-4 py-2.5 font-normal">状态</th>
                  <th className="px-4 py-2.5 font-normal">版本</th>
                  <th className="px-4 py-2.5 font-normal">渠道</th>
                  <th className="px-4 py-2.5 font-normal">更新</th>
                  <th className="px-4 py-2.5 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} className="border-b border-line/70 last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="text-[11px]">{agent.name}</p>
                      <p className="num mt-0.5 text-[8px] text-muted">{agent.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("chip h-6 text-[8.5px]", STATUS_STYLE[agent.status])}>
                        {STATUS_LABEL[agent.status]}
                      </span>
                    </td>
                    <td className="num px-4 py-3 text-[9px] text-muted">
                      {agent.publishedVersion ? `v${agent.publishedVersion}` : "—"}
                      <span className="ml-1 text-muted-light">/ {agent.currentVersion ? `v${agent.currentVersion}` : "draft"}</span>
                    </td>
                    <td className="px-4 py-3 text-[8.5px] text-muted">
                      {agent.channels.join(" · ")}
                    </td>
                    <td className="px-4 py-3 text-[8.5px] text-muted">
                      {new Date(agent.updatedAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/agents/${agent.id}`}
                        className="inline-flex items-center gap-1 text-[9px] text-clay hover:underline"
                      >
                        管理
                        <Icon name="arrow-right" size={10} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="border border-line bg-[#eee8dd] px-4 py-3 text-[8.5px] leading-4 text-muted">
        管理 API 同样支持 Bearer <span className="num text-ink">AGENT_ADMIN_TOKEN</span>，可接入平台 CLI/自动化；
        当前登录使用 HMAC 签名 Cookie，8 小时过期。
      </div>
    </div>
  );
}
