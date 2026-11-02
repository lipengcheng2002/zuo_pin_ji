"use client";

import { useState } from "react";
import { useCart } from "@/components/providers/Cart";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/providers/Toast";
import { money } from "@/lib/utils/format";

export type OutfitAddItem = {
  productId: string;
  name: string;
  size: string;
  color: string;
  price: number;
};

export function OutfitAddAll({ items, label }: { items: OutfitAddItem[]; label?: string }) {
  const { add, pending } = useCart();
  const { push } = useToast();
  const [adding, setAdding] = useState(false);
  const total = items.reduce((sum, item) => sum + item.price, 0);

  if (!items.length) return null;

  const handleAdd = async () => {
    setAdding(true);
    let added = 0;
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await add({
        productId: item.productId,
        size: item.size,
        color: item.color,
        productName: item.name,
      });
      if (ok) added += 1;
    }
    setAdding(false);
    if (added === items.length) {
      push("整套已加入购物袋", { tone: "success", detail: `${added} 件 · ${money(total)}` });
    } else if (added > 0) {
      push(`已加入 ${added} / ${items.length} 件，部分尺码缺货`, { tone: "error" });
    }
  };

  return (
    <button
      onClick={handleAdd}
      disabled={adding || pending}
      className="btn btn-primary"
    >
      {adding ? "正在加入…" : label ?? `整套加入购物袋 · ${money(total)}`}
      {!adding ? <Icon name="bag" size={14} /> : null}
    </button>
  );
}
