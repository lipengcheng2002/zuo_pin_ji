"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/format";

function WeChatMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.4 4C5.8 4 3 6.4 3 9.4c0 1.7.9 3.2 2.4 4.2L5 16l2.6-1.3c.6.1 1.2.2 1.8.2h.4a5.4 5.4 0 0 1-.2-1.5c0-3.2 2.9-5.7 6.5-5.8C15.3 5.4 12.6 4 9.4 4Zm-2.2 3.2a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm4.6 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" />
      <path d="M21 13.4c0-2.5-2.3-4.5-5.2-4.5s-5.2 2-5.2 4.5 2.3 4.5 5.2 4.5c.6 0 1.2-.1 1.8-.3l2.2 1.1-.5-1.7c1.1-.8 1.7-2 1.7-3.6Zm-6.8-1.1a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm3.4 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
    </svg>
  );
}

type Tab = "wechat" | "phone";

export function LoginPanel({
  next,
  wechatMode,
  initialError,
}: {
  next: string;
  wechatMode: "oauth" | "demo";
  initialError: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("wechat");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<"wechat" | "phone" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [demoCode, setDemoCode] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const finish = () => {
    router.replace(next);
    router.refresh();
  };

  const wechatLogin = async () => {
    setError(null);
    if (!consent) {
      setError("请先阅读并同意会员服务协议与隐私政策");
      return;
    }
    if (wechatMode === "oauth") {
      setPending("wechat");
      window.location.assign(
        `/api/auth/wechat/start?next=${encodeURIComponent(next)}`,
      );
      return;
    }
    setPending("wechat");
    try {
      const response = await fetch("/api/auth/customer/wechat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "微信登录失败");
      finish();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(null);
    }
  };

  const sendCode = async () => {
    setError(null);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入有效的 11 位手机号");
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/auth/customer/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        demoCode?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "验证码发送失败");
      setCountdown(60);
      if (data.demoCode) {
        setCode(data.demoCode);
        setDemoCode(data.demoCode);
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSending(false);
    }
  };

  const phoneLogin = async () => {
    setError(null);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入有效的 11 位手机号");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("请输入 6 位验证码");
      return;
    }
    if (!consent) {
      setError("请先阅读并同意会员服务协议与隐私政策");
      return;
    }
    setPending("phone");
    try {
      const response = await fetch("/api/auth/customer/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, consent: true }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "登录失败");
      finish();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="w-full max-w-[430px] rounded-[28px] border border-line bg-white p-6 shadow-[0_30px_80px_-50px_rgba(23,22,15,0.55)] sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.28em] text-muted">ZHIYAN MEMBER</p>
          <h1 className="mt-2 font-display text-[32px] leading-none tracking-[0.02em]">
            欢迎回来
          </h1>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef1ec] text-moss">
          <Icon name="user" size={19} />
        </span>
      </div>
      <p className="mt-3 text-[10.5px] leading-5 text-muted">
        登录后查看订单、心愿单与风格画像，继续和 AI 造型师完成你的衣橱。
      </p>

      <div className="mt-6 grid grid-cols-2 rounded-full bg-[#eee8dd] p-1 text-[10.5px]">
        {[
          { id: "wechat" as const, label: "微信登录" },
          { id: "phone" as const, label: "手机号登录" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setError(null);
            }}
            className={cn(
              "h-9 rounded-full transition",
              tab === item.id
                ? "bg-white text-ink shadow-[0_2px_10px_rgba(23,22,15,0.12)]"
                : "text-muted hover:text-ink",
            )}
            aria-pressed={tab === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "wechat" ? (
        <div className="mt-5">
          <button
            type="button"
            onClick={wechatLogin}
            disabled={pending !== null}
            className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-[#07C160] text-[13px] font-medium text-white shadow-[0_10px_24px_-14px_rgba(7,193,96,0.9)] transition hover:bg-[#06ad56] active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <WeChatMark className="h-5 w-5" />
            {pending === "wechat"
              ? "正在前往微信…"
              : wechatMode === "oauth"
                ? "微信授权登录"
                : "微信一键登录"}
          </button>
          <p className="mt-3 text-center text-[9px] leading-4 text-muted">
            {wechatMode === "oauth"
              ? "将跳转微信完成授权 · 授权后自动返回"
              : "使用微信身份快速进入 · 演示环境为模拟授权"}
          </p>

          <div className="my-5 flex items-center gap-3 text-[9px] text-muted-light">
            <span className="h-px flex-1 bg-line" />
            或使用手机号
            <span className="h-px flex-1 bg-line" />
          </div>
          <button
            type="button"
            onClick={() => {
              setTab("phone");
              setError(null);
            }}
            className="flex h-11 w-full items-center justify-center rounded-full border border-line-strong text-[11.5px] text-ink-soft transition hover:border-ink"
          >
            手机号验证码登录
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-[9px] uppercase tracking-[0.16em] text-muted">手机号</span>
            <div className="mt-1.5 flex h-11 items-center rounded-xl border border-line-strong bg-white px-3 focus-within:border-ink">
              <span className="num mr-2 border-r border-line pr-2 text-[11px] text-muted">+86</span>
              <input
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))
                }
                inputMode="numeric"
                autoComplete="tel"
                aria-label="手机号"
                placeholder="请输入手机号"
                className="num h-full min-w-0 flex-1 bg-transparent text-[13px] tracking-[0.08em] outline-none placeholder:tracking-normal placeholder:text-muted-light"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[9px] uppercase tracking-[0.16em] text-muted">验证码</span>
            <div className="mt-1.5 flex gap-2">
              <input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="验证码"
                placeholder="6 位验证码"
                className="num h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-3 text-[13px] tracking-[0.28em] outline-none focus:border-ink placeholder:tracking-normal placeholder:text-muted-light"
              />
              <button
                type="button"
                onClick={sendCode}
                disabled={sending || countdown > 0}
                className="h-11 shrink-0 rounded-xl border border-line-strong px-3 text-[9.5px] text-ink-soft transition hover:border-ink disabled:opacity-45"
              >
                {sending ? "发送中…" : countdown > 0 ? `${countdown}s 后重发` : "获取验证码"}
              </button>
            </div>
          </label>

          {demoCode ? (
            <p className="rounded-xl bg-[#f6f1e7] px-3 py-2 text-[9px] leading-4 text-clay" role="status">
              演示验证码 <span className="num tracking-[0.2em]">{demoCode}</span>{" "}
              已自动填入；生产环境接入短信服务后不再回显。
            </p>
          ) : null}

          <button
            type="button"
            onClick={phoneLogin}
            disabled={pending !== null}
            className="btn btn-primary h-11 w-full rounded-full text-[12px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "phone" ? "登录中…" : "登录 / 注册"}
          </button>
          <p className="text-center text-[9px] leading-4 text-muted">
            未注册的手机号将自动创建会员账户
          </p>
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-[9.5px] leading-4 text-danger"
        >
          {error}
        </p>
      ) : null}

      <label className="mt-5 flex items-start gap-2 text-[9px] leading-4 text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#07C160]"
        />
        <span>
          我已阅读并同意
          <Link href="/help" className="mx-1 text-ink-soft underline underline-offset-2">
            会员服务协议
          </Link>
          与
          <Link href="/help" className="ml-1 text-ink-soft underline underline-offset-2">
            隐私政策
          </Link>
          ，同意为个性化推荐处理必要的画像数据。
        </span>
      </label>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[9px] text-muted">
        <Link href="/" className="inline-flex items-center gap-1.5 transition hover:text-ink">
          <Icon name="arrow-left" size={11} />
          返回商店
        </Link>
        <span className="inline-flex items-center gap-1">
          <Icon name="shield" size={11} />
          会话 30 天 · HttpOnly
        </span>
      </div>
    </div>
  );
}
