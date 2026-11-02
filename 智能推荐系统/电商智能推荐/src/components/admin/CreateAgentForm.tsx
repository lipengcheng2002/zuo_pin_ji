"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/format";

const CHANNELS = [
  { id: "web" as const, label: "Web" },
  { id: "api" as const, label: "API" },
  { id: "mini_program" as const, label: "小程序" },
];

export function CreateAgentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [channels, setChannels] = useState<Array<"web" | "api" | "mini_program">>(["web", "api"]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description, channels }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        agent?: { id: string };
      };
      if (!response.ok || !data.agent) throw new Error(data.error ?? "创建失败");
      router.replace(`/admin/agents/${data.agent.id}`);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-line bg-white p-5 md:p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="label">Agent 名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 h-10 w-full border border-line-strong bg-white px-3 text-[10px] outline-none focus:border-ink"
            placeholder="造型师灰度"
            required
          />
        </label>
        <label className="block">
          <span className="label">Slug</span>
          <input
            value={slug}
            onChange={(event) =>
              setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            className="num mt-1.5 h-10 w-full border border-line-strong bg-white px-3 text-[10px] outline-none focus:border-ink"
            placeholder="stylist-canary"
            pattern="[a-z0-9][a-z0-9-]{2,48}"
            required
          />
          <span className="mt-1 block text-[8px] text-muted">小写字母、数字和连字符；创建后不可改。</span>
        </label>
        <label className="block md:col-span-2">
          <span className="label">描述</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1.5 min-h-20 w-full border border-line-strong bg-white px-3 py-2 text-[10px] leading-5 outline-none focus:border-ink"
            placeholder="这个 Agent 负责什么、面向哪个渠道。"
          />
        </label>
        <div className="md:col-span-2">
          <span className="label">发布渠道</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHANNELS.map((channel) => {
              const checked = channels.includes(channel.id);
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() =>
                    setChannels((current) =>
                      checked
                        ? current.filter((item) => item !== channel.id)
                        : [...current, channel.id],
                    )
                  }
                  className={cn(
                    "flex h-8 items-center gap-1.5 border px-3 text-[9px] transition",
                    checked
                      ? "border-ink bg-ink text-ivory"
                      : "border-line-strong bg-white text-muted",
                  )}
                >
                  <Icon name={checked ? "check" : "plus"} size={10} />
                  {channel.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-5 border-t border-line pt-3 text-[8px] leading-4 text-muted">
        创建后使用默认 Runtime 配置（Prompt 版本、模型标签、11 个工具），可先上架 v1，再通过 API 调整工作副本并发布新版本。
      </p>
      {error ? (
        <p role="alert" className="mt-3 border border-danger/25 bg-danger/5 px-3 py-2 text-[9px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="h-9 border border-line-strong px-3 text-[9px] text-ink-soft"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={pending || !name || !slug || channels.length === 0}
          className="btn btn-primary h-9 px-4 text-[9px] disabled:opacity-50"
        >
          {pending ? "创建中…" : "创建草稿"}
        </button>
      </div>
    </form>
  );
}
