import type { Metadata } from "next";
import Link from "next/link";
import { getEventStream, getOrderByNo } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { PRODUCT_MAP } from "@/lib/data/catalog";
import { buildProfileView } from "@/lib/engine/profile";
import { recommend } from "@/lib/engine/recommend";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductArt } from "@/components/product/ProductArt";
import { Icon } from "@/components/ui/Icon";
import { money, dateLabel } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "订单已确认",
  robots: { index: false, follow: false },
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderNo?: string }>;
}) {
  const { orderNo } = await searchParams;
  const userId = await currentUserId();
  const candidate = orderNo ? await getOrderByNo(orderNo) : undefined;
  const order = candidate && candidate.userId === userId ? candidate : undefined;

  if (!order) {
    return (
      <div className="container-x flex min-h-[52vh] flex-col items-center justify-center py-20 text-center">
        <Icon name="alert" size={28} className="text-muted-light" />
        <h1 className="display mt-4 text-[32px]">未找到这笔订单</h1>
        <p className="mt-2 text-[12px] text-muted">订单号可能有误，或订单还未同步。</p>
        <Link href="/account?tab=orders" className="btn btn-primary mt-6">查看我的订单</Link>
      </div>
    );
  }

  const events = await getEventStream();
  const profile = buildProfileView(userId, events);
  const recs = recommend(
    {
      userId,
      scene: "home",
      limit: 4,
      triggerProductId: order.items[0]?.productId,
      excludeProductIds: order.items.map((item) => item.productId),
    },
    { events, userProfile: profile },
  );

  return (
    <div className="container-x pt-10 md:pt-14">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-moss text-ivory">
              <Icon name="check" size={19} />
            </span>
            <div>
              <p className="eyebrow">Payment confirmed</p>
              <p className="text-[11px] text-muted">演示支付成功 · 不会产生真实扣款</p>
            </div>
          </div>
          <h1 className="display mt-6 text-[44px] leading-[1.05] md:text-[58px]">
            谢谢你，{order.address.name}。
            <br />
            衣服正在被仔细打包。
          </h1>
          <p className="mt-4 max-w-xl text-[12px] leading-6 text-muted">
            订单 {order.orderNo} 已确认。我们会在 1 个工作日内发出，并通过短信与邮件同步物流信息。
            如需修改地址或尺码，请在发货前联系客服。
          </p>

          <div className="mt-8 grid gap-4 border-y border-line py-5 sm:grid-cols-3">
            <div>
              <p className="text-[8.5px] uppercase tracking-[0.16em] text-muted">订单编号</p>
              <p className="num mt-1.5 text-[12px]">{order.orderNo}</p>
            </div>
            <div>
              <p className="text-[8.5px] uppercase tracking-[0.16em] text-muted">下单时间</p>
              <p className="mt-1.5 text-[11.5px]">{dateLabel(order.createdAt)}</p>
            </div>
            <div>
              <p className="text-[8.5px] uppercase tracking-[0.16em] text-muted">状态</p>
              <p className="mt-1.5 text-[11.5px] text-moss">{order.status}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {order.items.map((item) => {
              const product = PRODUCT_MAP[item.productId];
              const colorHex =
                product?.colors.find((color) => color.name === item.color)?.hex ??
                product?.colors[0].hex ??
                "#8A7558";
              return (
                <div key={`${item.productId}-${item.size}`} className="flex items-center gap-4 border-b border-line pb-4">
                  <div className="h-24 w-20 shrink-0 overflow-hidden bg-bone">
                    <ProductArt art={item.art} color={colorHex} accent="#5d5040" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">{item.name}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {item.color} / {item.size} · ×{item.qty}
                    </p>
                    <p className="num mt-1 text-[11px]">{money(item.unitPrice * item.qty)}</p>
                  </div>
                  <span className="text-[9px] text-muted">已购</span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="label">配送地址</p>
              <p className="text-[11.5px]">{order.address.name} · {order.address.phone}</p>
              <p className="mt-1 text-[10.5px] leading-5 text-muted">
                {order.address.province}{order.address.city}{order.address.district}
                <br />
                {order.address.detail}
              </p>
            </div>
            <div>
              <p className="label">支付方式</p>
              <p className="text-[11.5px]">{order.paymentMethod}</p>
              <p className="mt-1 text-[10.5px] leading-5 text-muted">
                商品 {money(order.subtotal)}
                {order.discount > 0 ? ` · 优惠 -${money(order.discount)}` : ""}
                <br />
                配送 {order.shipping === 0 ? "免运费" : money(order.shipping)} · 实付 {money(order.total)}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <Link href="/account?tab=orders" className="btn btn-primary">查看订单</Link>
            <Link href="/shop" className="btn btn-ghost">继续逛逛</Link>
            <Link href="/stylist" className="btn btn-ghost">
              <Icon name="sparkle" size={13} />
              为新衣搭配
            </Link>
          </div>

          <div className="mt-6 flex items-center gap-2 border border-line bg-paper px-4 py-3 text-[10px] text-muted">
            <Icon name="gift" size={14} className="text-clay" />
            本单已获得 {order.pointsEarned} 积分，可在下次购物时抵扣。
          </div>
        </div>

        <aside className="lg:col-span-4">
          <div className="border border-line bg-[#eee8dd] p-6 lg:sticky lg:top-28">
            <p className="eyebrow">A note from ZHIYAN</p>
            <p className="mt-3 font-display text-[26px] leading-tight">
              “衣服真正的价值，
              <br />
              从穿上它那天开始。”
            </p>
            <p className="mt-3 text-[10.5px] leading-5 text-muted">
              如果尺码或版型不合预期，30 天内可免费换货一次。把吊牌保留好，剩下的交给我们。
            </p>
            <div className="mt-6 space-y-3 border-t border-ink/15 pt-4 text-[10px]">
              <p className="flex items-center gap-2"><Icon name="truck" size={13} /> 预计 2–4 个工作日送达</p>
              <p className="flex items-center gap-2"><Icon name="refresh" size={13} /> 30 天无理由退换</p>
              <p className="flex items-center gap-2"><Icon name="headphones" size={13} /> 客服在线 09:00–22:00</p>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-16">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="eyebrow">Styled for what&apos;s next</p>
            <h2 className="display mt-2 text-[30px] md:text-[38px]">为新衣，再添一件。</h2>
          </div>
          <Link href="/stylist" className="text-[10px] text-clay hover:underline">让造型师搭整套 →</Link>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
          {recs.items.map((item, index) => (
            <ProductCard
              key={item.product.id}
              product={item.product}
              index={index}
              score={item.score}
              reason={{ headline: item.reason.headline, detail: item.reason.detail }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
