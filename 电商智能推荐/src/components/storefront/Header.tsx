"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { CATEGORIES } from "@/lib/data/catalog";
import { ProductArt } from "@/components/product/ProductArt";
import { SearchOverlay } from "@/components/storefront/SearchOverlay";
import { useCart } from "@/components/providers/Cart";
import { useWishlist } from "@/components/providers/Wishlist";
import { Icon } from "@/components/ui/Icon";
import { cn, money } from "@/lib/utils/format";
import { useDialog } from "@/lib/hooks/useDialog";

type HeaderCustomer = {
  nickname: string;
  avatarTone: string;
  source: "phone" | "wechat";
};

const PRIMARY_NAV = [
  { label: "新品", href: "/shop?sort=newest" },
  { label: "女装", href: "/shop", mega: true },
  { label: "针织", href: "/shop?category=knitwear" },
  { label: "鞋履", href: "/shop?category=shoes" },
  { label: "AI 造型师", href: "/stylist", sparkle: true },
  { label: "关于", href: "/#story" },
];

const SCENES = [
  { label: "通勤衣橱", href: "/shop?occasion=%E9%80%9A%E5%8B%A4", note: "利落、得体、可重复" },
  { label: "约会与晚宴", href: "/shop?occasion=%E7%BA%A6%E4%BC%9A", note: "低饱和的光泽" },
  { label: "周末与旅行", href: "/shop?occasion=%E6%97%85%E8%A1%8C", note: "轻装、可折叠" },
];

function WeaveMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} fill="none" aria-hidden="true">
      <path d="M4 4v24M12 4v24M20 4v24M28 4v24" stroke="currentColor" strokeWidth="1" strokeOpacity="0.45" />
      <path d="M4 4h24M4 12h24M4 20h24M4 28h24" stroke="currentColor" strokeWidth="1" strokeOpacity="0.45" />
      <rect x="12" y="12" width="8" height="8" fill="currentColor" />
      <rect x="4" y="20" width="8" height="8" fill="currentColor" fillOpacity="0.35" />
      <rect x="20" y="4" width="8" height="8" fill="currentColor" fillOpacity="0.35" />
    </svg>
  );
}

