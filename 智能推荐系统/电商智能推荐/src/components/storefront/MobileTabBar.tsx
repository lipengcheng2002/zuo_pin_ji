"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/format";

type TabItem = {
  href: string;
  label: string;
  icon: "home" | "grid" | "sparkle" | "heart" | "user";
  center?: boolean;
};

const ITEMS: TabItem[] = [
  { href: "/", label: "首页", icon: "home" },
  { href: "/shop", label: "分类", icon: "grid" },
  { href: "/stylist", label: "造型师", icon: "sparkle", center: true },
  { href: "/account?tab=wishlist", label: "心愿", icon: "heart" },
  { href: "/account", label: "我的", icon: "user" },
];

export function MobileTabBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/checkout")) return null;

  const active = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/shop") return pathname.startsWith("/shop") || pathname.startsWith("/product");
    if (href === "/stylist") return pathname.startsWith("/stylist");
    if (href === "/account") return pathname.startsWith("/account");
    return false;
  };

  return (
    <nav
      aria-label="移动端主导航"
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-line/80 bg-ivory/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-24px_rgba(23,22,15,0.45)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-end px-2">
        {ITEMS.map((item) => {
          const isActive = active(item.href);
          if (item.center) {
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="group flex h-16 flex-col items-center justify-end pb-2.5"
              >
                <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-ivory shadow-[0_10px_24px_-12px_rgba(23,22,15,0.7)] ring-4 ring-ivory transition group-active:scale-95">
                  <Icon name="sparkle" size={20} />
                </span>
                <span
                  className={cn(
                    "mt-1 text-[9px] tracking-wide",
                    isActive ? "text-ink" : "text-muted",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[9px] tracking-wide transition",
                isActive ? "text-ink" : "text-muted",
              )}
            >
              <span className="relative">
                <Icon name={item.icon} size={19} />
                {isActive ? (
                  <span className="absolute -bottom-1.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-clay" />
                ) : null}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
