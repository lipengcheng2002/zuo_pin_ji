"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/providers/Toast";

export function CustomerLogout({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { push } = useToast();

  const logout = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/auth/customer", { method: "DELETE" });
      if (!response.ok) throw new Error("退出登录失败");
      push("已退出登录", { tone: "success", detail: "你的订单与画像仍安全保存在账户中。" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      push((error as Error).message, { tone: "error" });
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className={className ?? "inline-flex items-center gap-1.5 text-[9.5px] text-muted transition hover:text-ink disabled:opacity-50"}
    >
      <Icon name="logout" size={11} />
      {pending ? "正在退出…" : "退出登录"}
    </button>
  );
}
