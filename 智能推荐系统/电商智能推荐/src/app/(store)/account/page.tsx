import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_MAP } from "@/lib/data/catalog";
import { makeMemberProfile } from "@/lib/data/member-seeds";
import {
  getEventStream,
  getOrdersForUser,
  getProfileBase,
  getProfileOverride,
  getWishlist,
} from "@/lib/store/db";
import { buildProfileView } from "@/lib/engine/profile";
import { ProductArt } from "@/components/product/ProductArt";
import { ProductCard } from "@/components/product/ProductCard";
import { ProfileEditor } from "@/components/account/ProfileEditor";
import { OrderActions } from "@/components/account/OrderActions";
import { CustomerLogout } from "@/components/account/CustomerLogout";
import { Icon } from "@/components/ui/Icon";
import { maskPhone, requireCustomer } from "@/lib/customer-auth";
import { cn, dateLabel, money } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "个人中心",
  description: "查看订单、风格档案与心愿单。",
  robots: { index: false, follow: false },
};

const TABS = [
  { key: "orders", label: "我的订单" },
  { key: "profile", label: "风格档案" },
  { key: "wishlist", label: "心愿单" },
];

const statusTone: Record<string, string> = {
  待发货: "text-warning border-warning/30 bg-warning/5",
  已发货: "text-moss border-moss/30 bg-moss/5",
  已完成: "text-muted border-line-strong bg-paper",
  已取消: "text-danger border-danger/30 bg-danger/5",
  已退货: "text-clay border-clay/30 bg-clay-soft/50",
};

const signalLabel: Record<string, string> = {
  view: "浏览",
  click: "点击",
  wishlist: "收藏",
  add_to_cart: "加购",
  purchase: "购买",
  search: "搜索",
  chat: "对话",
};

