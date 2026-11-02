"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { ProductArt } from "@/components/product/ProductArt";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/components/providers/Cart";
import { useWishlist } from "@/components/providers/Wishlist";
import { cn, money, stockLabel } from "@/lib/utils/format";

export type ProductCardReason = {
  headline: string;
  detail: string;
  evidenceLabel?: string;
  confidence?: number;
};

export function ProductCard({
  product,
  reason,
  score,
  index,
  className,
  showQuickAdd = true,
}: {
  product: Product;
  reason?: ProductCardReason;
  score?: number;
  index?: number;
  className?: string;
  showQuickAdd?: boolean;
}) {
  const [colorIndex, setColorIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const { add, pending } = useCart();
  const wishlist = useWishlist();
  const color = product.colors[colorIndex];
  const saved = wishlist.saved(product.id);
  const hasStock = product.sizes.some((size) => size.stock > 0);

  const handleAdd = async (size: string) => {
    setAdding(true);
    const ok = await add({
      productId: product.id,
      size,
      color: color.name,
      productName: product.name,
    });
    setAdding(false);
    if (ok) setPickerOpen(false);
  };

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div
        className="relative aspect-[4/5] overflow-hidden"
        style={{
          background: `linear-gradient(145deg, ${product.editorial.palette[0]} 0%, ${product.editorial.palette[1]} 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[88%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40"
          style={{
            background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85), transparent 58%)`,
          }}
        />
        <Link
          href={`/product/${product.slug}`}
          className="absolute inset-0 z-[1]"
          aria-label={`查看 ${product.name}`}
        >
          <ProductArt
            art={product.editorial.art}
            color={color.hex}
            accent={product.editorial.accent}
            className="transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.035]"
          />
        </Link>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-start justify-between p-3.5">
          <div className="flex flex-col gap-1">
            {product.badges.slice(0, 1).map((badge) => (
              <span
                key={badge}
                className="bg-ivory/85 px-2 py-1 text-[8.5px] uppercase tracking-[0.15em] text-ink backdrop-blur-sm"
              >
                {badge}
              </span>
            ))}
            {product.compareAt ? (
              <span className="bg-clay px-2 py-1 text-[8.5px] uppercase tracking-[0.15em] text-white">
                礼遇价
              </span>
            ) : null}
          </div>
          <button
            onClick={() => wishlist.toggle(product.id, product.name)}
            aria-label={saved ? "移出心愿单" : "加入心愿单"}
            aria-pressed={saved}
            className={cn(
              "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-ivory/70 text-ink backdrop-blur-sm transition hover:bg-ivory",
              saved && "text-clay",
            )}
          >
            <Icon name="heart" size={14} strokeWidth={saved ? 2 : 1.4} />
          </button>
        </div>

        {index !== undefined ? (
          <span className="num pointer-events-none absolute bottom-3.5 left-3.5 z-[2] text-[9px] tracking-[0.12em] text-ink/45">
            {String(index + 1).padStart(2, "0")} / ZY
          </span>
        ) : null}

        {showQuickAdd ? (
          <div className="absolute inset-x-0 bottom-0 z-[3] flex translate-y-full items-center justify-between gap-2 bg-gradient-to-t from-ivory/95 via-ivory/80 to-transparent px-3 pb-3 pt-8 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100">
            <div className="flex items-center gap-1.5">
              {product.colors.map((option, idx) => (
                <button
                  key={option.code}
                  onClick={() => setColorIndex(idx)}
                  aria-label={`选择颜色 ${option.name}`}
                  aria-pressed={idx === colorIndex}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border transition",
                    idx === colorIndex ? "border-ink ring-1 ring-ink/20 ring-offset-1" : "border-ink/20",
                  )}
                  style={{ background: option.hex }}
                />
              ))}
            </div>
            <button
              onClick={() => setPickerOpen(true)}
              disabled={!hasStock}
              className="bg-ink px-3 py-2 text-[9.5px] tracking-[0.12em] text-ivory transition hover:bg-clay disabled:bg-muted"
            >
              {hasStock ? "快速加购" : "缺货"}
            </button>
          </div>
        ) : null}

        {pickerOpen ? (
          <div className="absolute inset-0 z-[4] flex flex-col justify-end bg-ivory/96 p-4 backdrop-blur-sm animate-fade-in">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">Select Size</p>
                <p className="mt-1 text-[12px]">{product.name}</p>
                <p className="mt-0.5 text-[10.5px] text-muted">{color.name}</p>
              </div>
              <button
                onClick={() => setPickerOpen(false)}
                aria-label="关闭尺码选择"
                className="p-1 text-muted hover:text-ink"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {product.sizes.map((size) => (
                <button
                  key={size.label}
                  disabled={size.stock <= 0 || adding || pending}
                  onClick={() => handleAdd(size.label)}
                  className="flex h-10 flex-col items-center justify-center border border-line-strong text-[11px] transition hover:border-ink hover:bg-paper disabled:cursor-not-allowed disabled:text-muted-light disabled:line-through"
                  title={stockLabel(size.stock)}
                >
                  {size.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[9.5px] text-muted">
              尺码不确定？<Link href="/stylist" className="text-clay underline underline-offset-2">问 AI 造型师</Link>
            </p>
          </div>
        ) : null}
      </div>

      <div className="pt-3.5">
        <Link href={`/product/${product.slug}`} className="block">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-muted">
                {product.subcategory} · {color.name}
              </p>
              <h3 className="mt-1 truncate text-[13.5px] leading-5 transition group-hover:text-clay">
                {product.name}
              </h3>
            </div>
            <div className="shrink-0 text-right">
              <p className="num text-[12.5px]">{money(product.price)}</p>
              {product.compareAt ? (
                <p className="num text-[10px] text-muted-light line-through">
                  {money(product.compareAt)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[9.5px] text-muted">
            <Icon name="star" size={10} className="fill-current text-clay/70" strokeWidth={0} />
            <span className="num">{product.rating}</span>
            <span>·</span>
            <span>{product.styleTags.slice(0, 2).join(" / ")}</span>
          </div>
        </Link>

        {reason ? (
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-clay">
              <Icon name="sparkle" size={11} />
              <span className="truncate">{reason.headline}</span>
              {score !== undefined ? (
                <span className="num ml-auto shrink-0 text-[9px] text-muted">
                  {Math.round(score * 100)}%
                </span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-muted">{reason.detail}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
