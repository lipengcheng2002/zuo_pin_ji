"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AgentDefinition,
  AgentVersion,
} from "@/lib/store/types";
import { cn } from "@/lib/utils/format";

type PublicKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  published: "已上架",
  draft: "草稿",
  unpublished: "已下架",
};

export function AgentAdminPanel({
  agent,
  versions,
  keys,
}: {
  agent: AgentDefinition;
  versions: AgentVersion[];
  keys: PublicKey[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [rollbackVersion, setRollbackVersion] = useState(
    versions.find((version) => version.version !== agent.publishedVersion)?.version ??
      versions[0]?.version ??
      1,
  );
  const [keyName, setKeyName] = useState("web-prod");
  const [keyDays, setKeyDays] = useState("90");
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (path: string, method: string, body?: unknown) => {
    setPending(path);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        token?: string;
      };
      if (!response.ok || (!data.ok && !data.token)) {
        throw new Error(data.error ?? "操作失败");
      }
      if (data.token) setToken(data.token);
      router.refresh();
      return data;
    } catch (caught) {
      setError((caught as Error).message);
      return null;
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-12">
        <section className="border border-line bg-white p-5 lg:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Agent</p>
              <h1 className="display mt-2 text-[34px] leading-none">{agent.name}</h1>
              <p className="num mt-1 text-[9px] text-muted">{agent.slug}</p>
              <p className="mt-3 max-w-xl text-[10px] leading-5 text-muted">{agent.description}</p>
            </div>
            <span
              className={cn(
                "chip h-7 shrink-0 text-[8.5px]",
                agent.status === "published"
                  ? "border-moss/30 bg-[#eef1ec] text-moss"
                  : agent.status === "unpublished"
                    ? "border-warning/30 bg-[#faf3e8] text-warning"
                    : "border-line-strong bg-paper text-muted",
              )}
            >
              {STATUS_LABEL[agent.status]}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[9px] sm:grid-cols-4">
            {[
              ["当前版本", agent.currentVersion ? `v${agent.currentVersion}` : "—"],
              ["上架版本", agent.publishedVersion ? `v${agent.publishedVersion}` : "—"],
              ["渠道", agent.channels.join(" · ")],
              ["Owner", agent.owner],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-muted">{label}</p>
                <p className="num mt-1 text-[10px] text-ink">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <p className="label">工作副本配置</p>
            <div className="mt-2 grid gap-2 text-[8.5px] text-muted sm:grid-cols-2">
              <p>Prompt <span className="num text-ink">{agent.config.promptVersion}</span></p>
              <p>模型 <span className="num text-ink">{agent.config.model}</span></p>
              <p>Provider <span className="text-ink">{agent.config.provider}</span></p>
              <p>Planner <span className="num text-ink">{agent.config.planner ? "LLM" : "rule"}</span></p>
              <p>工具预算 <span className="num text-ink">{agent.config.maxToolsPerTurn}</span></p>
              <p>最低置信度 <span className="num text-ink">{agent.config.minIntentConfidence}</span></p>
            </div>
            <p className="mt-2 text-[8px] leading-4 text-muted">
              工具：{agent.config.tools.join(" · ")}
            </p>
          </div>
        </section>

        <section className="border border-line bg-[#eee8dd] p-5 lg:col-span-5">
          <p className="eyebrow">Lifecycle</p>
          <h2 className="mt-2 text-[18px]">上架 / 下架</h2>
          <p className="mt-2 text-[8.5px] leading-4 text-muted">
            上架会创建不可变版本；下架立即拒绝用户端 SSE 与 API Key 调用，历史版本保留。
          </p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="发布备注，例如 v2 工具白名单"
            className="mt-4 h-9 w-full border border-line-strong bg-white px-2 text-[9px] outline-none focus:border-ink"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => call(`/api/agents/${agent.id}/publish`, "POST", { note })}
              disabled={pending !== null}
              className="btn btn-primary h-9 flex-1 text-[9px] disabled:opacity-50"
            >
              {agent.status === "published" ? "发布新版本" : "上架"}
            </button>
            <button
              type="button"
              onClick={() => call(`/api/agents/${agent.id}/unpublish`, "POST")}
              disabled={pending !== null || agent.status !== "published"}
              className="h-9 border border-line-strong px-3 text-[9px] text-ink-soft disabled:opacity-40"
            >
              下架
            </button>
          </div>

          <div className="mt-5 border-t border-ink/10 pt-4">
            <p className="text-[9px]">回滚</p>
            <p className="mt-1 text-[8px] leading-4 text-muted">
              以旧版本配置发布一个新版本，历史版本不修改。
            </p>
            <div className="mt-2 flex gap-2">
              <select
                value={rollbackVersion}
                onChange={(event) => setRollbackVersion(Number(event.target.value))}
                className="h-9 min-w-0 flex-1 border border-line-strong bg-white px-2 text-[9px]"
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.version}>
                    v{version.version} · {version.note}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  call(`/api/agents/${agent.id}/rollback`, "POST", {
                    version: rollbackVersion,
                  })
                }
                disabled={pending !== null || versions.length === 0}
                className="h-9 border border-line-strong px-3 text-[9px] text-ink-soft disabled:opacity-40"
              >
                回滚
              </button>
            </div>
          </div>
        </section>
      </div>

      {error ? (
        <p role="alert" className="border border-danger/25 bg-danger/5 px-3 py-2 text-[9px] text-danger">
          {error}
        </p>
      ) : null}
      {token ? (
        <div className="border border-moss/30 bg-[#eef1ec] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] text-moss">调用 Key 已创建，只显示一次</p>
              <code className="mt-2 block break-all text-[10px] text-ink">{token}</code>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(token)}
              className="shrink-0 border border-moss/30 px-2 py-1 text-[8px] text-moss"
            >
              复制
            </button>
          </div>
          <p className="mt-2 text-[8px] leading-4 text-muted">
            立即写入平台密钥管理服务；刷新或离开页面后无法再次查看。
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[11px]">不可变版本</h2>
            <p className="mt-0.5 text-[8px] text-muted">每次上架/回滚都会生成新版本。</p>
          </div>
          <div className="divide-y divide-line/70">
            {versions.map((version) => (
              <div key={version.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="num text-[10px]">v{version.version}</p>
                  <p className="mt-0.5 text-[8.5px] text-muted">{version.note}</p>
                  <p className="mt-0.5 text-[8px] text-muted-light">
                    {new Date(version.createdAt).toLocaleString("zh-CN")} · {version.createdBy}
                  </p>
                </div>
                <span className="num text-[8px] text-muted">{version.config.promptVersion}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[11px]">调用 Key</h2>
            <p className="mt-0.5 text-[8px] text-muted">服务端只保存 SHA-256 哈希与前缀。</p>
          </div>
          <div className="space-y-2 px-4 py-3">
            <div className="flex gap-2">
              <input
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                className="h-8 min-w-0 flex-1 border border-line-strong px-2 text-[9px]"
                placeholder="Key 名称"
              />
              <input
                value={keyDays}
                onChange={(event) => setKeyDays(event.target.value.replace(/\D/g, ""))}
                className="num h-8 w-14 border border-line-strong px-2 text-[9px]"
                placeholder="天数"
              />
              <button
                type="button"
                onClick={() =>
                  call(`/api/agents/${agent.id}/keys`, "POST", {
                    name: keyName,
                    scopes: ["invoke"],
                    expiresInDays: Number(keyDays) || undefined,
                  })
                }
                disabled={pending !== null || !keyName}
                className="h-8 shrink-0 bg-ink px-3 text-[8.5px] text-ivory disabled:opacity-40"
              >
                创建
              </button>
            </div>
            {keys.length === 0 ? (
              <p className="py-4 text-center text-[8.5px] text-muted">还没有调用 Key。</p>
            ) : (
              keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between gap-3 border-t border-line/60 py-2 first:border-t-0">
                  <div>
                    <p className="text-[9px]">{key.name}</p>
                    <p className="num mt-0.5 text-[8px] text-muted">
                      {key.prefix}… · {key.revokedAt ? "已撤销" : key.expiresAt ? `至 ${new Date(key.expiresAt).toLocaleDateString("zh-CN")}` : "长期"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => call(`/api/agents/${agent.id}/keys/${key.id}`, "DELETE")}
                    disabled={pending !== null || Boolean(key.revokedAt)}
                    className="text-[8px] text-danger disabled:opacity-30"
                  >
                    撤销
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
