import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLogin } from "@/components/admin/AdminLogin";
import {
  agentAdminConfigured,
  isAdminAuthed,
} from "@/lib/agents/admin";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent 管理端登录",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await isAdminAuthed()) redirect("/admin");
  return (
    <div className="min-h-screen bg-ink text-ivory">
      <header className="container-x flex h-20 items-center justify-between">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-display text-[26px] leading-none">织言</span>
          <span className="text-[8.5px] uppercase tracking-[0.3em] text-ivory/40">ZHIYAN</span>
        </Link>
        <Link href="/" className="flex items-center gap-1.5 text-[9px] text-ivory/50 hover:text-ivory">
          返回用户端
          <Icon name="arrow-up-right" size={11} />
        </Link>
      </header>
      <main id="main" className="container-x grid min-h-[calc(100vh-160px)] items-center gap-10 pb-16 lg:grid-cols-12">
        <section className="hidden lg:col-span-6 lg:block">
          <p className="text-[9px] uppercase tracking-[0.3em] text-[#c9a87b]">Agent Operations</p>
          <h2 className="mt-5 max-w-[460px] font-display text-[46px] leading-[1.08]">
            让智能体
            <br />
            有边界地上线。
          </h2>
          <p className="mt-6 max-w-[420px] text-[11px] leading-6 text-ivory/55">
            草稿、下架、不可变版本、回滚与调用 Key 都在这里。管理端不参与用户端导航，
            也不向公网暴露管理接口。
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-ivory/15 pt-5 text-[8.5px] text-ivory/45">
            <div><p className="num text-[16px] text-ivory">DRAFT</p><p className="mt-1">可编辑工作副本</p></div>
            <div><p className="num text-[16px] text-ivory">PUBLISH</p><p className="mt-1">不可变版本</p></div>
            <div><p className="num text-[16px] text-ivory">KEYS</p><p className="mt-1">哈希与撤销</p></div>
          </div>
        </section>
        <section className="flex justify-center lg:col-span-6 lg:justify-end">
          <AdminLogin enabled={agentAdminConfigured()} />
        </section>
      </main>
    </div>
  );
}
