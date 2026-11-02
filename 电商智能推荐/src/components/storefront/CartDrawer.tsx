"use client";

import Link from "next/link";
import { useCart } from "@/components/providers/Cart";
import { ProductArt } from "@/components/product/ProductArt";
import { Icon } from "@/components/ui/Icon";
import { useDialog } from "@/lib/hooks/useDialog";
import { money } from "@/lib/utils/format";

export function CartDrawer() {
  const { cart, open, setOpen, pending, updateQty, remove } = useCart();
  const summary = cart?.summary;
  const panelRef = useDialog<HTMLElement>(open, () => setOpen(false));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95]">
      <button
        aria-label="关闭购物袋"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="购物袋"
        className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-ivory shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div>
            <p className="eyebrow">Shopping Bag</p>
            <h2 className="mt-1 text-[18px] tracking-wide">购物袋 · {summary?.itemCount ?? 0}</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-2 text-muted transition hover:text-ink"
            aria-label="关闭"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {summary && summary.subtotal > 0 ? (
          <div className="border-b border-line px-6 py-3">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>
                {summary.freeShippingUnlocked
                  ? "已享顺丰免运费"
                  : `再选 ${money(summary.freeShippingRemaining)} 即可免运费`}
              </span>
              <span className="num">{Math.min(100, Math.round(((599 - summary.freeShippingRemaining) / 599) * 100))}%</span>
            </div>
            <div className="mt-2 h-[3px] bg-line">
              <div
                className="h-full bg-clay transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(6, ((599 - summary.freeShippingRemaining) / 599) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-6">
          {!cart || cart.lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <Icon name="bag" size={32} className="text-muted-light" />
              <p className="mt-4 text-[14px]">购物袋还是空的</p>
              <p className="mt-1 max-w-[220px] text-[12px] leading-6 text-muted">
                让 AI 造型师按场合与预算，直接为你搭一套。
              </p>
              <Link href="/stylist" onClick={() => setOpen(false)} className="btn btn-outline btn-sm mt-6">
                <Icon name="sparkle" size={13} />
                开始造型
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {cart.lines.map((line, index) => (
                <li key={`${line.productId}-${line.size}-${line.color}`} className="flex gap-4 py-5">
                  <Link
                    href={`/product/${line.product.slug}`}
                    onClick={() => setOpen(false)}
                    className="h-[112px] w-[88px] shrink-0 overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${line.product.editorial.palette[0]}, ${line.product.editorial.palette[1]})`,
                    }}
                  >
                    <ProductArt
                      art={line.product.editorial.art}
                      color={
                        line.product.colors.find((c) => c.name === line.color)?.hex ??
                        line.product.colors[0].hex
                      }
                      accent={line.product.editorial.accent}
                    />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] leading-5">{line.product.name}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {line.color} / {line.size}
                        </p>
                      </div>
                      <p className="num shrink-0 text-[12px]">{money(line.lineTotal)}</p>
                    </div>
                    {!line.valid && line.issue ? (
                      <p className="mt-1 text-[10px] text-danger">{line.issue}</p>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex h-8 items-center border border-line-strong">
                        <button
                          onClick={() => updateQty(index, line.qty - 1)}
                          className="flex h-full w-8 items-center justify-center text-muted hover:text-ink"
                          aria-label="减少数量"
                          disabled={pending}
                        >
                          <Icon name="minus" size={12} />
                        </button>
                        <span className="num w-7 text-center text-[11px]">{line.qty}</span>
                        <button
                          onClick={() => updateQty(index, line.qty + 1)}
                          className="flex h-full w-8 items-center justify-center text-muted hover:text-ink"
                          aria-label="增加数量"
                          disabled={pending || line.qty >= line.stock}
                        >
                          <Icon name="plus" size={12} />
                        </button>
                      </div>
                      <button
                        onClick={() => remove(index)}
                        className="text-[10px] tracking-wide text-muted underline-offset-4 hover:text-danger hover:underline"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {summary && summary.subtotal > 0 ? (
          <div className="border-t border-line bg-paper px-6 py-5">
            <div className="space-y-2 text-[12px]">
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
                <span>标准配送</span>
                <span className="num text-ink">
                  {summary.shipping === 0 ? "免运费" : money(summary.shipping)}
                </span>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-[14px]">
                <span>应付合计</span>
                <span className="num">{money(summary.total)}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <Link href="/checkout" onClick={() => setOpen(false)} className="btn btn-primary w-full">
                前往结算
              </Link>
              <Link
                href="/cart"
                onClick={() => setOpen(false)}
                className="text-center text-[11px] tracking-[0.12em] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                查看购物袋详情
              </Link>
            </div>
            <p className="mt-3 text-center text-[10px] text-muted">
              30 天无理由退换 · 顺丰包邮 · 支持电子发票
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