export function Header({
  featured,
  customer,
}: {
  featured: Product[];
  customer?: HeaderCustomer | null;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const { cart, setOpen } = useCart();
  const wishlist = useWishlist();
  const count = cart?.summary.itemCount ?? 0;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMegaOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mobileMenuRef = useDialog<HTMLDivElement>(mobileOpen, () => setMobileOpen(false));

  return (
    <>
      <div className="bg-ink text-ivory">
        <div className="container-x flex h-9 items-center justify-between text-[10px] tracking-[0.14em]">
          <p className="hidden items-center gap-2 sm:flex">
            <span className="pulse-dot h-1 w-1 rounded-full bg-[#c9a87b]" />
            AI STYLIST ONLINE · 24H
          </p>
          <p className="truncate text-center text-[9.5px] text-ivory/70 sm:text-[10px]">
            秋冬系列已上线 · 满 ¥599 顺丰包邮 · 30 天无理由退换
          </p>
          <Link
            href="/account"
            className="hidden items-center gap-1.5 text-ivory/70 transition hover:text-ivory sm:flex"
          >
            会员中心
            <Icon name="arrow-up-right" size={11} />
          </Link>
        </div>
      </div>

      <header
        className={cn(
          "sticky top-0 z-50 border-b border-transparent bg-ivory/92 backdrop-blur-md transition-[border,box-shadow] duration-300",
          scrolled && "border-line shadow-[0_10px_30px_-26px_rgba(23,22,15,0.4)]",
        )}
        onMouseLeave={() => setMegaOpen(false)}
      >
        <div className="container-x flex h-[72px] items-center justify-between gap-6 md:h-20">
          <div className="flex items-center gap-10">
            <Link href="/" aria-label="织言首页" className="flex items-baseline gap-3">
              <WeaveMark className="text-ink" />
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[26px] leading-none tracking-[0.04em]">织言</span>
                <span className="hidden text-[9px] font-medium uppercase tracking-[0.34em] text-muted sm:inline">
                  Zhiyan
                </span>
              </span>
            </Link>

            <nav aria-label="主导航" className="hidden items-center gap-7 lg:flex">
              {PRIMARY_NAV.map((item) => (
                <div
                  key={item.label}
                  onMouseEnter={() => setMegaOpen(Boolean(item.mega))}
                  className="relative flex h-20 items-center"
                >
                  <Link
                    href={item.href}
                    aria-expanded={item.mega ? megaOpen : undefined}
                    className={cn(
                      "flex items-center gap-1.5 text-[11.5px] tracking-[0.1em] text-ink-soft transition hover:text-clay",
                      item.sparkle && "text-clay",
                      pathname === item.href && !item.mega && "text-clay",
                    )}
                  >
                    {item.sparkle ? <Icon name="sparkle" size={13} /> : null}
                    {item.label}
                    {item.mega ? (
                      <Icon
                        name="chevron-down"
                        size={11}
                        className={cn("transition-transform", megaOpen && "rotate-180")}
                      />
                    ) : null}
                  </Link>
                </div>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-10 items-center gap-2 px-2 text-ink-soft transition hover:text-clay sm:px-3"
              aria-label="搜索"
            >
              <Icon name="search" size={17} />
              <span className="hidden text-[10px] tracking-[0.12em] text-muted lg:inline">搜索 / ⌘K</span>
            </button>
            <Link
              href="/account?tab=wishlist"
              className="relative flex h-10 w-10 items-center justify-center text-ink-soft transition hover:text-clay"
              aria-label="心愿单"
            >
              <Icon name="heart" size={17} />
              {wishlist.items.length > 0 ? (
                <span className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-clay" />
              ) : null}
            </Link>
            {customer ? (
              <Link
                href="/account"
                className="hidden h-10 items-center gap-2 px-1.5 text-ink-soft transition hover:text-clay sm:flex"
                aria-label={`我的账户，${customer.nickname}`}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                  style={{ background: customer.avatarTone }}
                >
                  <Icon name="user" size={12} />
                </span>
                <span className="hidden text-[9.5px] tracking-wide xl:inline">我的账户</span>
              </Link>
            ) : (
              <Link
                href="/login?next=/account"
                className="hidden h-10 items-center gap-1.5 px-1.5 text-ink-soft transition hover:text-clay sm:flex"
                aria-label="登录"
              >
                <Icon name="user" size={17} />
                <span className="hidden text-[10px] tracking-wide xl:inline">登录</span>
              </Link>
            )}
            <button
              onClick={() => setOpen(true)}
              className="relative flex h-10 items-center gap-2 px-2 text-ink-soft transition hover:text-clay sm:px-3"
              aria-label={`购物袋，${count} 件`}
            >
              <Icon name="bag" size={18} />
              <span className="num text-[11px]">{count.toString().padStart(2, "0")}</span>
            </button>
            <Link href="/stylist" className="btn btn-primary btn-sm ml-1 hidden xl:inline-flex">
              <Icon name="sparkle" size={12} />
              问造型师
            </Link>
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-9 items-center justify-center text-ink lg:hidden"
              aria-label="打开菜单"
            >
              <Icon name="menu" size={20} />
            </button>
          </div>
        </div>

        {megaOpen ? (
          <div
            className="absolute inset-x-0 top-full hidden border-b border-line bg-ivory/98 shadow-[0_30px_60px_-40px_rgba(23,22,15,0.5)] backdrop-blur-md lg:block"
            onMouseEnter={() => setMegaOpen(true)}
          >
            <div className="container-x grid grid-cols-12 gap-10 py-10">
              <div className="col-span-5">
                <p className="eyebrow">Categories / 品类</p>
                <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1">
                  {CATEGORIES.map((category, index) => (
                    <Link
                      key={category.key}
                      href={`/shop?category=${category.key}`}
                      className="group flex items-baseline justify-between border-b border-line/70 py-2.5"
                    >
                      <span className="flex items-baseline gap-3">
                        <span className="num text-[9px] text-muted-light">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="text-[13px] transition group-hover:text-clay">
                          {category.label}
                        </span>
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-light">
                        {category.labelEn}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="col-span-3">
                <p className="eyebrow">By Occasion / 场景</p>
                <div className="mt-5 space-y-5">
                  {SCENES.map((scene) => (
                    <Link key={scene.label} href={scene.href} className="group block">
                      <p className="text-[13px] transition group-hover:text-clay">{scene.label}</p>
                      <p className="mt-1 text-[10.5px] tracking-wide text-muted">{scene.note}</p>
                    </Link>
                  ))}
                </div>
                <Link
                  href="/stylist"
                  className="mt-7 flex items-center gap-2 border-t border-line pt-5 text-[11px] text-clay"
                >
                  <Icon name="sparkle" size={13} />
                  让 AI 按场景搭一套
                </Link>
              </div>
              <div className="col-span-4 grid grid-cols-2 gap-4">
                {featured.slice(0, 2).map((product) => (
                  <Link
                    key={product.id}
                    href={`/product/${product.slug}`}
                    className="group block"
                  >
                    <div
                      className="relative aspect-[3/4] overflow-hidden"
                      style={{
                        background: `linear-gradient(150deg, ${product.editorial.palette[0]}, ${product.editorial.palette[1]})`,
                      }}
                    >
                      <ProductArt
                        art={product.editorial.art}
                        color={product.colors[0].hex}
                        accent={product.editorial.accent}
                        className="transition duration-700 group-hover:scale-[1.04]"
                      />
                      <span className="absolute left-3 top-3 bg-ivory/80 px-2 py-1 text-[8px] uppercase tracking-[0.18em]">
                        {product.badges[0] ?? "New"}
                      </span>
                    </div>
                    <p className="mt-3 text-[12px]">{product.name}</p>
                    <p className="num mt-1 text-[11px] text-muted">{money(product.price)}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {mobileOpen ? (
        <div
          ref={mobileMenuRef}
          role="dialog"
          aria-modal="true"
          aria-label="网站导航"
          className="fixed inset-0 z-[96] flex flex-col bg-ivory lg:hidden"
        >
          <div className="flex h-[72px] items-center justify-between border-b border-line px-5">
            <span className="font-display text-[24px]">织言</span>
            <button onClick={() => setMobileOpen(false)} aria-label="关闭菜单" className="p-2">
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <nav className="divide-y divide-line">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between py-4"
                >
                  <span className={cn("text-[18px] tracking-wide", item.sparkle && "text-clay")}>
                    {item.label}
                  </span>
                  <Icon name="arrow-up-right" size={16} className="text-muted" />
                </Link>
              ))}
            </nav>
            <p className="eyebrow mt-8">Categories</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {CATEGORIES.map((category) => (
                <Link
                  key={category.key}
                  href={`/shop?category=${category.key}`}
                  onClick={() => setMobileOpen(false)}
                  className="chip h-9 justify-center"
                >
                  {category.label}
                </Link>
              ))}
            </div>
            <div className="mt-8 grid gap-2">
              <Link
                href={customer ? "/account" : "/login?next=/account"}
                onClick={() => setMobileOpen(false)}
                className="btn btn-outline w-full"
              >
                {customer ? "我的账户" : "登录 / 注册"}
              </Link>
              <Link href="/help" onClick={() => setMobileOpen(false)} className="btn btn-ghost w-full">
                帮助中心
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
