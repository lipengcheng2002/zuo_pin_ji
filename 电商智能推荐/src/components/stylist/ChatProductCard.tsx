"use client";

import { useState } from "react";
import Link from "next/link";
import type { AgentProductCard } from "@/lib/agent/types";
import { ProductArt } from "@/components/product/ProductArt";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/components/providers/Cart";
import { money, stockLabel } from "@/lib/utils/format";

export function ChatProductCard({ card }: { card: AgentProductCard }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const { add, pending } = useCart();

  const handleAdd = async (size: string) => {
    setAdding(true);
    const ok = await add({
      productId: card.id,
      size,
      color: card.colorName,
      productName: card.name,
    });
    setAdding(false);
    if (ok) setOpen(false);
  };

  return (
    <div className="flex w-[262px] shrink-0 snap-start gap-3 border border-line bg-paper p-3">
      <Link
        href={`/product/${card.slug}`}
        className="h-[100px] w-[78px] shrink-0 overflow-hidden"
        style={{ background: `linear-gradient(150deg, ${card.palette[0]}, ${card.palette[1]})` }}
      >
        <ProductArt art={card.art} color={card.colorHex} accent={card.accent} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11.5px] leading-4">{card.name}</p>
            <p className="mt-0.5 text-[8.5px] text-muted">
              {card.colorName} · {card.subcategory}
            </p>
          </div>
          <p className="num shrink-0 text-[10px]">{money(card.price)}</p>
        </div>
        <p className="mt-1.5 flex items-start gap-1 text-[9px] leading-3.5 text-clay">
          <Icon name="sparkle" size={9} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{card.reasonHeadline}</span>
        </p>
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <span className="num text-[8px] text-muted">匹配 {Math.round(card.score * 100)}%</span>
          <button
            onClick={() => setOpen((value) => !value)}
            className="flex items-center gap-1 bg-ink px-2 py-1 text-[8.5px] tracking-wide text-ivory transition hover:bg-clay"
          >
            <Icon name="plus" size={9} />
            加入
          </button>
        </div>
        {open ? (
          <div className="mt-2 border-t border-line pt-2">
            <div className="flex flex-wrap gap-1">
              {card.sizes.map((size) => (
                <button
                  key={size.label}
                  disabled={size.stock <= 0 || adding || pending}
                  onClick={() => handleAdd(size.label)}
                  title={stockLabel(size.stock)}
                  className="h-6 min-w-7 border border-line-strong px-1.5 text-[8.5px] transition hover:border-ink disabled:line-through disabled:opacity-40"
                >
                  {size.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[7.5px] text-muted">选择尺码即加入购物袋</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