const ORDER_FILTERS = ["待发货", "已发货", "已完成", "退换"] as const;
type OrderFilter = (typeof ORDER_FILTERS)[number];

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const { tab, status } = await searchParams;
  const activeTab = TABS.some((item) => item.key === tab) ? (tab as string) : "orders";
  const statusFilter = ORDER_FILTERS.includes(status as OrderFilter)
    ? (status as OrderFilter)
    : null;
  const customer = await requireCustomer(
    `/account?tab=${activeTab}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`,
  );
  const userId = customer.userId;
  const [override, events, allOrders, wishlistIds, profileBase] = await Promise.all([
    getProfileOverride(userId),
    getEventStream(),
    getOrdersForUser(userId),
    getWishlist(userId),
    getProfileBase(userId),
  ]);
  const base =
    profileBase ??
    makeMemberProfile({
      userId,
      nickname: customer.nickname,
      phone: customer.phone,
    });
  const user = { ...base, ...override, sizes: { ...base.sizes, ...(override.sizes ?? {}) } };
  const profile = buildProfileView(userId, events);
  const wishlistProducts = wishlistIds.map((id) => PRODUCT_MAP[id]).filter(Boolean);
  const filteredOrders = statusFilter
    ? allOrders.filter((order) =>
        statusFilter === "退换"
          ? order.status === "已退货" || order.status === "已取消"
          : order.status === statusFilter,
      )
    : allOrders;
  const orders = filteredOrders;
  const quickStatuses: Array<{
    label: OrderFilter;
    icon: "box" | "truck" | "check" | "refresh";
    count: number;
  }> = [
    { label: "待发货", icon: "box", count: allOrders.filter((order) => order.status === "待发货").length },
    { label: "已发货", icon: "truck", count: allOrders.filter((order) => order.status === "已发货").length },
    { label: "已完成", icon: "check", count: allOrders.filter((order) => order.status === "已完成").length },
    {
      label: "退换",
      icon: "refresh",
      count: allOrders.filter((order) => order.status === "已退货" || order.status === "已取消").length,
    },
  ];
  const styleTags = profile.tags
    .filter(
      (tag) => tag !== "高价值" && tag !== "复购客" && tag !== profile.archetype,
    )
    .slice(0, 4);

  const tierTarget = user.memberTier === "黑金" ? 30000 : 20000;
  const tierProgress = Math.min(100, Math.round((user.lifetimeValue / tierTarget) * 100));

  return (
    <div className="pb-16">
      <section className="bg-ink text-ivory lg:hidden">
        <div className="container-x pb-10 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#c9a87b] text-ink">
                <Icon name="user" size={20} />
              </span>
              <div>
                <p className="text-[8px] uppercase tracking-[0.24em] text-ivory/40">Personal Center</p>
                <h1 className="mt-1 font-display text-[25px] leading-none">
                  欢迎回来，{user.name}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-ivory/50">
                  <span>{user.memberTier}会员</span>
                  <span className="h-1 w-1 rounded-full bg-ivory/25" />
                  <span>
                    {customer.source === "wechat"
                      ? "微信登录"
                      : `手机 ${maskPhone(customer.phone) ?? "已登录"}`}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-ivory/25" />
                  <CustomerLogout className="inline-flex items-center gap-1 text-ivory/50 transition hover:text-ivory" />
                </div>
              </div>
            </div>
            <Link
              href="/account?tab=profile"
              aria-label="编辑风格偏好"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ivory/15 text-ivory/60 transition hover:border-ivory/40 hover:text-ivory"
            >
              <Icon name="settings" size={16} />
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-3 border-t border-ivory/10 pt-4 text-center">
            {[
              [user.points.toLocaleString("zh-CN"), "积分"],
              [String(allOrders.length), "订单"],
              [String(wishlistProducts.length), "心愿"],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="num text-[17px] leading-none">{value}</p>
                <p className="mt-1 text-[8px] uppercase tracking-[0.16em] text-ivory/40">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Link
              href="/stylist"
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-ivory text-[10px] text-ink"
            >
              <Icon name="sparkle" size={13} />
              AI 造型师
            </Link>
            <Link
              href="/shop"
              className="flex h-10 items-center justify-center rounded-full border border-ivory/20 px-4 text-[10px] text-ivory/75"
            >
              继续逛逛
            </Link>
          </div>
        </div>
      </section>

      <div className="container-x relative z-10 -mt-6 lg:hidden">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_18px_40px_-30px_rgba(23,22,15,0.5)]">
          <div className="flex items-center justify-between">
            <p className="text-[11px]">我的订单</p>
            <Link href="/account?tab=orders" className="text-[8.5px] text-muted">
              全部 {allOrders.length} 笔 →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-4">
            {quickStatuses.map((entry) => (
              <Link
                key={entry.label}
                href={`/account?tab=orders&status=${encodeURIComponent(entry.label)}`}
                className="flex flex-col items-center gap-1.5 rounded-xl py-1 text-muted transition active:bg-paper"
              >
                <span className="relative">
                  <Icon name={entry.icon} size={19} />
                  {entry.count > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-clay px-1 text-center text-[7px] leading-4 text-white">
                      {entry.count}
                    </span>
                  ) : null}
                </span>
                <span className="text-[9px]">{entry.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="container-x mt-3 space-y-3 lg:hidden">
        <div className="rounded-2xl border border-line bg-[#eee8dd] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[8px] uppercase tracking-[0.22em] text-muted">AI Style Profile</p>
              <p className="mt-1 font-display text-[24px] leading-none">{profile.archetype}</p>
            </div>
            <Link
              href="/account?tab=profile"
              className="flex h-8 items-center gap-1 rounded-full border border-ink/15 px-3 text-[8.5px] text-ink-soft"
            >
              调整偏好
              <Icon name="chevron-right" size={10} />
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {styleTags.map((tag) => (
              <span key={tag} className="rounded-full bg-white/70 px-2.5 py-1 text-[8.5px] text-ink-soft">
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/10 pt-3 text-[8.5px] text-muted">
            <div>
              <p>常穿尺码</p>
              <p className="num mt-1 text-[10px] text-ink">
                上装 {profile.sizes.top} · 下装 {profile.sizes.bottom} · 鞋 {profile.sizes.shoes}
              </p>
            </div>
            <div>
              <p>偏好预算</p>
              <p className="num mt-1 text-[10px] text-ink">
                {money(profile.priceBand.min)} – {money(profile.priceBand.max)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[8px] leading-4 text-muted">
            画像在后台持续更新，只用于推荐与尺码建议。你不需要手动维护，
            也可以随时调整偏好或关闭个性化。
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px]">我的服务</p>
            <Link href="/help" className="text-[8.5px] text-muted">
              帮助中心 →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-4">
            {[
              { label: "风格档案", href: "/account?tab=profile", icon: "sliders" as const },
              { label: "心愿单", href: "/account?tab=wishlist", icon: "heart" as const },
              { label: "购物袋", href: "/cart", icon: "bag" as const },
              { label: "在线客服", href: "/help", icon: "headphones" as const },
            ].map((entry) => (
              <Link
                key={entry.label}
                href={entry.href}
                className="flex flex-col items-center gap-1.5 rounded-xl py-1 text-muted transition active:bg-paper"
              >
                <Icon name={entry.icon} size={18} />
                <span className="text-[9px]">{entry.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-6 border-b border-line bg-paper lg:mt-0">
        <div className="container-x pt-0 lg:pt-10">
          <div className="hidden flex-col justify-between gap-6 md:flex-row md:items-end lg:flex">
            <div>
              <p className="eyebrow">
                Account · Member No. ZY-{user.joinedAt.replace(/-/g, "").slice(2)}
              </p>
              <h1 className="display mt-3 text-[44px] leading-none md:text-[58px]">
                {user.name}
                <span className="ml-3 align-middle font-sans text-[13px] tracking-wide text-muted">
                  {user.memberTier}会员
                </span>
              </h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-muted">
                <span>{user.city}</span>
                <span>加入于 {user.joinedAt.replace(/-/g, ".")}</span>
                <span className="flex items-center gap-1">
                  <Icon name="sparkle" size={11} className="text-clay" />
                  {profile.tags.slice(0, 3).join(" · ")}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name={customer.source === "wechat" ? "bot" : "phone"} size={11} />
                  {customer.source === "wechat"
                    ? "微信授权登录"
                    : `手机 ${maskPhone(customer.phone) ?? "已登录"}`}
                </span>
                <span className="h-1 w-1 rounded-full bg-muted-light" />
                <span>演示会员账户</span>
                <span className="h-1 w-1 rounded-full bg-muted-light" />
                <CustomerLogout />
              </div>
            </div>
            <div className="flex gap-8 border-t border-line pt-4 md:border-t-0 md:pt-0">
              <div>
                <p className="num text-[24px] leading-none">{user.points.toLocaleString("zh-CN")}</p>
                <p className="mt-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">Points</p>
              </div>
              <div className="border-l border-line pl-8">
                <p className="num text-[24px] leading-none">{allOrders.length}</p>
                <p className="mt-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">Orders</p>
              </div>
              <div className="border-l border-line pl-8">
                <p className="num text-[24px] leading-none">{wishlistProducts.length}</p>
                <p className="mt-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">Saved</p>
              </div>
            </div>
          </div>

          <nav className="-mb-px mt-3 flex gap-6 overflow-x-auto lg:mt-8" aria-label="账户导航">
            {TABS.map((item) => {
              const count =
                item.key === "orders"
                  ? allOrders.length
                  : item.key === "wishlist"
                    ? wishlistProducts.length
                    : undefined;
              return (
                <Link
                  key={item.key}
                  href={`/account?tab=${item.key}`}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-1.5 border-b text-[11.5px] tracking-wide transition",
                    activeTab === item.key
                      ? "border-ink text-ink"
                      : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {item.label}
                  {count !== undefined ? <span className="num text-[9px] text-muted">{count}</span> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <section className="container-x pt-8">
        {activeTab === "orders" && statusFilter ? (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-paper px-3 py-2 text-[9.5px] text-muted lg:rounded-none lg:px-4">
            <span>
              正在查看 <span className="text-ink">{statusFilter}</span> · {orders.length} 笔
            </span>
            <Link href="/account?tab=orders" className="text-clay">
              清除筛选
            </Link>
          </div>
        ) : null}
        {activeTab === "orders" ? (
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-8">
              {orders.length === 0 ? (
                <div className="border border-line bg-paper px-6 py-16 text-center">
                  <Icon name="box" size={26} className="mx-auto text-muted-light" />
                  <p className="mt-4 text-[15px]">
                    {statusFilter ? `没有${statusFilter}订单` : "还没有订单"}
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {statusFilter
                      ? "换个状态看看，或继续逛逛本季新品。"
                      : "本季的羊绒与真丝，正在等你。"}
                  </p>
                  <Link href="/shop" className="btn btn-primary btn-sm mt-5">开始逛逛</Link>
                </div>
              ) : (
                orders.map((order) => {
                  const firstProduct = PRODUCT_MAP[order.items[0]?.productId];
                  return (
                    <article key={order.id} className="border border-line bg-paper">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                          <p className="num text-[10.5px]">{order.orderNo}</p>
                          <p className="text-[9.5px] text-muted">{dateLabel(order.createdAt)}</p>
                          <p className="text-[9.5px] text-muted">渠道 · {order.channel}</p>
                        </div>
                        <span className={cn("chip h-6 text-[9px]", statusTone[order.status])}>
                          {order.status}
                        </span>
                      </div>
                      <div className="px-4 py-4 md:px-5">
                        <div className="flex gap-4">
                          <div
                            className="hidden h-24 w-20 shrink-0 overflow-hidden sm:block"
                            style={{
                              background: firstProduct
                                ? `linear-gradient(150deg, ${firstProduct.editorial.palette[0]}, ${firstProduct.editorial.palette[1]})`
                                : "#eee8dd",
                            }}
                          >
                            <ProductArt
                              art={order.items[0]?.art ?? "coat"}
                              color={
                                firstProduct?.colors.find((c) => c.name === order.items[0]?.color)?.hex ??
                                firstProduct?.colors[0].hex ??
                                "#8A7558"
                              }
                              accent={firstProduct?.editorial.accent ?? "#5d5040"}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-[12px]">{order.items[0]?.name}</p>
                                {order.items.length > 1 ? (
                                  <p className="mt-1 text-[10px] text-muted">
                                    等共 {order.items.length} 件商品
                                  </p>
                                ) : (
                                  <p className="mt-1 text-[10px] text-muted">
                                    {order.items[0]?.color} / {order.items[0]?.size}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="num text-[13px]">{money(order.total)}</p>
                                {order.discount > 0 ? (
                                  <p className="num mt-0.5 text-[9px] text-clay">已优惠 {money(order.discount)}</p>
                                ) : null}
                                {order.paymentStatus === "refunded" ? (
                                  <p className="num mt-0.5 text-[9px] text-clay">
                                    已退款 {money(order.refundAmount ?? order.total)}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-3 space-y-1 text-[9.5px] text-muted">
                              {order.trackingNo ? (
                                <p className="flex items-center gap-1.5">
                                  <Icon name="truck" size={12} />
                                  顺丰 {order.trackingNo} · 预计 1–2 天送达
                                </p>
                              ) : (
                                <p className="flex items-center gap-1.5">
                                  <Icon name="clock" size={12} />
                                  预计 1 个工作日内发出
                                </p>
                              )}
                              <p className="flex items-center gap-1.5">
                                <Icon name="box" size={12} />
                                {order.address.province}{order.address.city}{order.address.district}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                          <Link
                            href={`/product/${firstProduct?.slug ?? ""}`}
                            className="btn btn-ghost btn-sm h-8"
                          >
                            查看商品
                          </Link>
                          <OrderActions
                            orderNo={order.orderNo}
                            status={order.status}
                            total={order.total}
                          />
                          <Link href="/help#returns" className="btn btn-ghost btn-sm h-8">
                            退换政策
                          </Link>
                          <Link
                            href="/stylist"
                            className="ml-auto flex items-center gap-1.5 text-[9.5px] text-clay hover:underline"
                          >
                            <Icon name="sparkle" size={11} />
                            找造型师搭配
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <aside className="hidden lg:block lg:col-span-4">
              <div className="border border-line bg-ink p-6 text-ivory">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[8.5px] uppercase tracking-[0.22em] text-ivory/40">ZHIYAN CIRCLE</p>
                    <p className="mt-2 font-display text-[26px] leading-none">{user.memberTier}会员</p>
                  </div>
                  <Icon name="sparkle" size={18} className="text-[#c9a87b]" />
                </div>
                <div className="mt-8 flex items-end justify-between">
                  <div>
                    <p className="num text-[30px] leading-none">{user.points.toLocaleString("zh-CN")}</p>
                    <p className="mt-1 text-[8.5px] uppercase tracking-[0.14em] text-ivory/40">可用积分</p>
                  </div>
                  <p className="text-[9px] text-ivory/50">1,000 分 = ¥100</p>
                </div>
                <div className="mt-6">
                  <div className="flex justify-between text-[8.5px] text-ivory/45">
                    <span>距离下一等级</span>
                    <span className="num">{money(Math.max(0, tierTarget - user.lifetimeValue))}</span>
                  </div>
                  <div className="mt-2 h-[3px] bg-ivory/15">
                    <div className="h-full bg-[#c9a87b]" style={{ width: `${tierProgress}%` }} />
                  </div>
                </div>
                <p className="mt-5 text-[9px] leading-4 text-ivory/35">
                  累计消费 {money(user.lifetimeValue)} · 共 {user.ordersCount} 笔订单 · 生日双倍积分
                </p>
              </div>

              <div className="mt-4 border border-line bg-paper p-5">
                <p className="eyebrow">Service</p>
                <div className="mt-3 space-y-3 text-[10.5px]">
                  {[
                    ["帮助中心与政策", "/help"],
                    ["尺码指南", "/help#size"],
                    ["面料与养护", "/help#care"],
                    ["AI 推荐说明", "/help#ai"],
                  ].map(([label, href]) => (
                    <Link
                      key={label}
                      href={href}
                      className="flex items-center justify-between text-muted transition hover:text-ink"
                    >
                      {label}
                      <Icon name="arrow-right" size={12} />
                    </Link>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[9.5px] text-muted">
                  <Icon name="headphones" size={13} />
                  客服在线 09:00–22:00
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {activeTab === "profile" ? (
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <div className="border border-line bg-paper p-5 md:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="eyebrow">Style Profile · 风格档案</p>
                    <h2 className="display mt-2 text-[28px]">{profile.archetype}</h2>
                  </div>
                  <div className="text-right">
                    <p className="num text-[11px] text-clay">{profile.rfm.segment}</p>
                    <p className="mt-0.5 text-[8.5px] text-muted">偏好状态</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {profile.tags.map((tag) => (
                    <span key={tag} className="chip h-6 text-[9px]">{tag}</span>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["近30天互动", profile.behavior.last30d],
                    ["收藏", profile.behavior.wishlists],
                    ["加购", profile.behavior.carts],
                    ["购买", profile.behavior.purchases],
                  ].map(([label, value]) => (
                    <div key={label} className="border border-line p-3">
                      <p className="num text-[20px] leading-none">{value}</p>
                      <p className="mt-1.5 text-[8.5px] tracking-wide text-muted">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-3">
                  <div>
                    <p className="label">风格偏好</p>
                    <div className="space-y-2">
                      {profile.affinities.styles.slice(0, 3).map((item) => (
                        <div key={item.tag} className="flex items-center gap-2">
                          <span className="w-12 text-[10px]">{item.tag}</span>
                          <div className="h-[3px] flex-1 bg-line">
                            <div className="h-full bg-ink/60" style={{ width: `${Math.round(item.weight * 100)}%` }} />
                          </div>
                          <span className="num w-6 text-right text-[8px] text-muted">
                            {Math.round(item.weight * 100)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="label">颜色偏好</p>
                    <div className="space-y-2">
                      {profile.affinities.colors.slice(0, 3).map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <span className="w-12 text-[10px]">{item.name}</span>
                          <div className="h-[3px] flex-1 bg-line">
                            <div className="h-full bg-clay/60" style={{ width: `${Math.round(item.weight * 100)}%` }} />
                          </div>
                          <span className="num w-6 text-right text-[8px] text-muted">
                            {Math.round(item.weight * 100)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="label">场景偏好</p>
                    <div className="space-y-2">
                      {profile.affinities.occasions.slice(0, 3).map((item) => (
                        <div key={item.tag} className="flex items-center gap-2">
                          <span className="w-12 text-[10px]">{item.tag}</span>
                          <div className="h-[3px] flex-1 bg-line">
                            <div className="h-full bg-moss/50" style={{ width: `${Math.round(item.weight * 100)}%` }} />
                          </div>
                          <span className="num w-6 text-right text-[8px] text-muted">
                            {Math.round(item.weight * 100)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-line pt-4 text-[9.5px] leading-5 text-muted">
                  <p>常穿尺码：上衣 {profile.sizes.top} / 下装 {profile.sizes.bottom} / 鞋 {profile.sizes.shoes}</p>
                  <p>价格带：{money(profile.priceBand.min)} – {money(profile.priceBand.max)}</p>
                  <p>
                    系统会在后台持续更新偏好，无需手动维护；本次更新时间{" "}
                    {new Date(profile.updatedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}。
                  </p>
                </div>
              </div>

              <div className="border border-line bg-[#eee8dd] p-5">
                <p className="eyebrow">Recent Signals</p>
                <div className="mt-3 divide-y divide-ink/10">
                  {profile.recentProducts.slice(0, 4).map((item) => {
                    const product = PRODUCT_MAP[item.productId];
                    return (
                      <div
                        key={`${item.productId}-${item.ts}`}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="h-9 w-7 shrink-0"
                            style={{
                              background: product
                                ? `linear-gradient(150deg, ${product.editorial.palette[0]}, ${product.editorial.palette[1]})`
                                : "#e3dcd0",
                            }}
                          >
                            {product ? (
                              <ProductArt
                                art={product.editorial.art}
                                color={product.colors[0].hex}
                                accent={product.editorial.accent}
                              />
                            ) : null}
                          </span>
                          <div>
                            <Link
                              href={`/product/${product?.slug ?? ""}`}
                              className="text-[11px] hover:text-clay"
                            >
                              {item.name}
                            </Link>
                            <p className="text-[8.5px] text-muted">
                              {signalLabel[item.type] ?? item.type}
                            </p>
                          </div>
                        </div>
                        <span className="text-[8.5px] text-muted">{dateLabel(item.ts)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <ProfileEditor
                user={{
                  ...user,
                  styleKeywords: user.styleKeywords,
                  favoriteColors: user.favoriteColors,
                  occasions: user.occasions,
                }}
              />
              <div className="mt-4 border border-line bg-paper p-5">
                <p className="flex items-center gap-2 text-[11px]">
                  <Icon name="shield" size={14} className="text-clay" />
                  关于你的数据
                </p>
                <p className="mt-2 text-[10px] leading-5 text-muted">
                  画像只用于本次购物体验，不会出售给第三方。你可以随时更新偏好；
                  若希望关闭个性化，可联系客服清除行为数据。尺码与身形信息仅用于尺码建议。
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "wishlist" ? (
          <div>
            <div className="flex items-end justify-between">
              <div>
                <p className="eyebrow">Saved Pieces</p>
                <h2 className="display mt-2 text-[32px] md:text-[40px]">心愿单</h2>
              </div>
              {wishlistProducts.length ? (
                <p className="text-[10px] text-muted">共 {wishlistProducts.length} 件</p>
              ) : null}
            </div>
            {wishlistProducts.length === 0 ? (
              <div className="mt-6 border border-line bg-paper px-6 py-16 text-center">
                <Icon name="heart" size={26} className="mx-auto text-muted-light" />
                <p className="mt-4 text-[15px]">心愿单还是空的</p>
                <p className="mt-1.5 text-[11px] text-muted">在商品页点击心形，收藏你喜欢的单品。</p>
                <Link href="/shop" className="btn btn-primary btn-sm mt-5">去逛逛</Link>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
                {wishlistProducts.map((product, index) => (
                  <ProductCard key={product.id} product={product} index={index} />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
