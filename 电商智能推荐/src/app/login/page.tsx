import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { Icon } from "@/components/ui/Icon";
import { currentCustomer, safeNextPath } from "@/lib/customer-auth";
import { wechatOAuthConfigured } from "@/lib/wechat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "会员登录",
  description: "微信一键登录或手机号验证码登录织言会员账户。",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; wechat?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  const existing = await currentCustomer();
  if (existing) redirect(next);

  const wechatError =
    params.wechat === "denied"
      ? "你已取消微信授权，可以重试或使用手机号登录。"
      : params.wechat === "unconfigured"
        ? "微信登录尚未配置，当前可使用手机号验证码登录。"
        : params.wechat === "failed"
          ? "微信授权失败或已过期，请重试，或使用手机号登录。"
          : null;

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <header className="container-x flex h-20 items-center justify-between">
        <Link href="/" aria-label="织言首页" className="flex items-baseline gap-3">
          <span className="font-display text-[27px] leading-none tracking-[0.04em]">织言</span>
          <span className="hidden text-[9px] uppercase tracking-[0.34em] text-muted sm:inline">
            Zhiyan
          </span>
        </Link>
        <div className="flex items-center gap-4 text-[9.5px] text-muted">
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <Icon name="shield" size={12} />
            安全登录
          </span>
          <Link href="/" className="inline-flex items-center gap-1.5 transition hover:text-ink">
            返回商店
            <Icon name="arrow-up-right" size={12} />
          </Link>
        </div>
      </header>

      <main
        id="main"
        className="container-x grid items-center gap-10 pb-16 pt-3 lg:min-h-[calc(100vh-160px)] lg:grid-cols-12 lg:gap-16 lg:pt-0"
      >
        <section className="relative hidden min-h-[560px] overflow-hidden bg-ink px-10 py-12 text-ivory lg:col-span-6 lg:block">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(120% 90% at 15% 10%, rgba(201,168,123,0.25), transparent 55%), radial-gradient(90% 80% at 90% 100%, rgba(125,138,114,0.35), transparent 60%)",
            }}
          />
          <div aria-hidden="true" className="absolute inset-x-0 top-0 flex h-full flex-col justify-between opacity-[0.08]">
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} className="h-px w-full bg-ivory" />
            ))}
          </div>
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between text-[8.5px] uppercase tracking-[0.26em] text-ivory/45">
              <span>ZHIYAN CIRCLE</span>
              <span>EST. 2019</span>
            </div>
            <div className="max-w-[430px] py-12">
              <p className="text-[9px] uppercase tracking-[0.3em] text-[#c9a87b]">
                Personal Wardrobe
              </p>
              <p className="mt-5 font-display text-[46px] leading-[1.08] tracking-[0.01em]">
                衣橱，
                <br />
                应当懂你。
              </p>
              <p className="mt-6 text-[11px] leading-6 text-ivory/60">
                登录后，订单、尺码、偏好与每一次对话都会留在同一处。AI
                造型师会根据你的节奏，继续把衣橱织完整。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-ivory/15 pt-5 text-[8.5px] leading-4 text-ivory/50">
              <div>
                <p className="num text-[16px] text-ivory">30D</p>
                <p className="mt-1">安全会话</p>
              </div>
              <div>
                <p className="num text-[16px] text-ivory">AI</p>
                <p className="mt-1">专属造型师</p>
              </div>
              <div>
                <p className="num text-[16px] text-ivory">1:1</p>
                <p className="mt-1">风格画像</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex justify-center lg:col-span-6 lg:justify-end">
          <LoginPanel
            next={next}
            wechatMode={wechatOAuthConfigured() ? "oauth" : "demo"}
            initialError={wechatError}
          />
        </section>
      </main>

      <footer className="container-x flex flex-col gap-2 border-t border-line py-5 text-[8.5px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 织言 ZHIYAN · 演示项目</p>
        <p className="flex flex-wrap items-center gap-3">
          <span>微信一键登录</span>
          <span className="h-1 w-1 rounded-full bg-muted-light" />
          <span>手机号验证码</span>
          <span className="h-1 w-1 rounded-full bg-muted-light" />
          <span>服务端会话 · 30 天</span>
        </p>
      </footer>
    </div>
  );
}
