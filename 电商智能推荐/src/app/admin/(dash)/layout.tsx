import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/agents/admin";
import { AdminLogout } from "@/components/admin/AdminLogout";
import { Icon } from "@/components/ui/Icon";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdminAuthed())) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <header className="border-b border-ivory/10 bg-ink text-ivory">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex items-baseline gap-2">
              <span className="font-display text-[23px] leading-none">织言</span>
              <span className="text-[8px] uppercase tracking-[0.26em] text-ivory/40">Agent Control</span>
            </Link>
            <nav className="hidden items-center gap-4 text-[9px] text-ivory/55 sm:flex">
              <Link href="/admin" className="transition hover:text-ivory">Agent 列表</Link>
              <Link href="/admin/new" className="transition hover:text-ivory">新建 Agent</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="hidden items-center gap-1 text-[9px] text-ivory/50 transition hover:text-ivory sm:flex">
              用户端
              <Icon name="arrow-up-right" size={10} />
            </Link>
            <AdminLogout />
          </div>
        </div>
      </header>
      <main id="main" className="container-x py-7 md:py-9">{children}</main>
    </div>
  );
}
