"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function AdminLogin({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enabled) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "登录失败");
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-[420px] rounded-[24px] border border-line bg-white p-7 text-ink shadow-[0_30px_80px_-50px_rgba(23,22,15,0.55)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[8.5px] uppercase tracking-[0.26em] text-muted">ZHIYAN CONTROL PLANE</p>
          <h1 className="mt-2 font-display text-[30px] leading-none">Agent 管理端</h1>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-ivory">
          <Icon name="shield" size={17} />
        </span>
      </div>
      <p className="mt-3 text-[10px] leading-5 text-muted">
        使用平台分配的 <span className="num text-ink">AGENT_ADMIN_TOKEN</span> 登录。Token 只发送到服务端，
        浏览器 Cookie 使用 HMAC 签名，8 小时过期。
      </p>

      {!enabled ? (
        <div className="mt-5 border border-warning/30 bg-[#faf3e8] px-3 py-2.5 text-[9px] leading-4 text-warning">
          管理端未启用。请在部署环境设置至少 16 位的 <span className="num">AGENT_ADMIN_TOKEN</span> 后重启服务。
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block">
          <span className="text-[8.5px] uppercase tracking-[0.16em] text-muted">Admin Token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="current-password"
            spellCheck={false}
            disabled={!enabled}
            className="num mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[11px] outline-none focus:border-ink disabled:opacity-50"
            placeholder="AGENT_ADMIN_TOKEN"
            aria-label="管理 Token"
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-[9px] text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!enabled || pending || !token}
          className="btn btn-primary h-11 w-full rounded-full text-[11px] disabled:opacity-50"
        >
          {pending ? "验证中…" : "进入管理端"}
        </button>
      </form>

      <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-[8px] text-muted">
        <Icon name="shield" size={10} />
        仅管理员使用 · 不在前台导航中暴露
      </p>
    </div>
  );
}
