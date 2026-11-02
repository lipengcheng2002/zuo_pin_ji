"use client";

import Link from "next/link";
import { useState } from "react";
import type { CartView } from "@/lib/commerce/pricing";
import type { Recommendation } from "@/lib/engine/types";
import { useCart } from "@/components/providers/Cart";
import { useWishlist } from "@/components/providers/Wishlist";
import { ProductArt } from "@/components/product/ProductArt";
import { ProductCard } from "@/components/product/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/utils/format";

export function CartPageClient({
  initialCart,
  recommendations,
}: {
  initialCart: CartView;
  recommendations: Recommendation[];
}) {
  const { cart: liveCart, updateQty, remove, applyCoupon, pending } = useCart();
  const cart = liveCart ?? initialCart;
  const wishlist = useWishlist();
  const [code, setCode] = useState(cart.summary.couponCode ?? "");
  const summary = cart.summary;

  return (
    <div className="container-x pt-8 md:pt-10">
      <div className="flex items-end justify-between border-b border-line pb-6">
        <div>
          <p className="eyebrow">Shopping Bag</p>
          <h1 className="display mt-2 text-[42px] leading-none md:text-[56px]">购物袋</h1>
        </div>
        <p className="num text-[11px] text-muted">{summary.itemCount} 件</p>
      </div>

      {cart.lines.length === 0 ? (
        <div className="grid gap-12 py-16 lg:grid-cols-2">
          <div className="flex flex-col items-start justify-center">
            <Icon name="bag" size={30} className="text-muted-light" />
            <h2 className="display mt-5 text-[32px]">你的购物袋还是空的。</h2>
            <p className="mt-3 max-w-sm text-[12px] leading-6 text-muted">
              让 AI 造型师按场合与预算，直接为你搭一套。或者先看看这一季被反复选择的单品。
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/stylist" className="btn btn-primary">
                <Icon name="sparkle" size={13} />
                让造型师帮我搭
              </Link>
              <Link href="/shop" className="btn btn-ghost">
                浏览全部单品
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-5">
            {recommendations.slice(0, 4).map((item, index) => (
              <ProductCard
                key={item.product.id}
                product={item.product}
                index={index}
                reason={{
                  headline: item.reason.headline,
                  detail: item.reason.detail,
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-8">
            <div className="border-t border-ink/70">
              {cart.lines.map((line, index) => (
                <div
                  key={`${line.productId}-${line.size}-${line.color}`}
                  className="grid grid-cols-[104px_1fr] gap-4 border-b border-line py-5 sm:grid-cols-[128px_1fr]"
                >
                  <Link
                    href={`/product/${line.product.slug}`}
                    className="aspect-[4/5] overflow-hidden"
                    style={{
                      background: `linear-gradient(150deg, ${line.product.editorial.palette[0]}, ${line.product.editorial.palette[1]})`,
                    }}
                  >
                    <ProductArt
                      art={line.product.editorial.art}
                      color={
                        line.product.colors.find((color) => color.name === line.color)?.hex ??
                        line.product.colors[0].hex
                      }
                      accent={line.product.editorial.accent}
                    />
                  </Link>
                  <div className="flex flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-muted">
                          {line.product.subcategory}
                        </p>
                        <Link href={`/product/${line.product.slug}`} className="mt-1 block text-[14px] hover:text-clay">
                          {line.product.name}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 text-[10.5px] text-muted">
                          <span>颜色 {line.color}</span>
                          <span>尺码 {line.size}</span>
                          <span>{line.stock > 0 ? `库存 ${line.stock}` : "缺货"}</span>
                        </div>
                      </div>
                      <p className="num shrink-0 text-[13px]">{money(line.lineTotal)}</p>
                    </div>
                    {line.issue ? (
                      <p className="mt-2 flex items-center gap-1 text-[9.5px] text-danger">
                        <Icon name="alert" size={11} />
                        {line.issue}
                      </p>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <div className="flex h-9 items-center border border-line-strong">
                        <button
                          onClick={() => updateQty(index, line.qty - 1)}
                          className="flex h-full w-9 items-center justify-center text-muted hover:text-ink"
                          aria-label="减少数量"
                          disabled={pending}
                        >
                          <Icon name="minus" size={12} />
                        </button>
                        <span className="num w-8 text-center text-[11px]">{line.qty}</span>
                        <button
                          onClick={() => updateQty(index, line.qty + 1)}
                          className="flex h-full w-9 items-center justify-center text-muted hover:text-ink"
                          aria-label="增加数量"
                          disabled={pending || line.qty >= line.stock}
                        >
                          <Icon name="plus" size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-4 text-[9.5px]">
                        <button
                          onClick={() => wishlist.toggle(line.productId, line.product.name)}
                          className="flex items-center gap-1 text-muted transition hover:text-ink"
                        >
                          <Icon name="heart" size={12} />
                          移入心愿单
                        </button>
                        <button
                          onClick={() => remove(index)}
                          className="flex items-center gap-1 text-muted transition hover:text-danger"
                        >
                          <Icon name="trash" size={12} />
                          移除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <Link href="/shop" className="flex items-center gap-2 text-[10.5px] tracking-wide text-muted hover:text-ink">
                <Icon name="arrow-left" size={13} />
                继续挑选
              </Link>
              <p className="flex items-center gap-1.5 text-[10px] text-muted">
                <Icon name="shield" size={12} />
                安全支付 · 30 天退换
              </p>
            </div>
          </div>

          <aside className="lg:col-span-4">
            <div className="border border-line bg-paper p-6 lg:sticky lg:top-28">
              <h2 className="text-[13px] tracking-wide">订单摘要</h2>
              <div className="mt-5 space-y-3 text-[11.5px]">
                <div className="flex justify-between text-muted">
                  <span>商品小计</span>
                  <span className="num text-ink">{money(summary.subtotal)}</span>
                </div>
                {summary.discount > 0 ? (
                  <div className="flex justify-between text-clay">
                    <span>优惠 {summary.couponCode}</span>
                    <span className="num">-{money(summary.discount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-muted">
                  <span>配送</span>
                  <span className="num text-ink">
                    {summary.shipping === 0 ? "免运费" : money(summary.shipping)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-line pt-3 text-[14px]">
                  <span>应付合计</span>
                  <span className="num">{money(summary.total)}</span>
                </div>
                <p className="text-right text-[9px] text-muted">
                  预计可获得 {summary.points} 积分
                </p>
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <label className="label" htmlFor="coupon">优惠券</label>
                <div className="flex gap-2">
                  <input
                    id="coupon"
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    placeholder="输入优惠码，如 NEW15"
                    className="field h-10 flex-1 text-[11px]"
                  />
                  <button
                    onClick={() => applyCoupon(code)}
                    disabled={!code || pending}
                    className="h-10 shrink-0 border border-ink px-4 text-[10px] tracking-[0.1em] transition hover:bg-ink hover:text-ivory disabled:opacity-40"
                  >
                    应用
                  </button>
                </div>
                {summary.couponError ? (
                  <p className="mt-1.5 text-[9.5px] text-danger">{summary.couponError}</p>
                ) : summary.couponLabel ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[9.5px] text-moss">
                    <Icon name="check" size={11} />
                    {summary.couponLabel} 已应用
                  </p>
                ) : (
                  <p className="mt-1.5 text-[9px] text-muted">新客可用 NEW15，满 ¥800 可用 ZHIYAN10</p>
                )}
              </div>

              <div className="mt-5 border-t border-line pt-4">
                {summary.freeShippingUnlocked ? (
                  <p className="flex items-center gap-1.5 text-[10px] text-moss">
                    <Icon name="truck" size={12} />
                    已享顺丰免运费
                  </p>
                ) : (
                  <>
                    <p className="text-[10px] text-muted">
                      再选 {money(summary.freeShippingRemaining)} 即可免运费
                    </p>
                    <div className="mt-2 h-[3px] bg-line">
                      <div
                        className="h-full bg-clay"
                        style={{
                          width: `${Math.min(100, Math.max(4, ((599 - summary.freeShippingRemaining) / 599) * 100))}%`,
                        }}
                      />
                    </div>
                  </>
                )}
              </div>

              <Link
                href="/checkout"
                aria-disabled={cart.lines.some((line) => !line.valid)}
                className={`btn btn-primary mt-5 w-full ${cart.lines.some((line) => !line.valid) ? "pointer-events-none opacity-40" : ""}`}
              >
                前往结算
                <Icon name="arrow-right" size={14} />
              </Link>
              <p className="mt-3 text-center text-[9px] leading-4 text-muted">
                点击结算即表示同意《使用条款》与《隐私政策》
                <br />
                本项目为演示环境，不会产生真实扣款。
              </p>
            </div>
          </aside>
        </div>
      )}

      {cart.lines.length ? (
        <div className="mt-16">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="eyebrow">Complete your look</p>
              <h2 className="display mt-2 text-[28px] md:text-[34px]">与购物袋里的一起穿</h2>
            </div>
            <Link href="/stylist" className="hidden text-[10px] text-clay hover:underline sm:block">
              让造型师补齐整套 →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
            {recommendations.slice(0, 4).map((item, index) => (
              <ProductCard
                key={item.product.id}
                product={item.product}
                index={index}
                score={item.score}
                reason={{
                  headline: item.reason.headline,
                  detail: item.reason.detail,
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
