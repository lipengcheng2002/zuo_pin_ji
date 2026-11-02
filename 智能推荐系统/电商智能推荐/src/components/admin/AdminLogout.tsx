"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function AdminLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        setPending(true);
        await fetch("/api/admin/auth", { method: "DELETE" }).catch(() => undefined);
        router.replace("/admin/login");
        router.refresh();
      }}
      disabled={pending}
      className="flex items-center gap-1.5 text-[9px] text-ivory/50 transition hover:text-ivory disabled:opacity-50"
    >
      <Icon name="logout" size={11} />
      {pending ? "退出中…" : "退出管理端"}
    </button>
  );
}
