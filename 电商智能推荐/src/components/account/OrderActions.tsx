"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrderStatus } from "@/lib/types";
import { useToast } from "@/components/providers/Toast";
import { Icon } from "@/components/ui/Icon";

export function OrderActions({
  orderNo,
  status,
  total,
}: {
  orderNo: string;
  status: OrderStatus;
  total: number;
}) {
  const [pending, setPending] = useState<"cancel" | "return" | null>(null);
  const router = useRouter();
  const { push } = useToast();

  const run = async (action: "cancel" | "return") => {
    const label = action === "cancel" ? "取消订单" : "申请退货";
    if (!window.confirm(`${label}：${orderNo}？${action === "return" ? `退款 ¥${total}` : ""}`)) {
      return;
    }
    setPending(action);
    try {
      const response = await fetch("/api/orders/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo, action }),
      });
      const data = (await response.json()) as { order?: unknown; error?: string };
      if (!response.ok) throw new Error(data.error ?? "操作失败");
      push(action === "cancel" ? "订单已取消" : "退货申请已提交", {
        tone: "success",
        detail: action === "cancel" ? "库存占用已释放" : "退款将在 1–3 个工作日原路退回",
      });
      router.refresh();
    } catch (error) {
      push((error as Error).message, { tone: "error" });
    } finally {
      setPending(null);
    }
  };

  if (status === "待发货") {
    return (
      <button
        onClick={() => run("cancel")}
        disabled={pending !== null}
        className="flex h-8 items-center gap-1.5 border border-line-strong px-3 text-[9px] text-muted transition hover:border-danger hover:text-danger disabled:opacity-50"
      >
        <Icon name="close" size={11} />
        {pending === "cancel" ? "取消中…" : "取消订单"}
      </button>
    );
  }

  if (status === "已发货" || status === "已完成") {
    return (
      <button
        onClick={() => run("return")}
        disabled={pending !== null}
        className="flex h-8 items-center gap-1.5 border border-line-strong px-3 text-[9px] text-muted transition hover:border-clay hover:text-clay disabled:opacity-50"
      >
        <Icon name="refresh" size={11} />
        {pending === "return" ? "提交中…" : "申请退货"}
      </button>
    );
  }

  return null;
}
