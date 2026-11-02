"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import type { Evidence } from "@/lib/engine/types";
import { ProductArt } from "@/components/product/ProductArt";
import { Icon } from "@/components/ui/Icon";
import { useDialog } from "@/lib/hooks/useDialog";
import { useCart } from "@/components/providers/Cart";
import { useWishlist } from "@/components/providers/Wishlist";
import { useToast } from "@/components/providers/Toast";
import { cn, money, stockLabel } from "@/lib/utils/format";
import { SIZE_TABLE } from "@/lib/data/size-guide";

type View = "main" | "detail" | "fabric";

export function ProductHero({
  product,
  reason,
  suggestedSize,
  profileTags,
  ratingCount,
}: {
  product: Product;
  reason: { headline: string; detail: string; evidence: Evidence[]; confidence: number };
  suggestedSize: string;
  profileTags: string[];
  ratingCount: number;
}) {
  const initialSize =
    product.sizes.find((size) => size.label === suggestedSize && size.stock > 0)?.label ??
    product.sizes.find((size) => size.stock > 0)?.label ??
    "";
  const [colorIndex, setColorIndex] = useState(0);
  const [size, setSize] = useState(initialSize);
  const [qty, setQty] = useState(1);
  const [view, setView] = useState<View>("main");
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const guideRef = useDialog<HTMLDivElement>(sizeGuideOpen, () => setSizeGuideOpen(false));
  const [adding, setAdding] = useState(false);
  const { add, pending } = useCart();
  const wishlist = useWishlist();
  const { push } = useToast();
  const tracked = useRef(false);

  const color = product.colors[colorIndex];
  const sizeOption = product.sizes.find((option) => option.label === size);
  const stock = sizeOption?.stock ?? 0;
  const saved = wishlist.saved(product.id);
  const isShoe = product.role === "shoes";
  const isOneSize = product.role === "bag" || product.role === "accessory";

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    try {
      const key = `zy_view_${product.id}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage can be unavailable in private mode
    }
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "view", productId: product.id, scene: "pdp" }),
    }).catch(() => undefined);
  }, [product.id]);

  const views = useMemo(
    () =>
      [
        { key: "main" as const, label: "正面" },
        { key: "detail" as const, label: "细节" },
        { key: "fabric" as const, label: "面料" },
      ] satisfies Array<{ key: View; label: string }>,
    [],
  );

  const handleAdd = async () => {
    if (!size) {
      push("请选择尺码", { tone: "error" });
      return;
    }
    setAdding(true);
    await add({
      productId: product.id,
      size,
      color: color.name,
      qty,
      productName: product.name,
    });
    setAdding(false);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-7">
        <div className="lg:sticky lg:top-28">
          <div
            className="relative aspect-[4/5] overflow-hidden"
            style={{
              background: `linear-gradient(150deg, ${product.editorial.palette[0]}, ${product.editorial.palette[1]})`,
            }}
          >
            {view !== "fabric" ? (
              <div
                className={cn(
                  "absolute inset-0 transition-transform duration-700",
                  view === "detail" && "scale-[1.9] translate-y-[10%]",
                )}
              >
                <ProductArt
                  art={product.editorial.art}
                  color={color.hex}
                  accent={product.editorial.accent}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage: `repeating-linear-gradient(52deg, ${color.hex}22 0px, ${color.hex}22 2px, transparent 2px, transparent 7px), repeating-linear-gradient(-38deg, ${product.editorial.accent}18 0px, ${product.editorial.accent}18 1px, transparent 1px, transparent 9px)`,
                  }}
                />
                <div className="relative text-center">
                  <p className="eyebrow">Fabric Study</p>
                  <p className="mt-3 font-display text-[38px] leading-none text-ink/80">
                    {product.materials[0]?.name}
                  </p>
                  <p className="num mt-2 text-[12px] tracking-[0.16em] text-ink/60">
                    {product.materials.map((material) => `${material.name} ${material.pct}%`).join(" · ")}
                  </p>
                  <p className="mt-4 text-[10px] tracking-[0.08em] text-ink/45">
                    {product.fabricWeight} · {product.origin}
                  </p>
                </div>
              </div>
            )}

            <div className="absolute left-4 top-4 flex flex-col gap-1.5">
              {product.badges.map((badge) => (
                <span
                  key={badge}
                  className="bg-ivory/85 px-2.5 py-1 text-[8.5px] uppercase tracking-[0.16em] backdrop-blur-sm"
                >
                  {badge}
                </span>
              ))}
            </div>
            <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-ivory/70 px-2.5 py-1.5 backdrop-blur-sm">
              <Icon name="sparkle" size={11} className="text-clay" />
              <span className="text-[8.5px] uppercase tracking-[0.14em]">AI Styled</span>
            </div>
            <span className="num pointer-events-none absolute bottom-4 left-4 text-[9px] tracking-[0.18em] text-ink/40">
              {view === "main" ? "01 / FRONT" : view === "detail" ? "02 / DETAIL" : "03 / FABRIC"}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex gap-2">
              {views.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  aria-label={`查看${item.label}`}
                  aria-pressed={view === item.key}
                  className={cn(
                    "relative h-[74px] w-[58px] overflow-hidden border transition",
                    view === item.key ? "border-ink" : "border-transparent hover:border-line-strong",
                  )}
                  style={{
                    background: `linear-gradient(150deg, ${product.editorial.palette[0]}, ${product.editorial.palette[1]})`,
                  }}
                >
                  {item.key === "fabric" ? (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `repeating-linear-gradient(45deg, ${color.hex}44 0px, ${color.hex}44 1.5px, transparent 1.5px, transparent 6px)`,
                      }}
                    />
                  ) : (
                    <ProductArt
                      art={product.editorial.art}
                      color={color.hex}
                      accent={product.editorial.accent}
                      className={item.key === "detail" ? "scale-[1.45]" : ""}
                    />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => wishlist.toggle(product.id, product.name)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-line-strong transition hover:border-ink",
                saved && "border-clay text-clay",
              )}
              aria-label={saved ? "移出心愿单" : "加入心愿单"}
            >
              <Icon name="heart" size={15} strokeWidth={saved ? 2 : 1.4} />
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-28">
          <p className="eyebrow">
            {product.subcategory} · {product.nameEn}
          </p>
          <h1 className="display mt-2 text-[38px] leading-[1.05] md:text-[46px]">{product.name}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="num text-[20px]">{money(product.price)}</p>
            {product.compareAt ? (
              <>
                <p className="num text-[12px] text-muted-light line-through">{money(product.compareAt)}</p>
                <span className="chip chip-clay h-6">
                  立省 {money(product.compareAt - product.price)}
                </span>
              </>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
            <span className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <Icon
                  key={index}
                  name="star"
                  size={11}
                  className={cn(
                    index < Math.round(product.rating) ? "fill-current text-clay" : "text-line-strong",
                  )}
                  strokeWidth={index < Math.round(product.rating) ? 0 : 1}
                />
              ))}
            </span>
            <span className="num">{product.rating}</span>
            <span>·</span>
            <span>{product.reviewCount} 条评价</span>
            <span>·</span>
            <span>近 30 天售出 {product.sold30d} 件</span>
          </div>

          <p className="mt-5 text-[12.5px] leading-6 text-ink-soft/80">{product.description}</p>

          <div className="mt-7">
            <div className="flex items-center justify-between">
              <p className="label mb-0">
                颜色 · <span className="text-ink">{color.name}</span>
              </p>
              <span className="text-[9.5px] text-muted">{product.colors.length} 色可选</span>
            </div>
            <div className="mt-3 flex gap-2">
              {product.colors.map((option, index) => (
                <button
                  key={option.code}
                  onClick={() => setColorIndex(index)}
                  aria-label={`选择 ${option.name}`}
                  aria-pressed={colorIndex === index}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center border transition",
                    colorIndex === index ? "border-ink" : "border-line-strong hover:border-muted",
                  )}
                >
                  <span className="h-6 w-6 rounded-full" style={{ background: option.hex }} title={option.name} />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="label mb-0">
                尺码 · <span className="text-ink">{size || "请选择"}</span>
              </p>
              {!isOneSize ? (
                <button
                  onClick={() => setSizeGuideOpen(true)}
                  className="flex items-center gap-1 text-[9.5px] text-muted underline underline-offset-4 transition hover:text-ink"
                >
                  <Icon name="sliders" size={11} />
                  尺码指南
                </button>
              ) : (
                <span className="text-[9.5px] text-muted">均码 · 无需选择</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {product.sizes.map((option) => {
                const isSuggested = option.label === suggestedSize;
                const disabled = option.stock <= 0;
                return (
                  <button
                    key={option.label}
                    disabled={disabled}
                    data-size={option.label}
                    aria-label={`尺码 ${option.label}${isSuggested ? "，AI 建议" : ""}`}
                    onClick={() => {
                      setSize(option.label);
                      setQty(1);
                    }}
                    className={cn(
                      "relative h-11 min-w-[52px] border px-3 text-[11px] transition",
                      size === option.label
                        ? "border-ink bg-ink text-ivory"
                        : "border-line-strong hover:border-ink",
                      disabled && "cursor-not-allowed text-muted-light line-through hover:border-line-strong",
                    )}
                    title={disabled ? "暂时缺货" : stockLabel(option.stock)}
                  >
                    {option.label}
                    {isSuggested && !disabled ? (
                      <span
                        className={cn(
                          "absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-1 text-[7.5px] uppercase tracking-[0.08em]",
                          size === option.label ? "bg-ink text-[#c9a87b]" : "bg-clay-soft text-clay",
                        )}
                      >
                        AI 建议
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 flex items-center justify-between text-[9.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <Icon name="info" size={11} />
                {size ? stockLabel(stock) : "选择尺码后可加入购物袋"}
              </span>
              <Link href="/stylist" className="text-clay hover:underline">
                不确定？问造型师
              </Link>
            </p>
          </div>

          <div className="mt-6 flex items-stretch gap-2">
            <div className="flex h-12 items-center border border-line-strong">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="flex h-full w-10 items-center justify-center text-muted transition hover:text-ink"
                aria-label="减少数量"
              >
                <Icon name="minus" size={13} />
              </button>
              <span className="num w-7 text-center text-[12px]">{qty}</span>
              <button
                onClick={() => setQty(Math.min(stock || 1, qty + 1))}
                className="flex h-full w-10 items-center justify-center text-muted transition hover:text-ink"
                aria-label="增加数量"
              >
                <Icon name="plus" size={13} />
              </button>
            </div>
            <button
              onClick={handleAdd}
              disabled={!size || stock <= 0 || adding || pending}
              className="btn btn-primary flex-1"
            >
              {adding ? "正在加入…" : stock <= 0 ? "该尺码暂时缺货" : "加入购物袋"}
              {stock > 0 && !adding ? <Icon name="bag" size={15} /> : null}
            </button>
          </div>
          <button
            onClick={() => wishlist.toggle(product.id, product.name)}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 border border-line-strong text-[10px] tracking-[0.14em] text-ink-soft transition hover:border-ink"
          >
            <Icon name="heart" size={14} strokeWidth={saved ? 2 : 1.4} />
            {saved ? "已加入心愿单" : "加入心愿单"}
          </button>

          <div className="mt-5 grid grid-cols-3 divide-x divide-line border-y border-line py-3 text-center">
            {[
              { icon: "truck" as const, title: "顺丰包邮", note: "满 ¥599 免运费" },
              { icon: "refresh" as const, title: "30 天退换", note: "首程换货运费我们承担" },
              { icon: "shield" as const, title: "正品保障", note: "支持电子发票" },
            ].map((item) => (
              <div key={item.title} className="px-2">
                <Icon name={item.icon} size={15} className="mx-auto text-clay" />
                <p className="mt-1.5 text-[9.5px]">{item.title}</p>
                <p className="mt-0.5 text-[8px] leading-3 text-muted">{item.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 border border-clay/25 bg-clay-soft/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-clay">
                <Icon name="sparkle" size={13} />
                <span className="text-[9px] uppercase tracking-[0.18em]">Why it works for you</span>
              </div>
              <span className="num text-[9px] text-clay/70">
                置信度 {Math.round(reason.confidence * 100)}%
              </span>
            </div>
            <p className="mt-2.5 font-display text-[22px] leading-tight">{reason.headline}</p>
            <p className="mt-1.5 text-[11px] leading-5 text-ink-soft/80">{reason.detail}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {reason.evidence.slice(0, 3).map((evidence) => (
                <span
                  key={`${evidence.source}-${evidence.label}`}
                  className="border border-clay/15 bg-ivory/60 px-2 py-1 text-[8.5px] text-ink-soft/70"
                >
                  {evidence.source} · {evidence.label}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profileTags.slice(0, 3).map((tag) => (
                <span key={tag} className="chip h-6 border-clay/20 text-[8.5px] text-clay-dark">
                  {tag}
                </span>
              ))}
            </div>
            <Link
              href={`/stylist?prompt=${encodeURIComponent(`这件「${product.name}」怎么搭？按我的尺码和场合给一套。`)}`}
              className="mt-3 inline-flex items-center gap-1 text-[9.5px] text-clay underline underline-offset-4"
            >
              让造型师围绕这件搭一套
              <Icon name="arrow-right" size={11} />
            </Link>
          </div>

          <div className="mt-6 divide-y divide-line border-t border-line">
            <details className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[12px]">
                <span>面料与版型</span>
                <Icon name="chevron-down" size={14} className="text-muted transition group-open:rotate-180" />
              </summary>
              <div className="pt-3 text-[11px] leading-6 text-muted">
                <p>
                  {product.fit}
                  {product.length !== "—" ? `，衣长 ${product.length}` : ""}，{product.fabricWeight}。
                </p>
                <p className="mt-1">
                  {product.materials.map((material) => `${material.name} ${material.pct}%`).join(" · ")}，{product.origin}。
                </p>
                <p className="mt-2">{product.story}</p>
              </div>
            </details>
            <details className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[12px]">
                <span>尺码与穿着</span>
                <Icon name="chevron-down" size={14} className="text-muted transition group-open:rotate-180" />
              </summary>
              <div className="pt-3 text-[11px] leading-6 text-muted">
                <p>{product.modelInfo}</p>
                {isOneSize ? (
                  <p className="mt-1">均码设计，不区分尺码；{product.fit}。</p>
                ) : (
                  <>
                    <p className="mt-1">
                      版型：{product.fit}。若介于两个尺码之间，建议结合你的常穿尺码与内搭厚度选择。
                    </p>
                    <button
                      onClick={() => setSizeGuideOpen(true)}
                      className="mt-2 text-[10px] text-clay underline underline-offset-4"
                    >
                      查看完整尺码表
                    </button>
                  </>
                )}
              </div>
            </details>
            <details className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[12px]">
                <span>养护与售后</span>
                <Icon name="chevron-down" size={14} className="text-muted transition group-open:rotate-180" />
              </summary>
              <div className="pt-3 text-[11px] leading-6 text-muted">
                <p>{product.care}</p>
                <p className="mt-2">
                  签收后 30 天内、吊牌完整可无理由退换；首次换货运费由品牌承担。AI 推荐商品适用同一政策。
                </p>
              </div>
            </details>
            <details className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[12px]">
                <span>配送</span>
                <Icon name="chevron-down" size={14} className="text-muted transition group-open:rotate-180" />
              </summary>
              <div className="pt-3 text-[11px] leading-6 text-muted">
                <p>工作日 16:00 前下单当天发出，顺丰标准配送 2–4 个工作日送达；满 ¥599 免运费，未满 ¥20。</p>
              </div>
            </details>
          </div>

          <p className="mt-5 text-[9.5px] leading-4 text-muted/80">
            推荐理由由织言画像引擎与商品特征库生成，{ratingCount} 条评价参与检索。你可以随时在账户中修改画像偏好。
          </p>
        </div>
      </div>

      {sizeGuideOpen ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center">
          <button
            aria-label="关闭尺码指南"
            onClick={() => setSizeGuideOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <div
            ref={guideRef}
            role="dialog"
            aria-modal="true"
            aria-label="尺码指南"
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto bg-ivory p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">Size Guide</p>
                <h2 className="mt-1.5 text-[20px]">尺码指南</h2>
              </div>
              <button
                onClick={() => setSizeGuideOpen(false)}
                aria-label="关闭"
                className="p-1.5 text-muted hover:text-ink"
              >
                <Icon name="close" size={19} />
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted">
              以下为身体净尺寸（cm），不是成衣尺寸。{product.name}为{product.fit}，AI 建议你选择
              <span className="mx-1 text-clay">{suggestedSize}</span>。
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-ink/60 text-[9px] uppercase tracking-[0.12em] text-muted">
                    {isShoe ? (
                      <>
                        <th className="py-2.5 pr-4 font-normal">尺码</th>
                        <th className="py-2.5 pr-4 font-normal">脚长</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 pr-4 font-normal">尺码</th>
                        <th className="py-2.5 pr-4 font-normal">胸围</th>
                        <th className="py-2.5 pr-4 font-normal">腰围</th>
                        <th className="py-2.5 font-normal">臀围</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(isShoe ? SIZE_TABLE.shoes : SIZE_TABLE.tops).map((row) => (
                    <tr
                      key={row.size}
                      className={cn(
                        "border-b border-line",
                        row.size === suggestedSize && "bg-clay-soft/60 text-clay-dark",
                      )}
                    >
                      <td className="py-2.5 pr-4">{row.size}</td>
                      {"foot" in row ? (
                        <td className="py-2.5 pr-4">{row.foot}</td>
                      ) : (
                        <>
                          <td className="py-2.5 pr-4">{row.bust}</td>
                          <td className="py-2.5 pr-4">{row.waist}</td>
                          <td className="py-2.5">{row.hip}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[10px] leading-5 text-muted">
              尺码建议基于身高体重与历史购买推算，仅供参考。介于两码之间时，宽松针织可选小一码，修身款按胸围选择。
            </p>
            <button onClick={() => setSizeGuideOpen(false)} className="btn btn-primary mt-5 w-full">
              知道了
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
