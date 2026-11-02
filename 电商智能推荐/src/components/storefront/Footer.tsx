"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/providers/Toast";

const COLUMNS = [
  {
    title: "选购",
    links: [
      { label: "全部单品", href: "/shop" },
      { label: "本季新品", href: "/shop?sort=newest" },
      { label: "羊绒针织", href: "/shop?category=knitwear" },
      { label: "外套", href: "/shop?category=outerwear" },
      { label: "鞋履与包袋", href: "/shop?category=bags" },
    ],
  },
  {
    title: "服务",
    links: [
      { label: "AI 造型师", href: "/stylist" },
      { label: "我的订单", href: "/account?tab=orders" },
      { label: "配送与退换", href: "/help#shipping" },
      { label: "尺码指南", href: "/help#size" },
      { label: "面料与养护", href: "/help#care" },
    ],
  },
  {
    title: "关于织言",
    links: [
      { label: "品牌故事", href: "/#story" },
      { label: "面料溯源", href: "/#story" },
      { label: "可持续计划", href: "/help#sustainability" },
      { label: "AI 透明度", href: "/help#ai" },
      { label: "会员中心", href: "/account" },
    ],
  },
];

export function Footer() {
  const [email, setEmail] = useState("");
  const { push } = useToast();

  return (
    <footer className="mt-24 bg-ink pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-ivory lg:pb-0">
      <div className="container-x">
        <div className="grid gap-12 border-b border-ivory/12 py-16 md:grid-cols-12 md:py-20">
          <div className="md:col-span-5">
            <p className="eyebrow text-ivory/40">Newsletter · 经纬信笺</p>
            <h2 className="display mt-4 text-[34px] leading-[1.1] md:text-[42px]">
              每月一封，
              <br />
              关于面料、比例与生活。
            </h2>
            <p className="mt-4 max-w-sm text-[12px] leading-6 text-ivory/55">
              新品预览、造型手记与 AI 推荐洞察。不频繁，不喧哗。订阅即表示同意《隐私政策》。
            </p>
            <form
              className="mt-6 flex max-w-md border-b border-ivory/30 focus-within:border-ivory"
              onSubmit={(event) => {
                event.preventDefault();
                if (!/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(email)) {
                  push("请输入有效的邮箱地址", { tone: "error" });
                  return;
                }
                push("订阅成功", { tone: "success", detail: "下一封经纬信笺会按月送达。" });
                setEmail("");
              }}
            >
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                placeholder="你的邮箱"
                aria-label="邮箱地址"
                className="h-12 flex-1 bg-transparent text-[13px] placeholder:text-ivory/35 focus:outline-none"
              />
              <button
                type="submit"
                className="flex h-12 items-center gap-2 px-2 text-[10px] tracking-[0.18em] text-ivory/70 transition hover:text-ivory"
              >
                订阅
                <Icon name="arrow-right" size={14} />
              </button>
            </form>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-6 md:col-start-7">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/40">{column.title}</p>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[12px] text-ivory/70 transition hover:text-ivory"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-8 py-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-display text-[52px] leading-none tracking-[0.04em] text-ivory/90 md:text-[76px]">
              织言
            </p>
            <p className="mt-2 text-[9px] uppercase tracking-[0.4em] text-ivory/35">
              Zhiyan Atelier · Since 2019
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[9.5px] uppercase tracking-[0.14em] text-ivory/40">
            <span className="flex items-center gap-1.5">
              <Icon name="truck" size={13} /> 满 ¥599 顺丰包邮
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="refresh" size={13} /> 30 天退换
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="leaf" size={13} /> FSC 认证包装
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="shield" size={13} /> 可解释推荐
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-ivory/10 py-6 text-[10px] text-ivory/35 md:flex-row md:items-center md:justify-between">
          <p>© 2026 织言 ZHIYAN. 保留所有权利。本页面为演示项目，商品与数据均为示例。</p>
          <div className="flex flex-wrap gap-5">
            <Link href="/help" className="transition hover:text-ivory/70">隐私政策</Link>
            <Link href="/help" className="transition hover:text-ivory/70">使用条款</Link>
            <Link href="/help#ai" className="transition hover:text-ivory/70">AI 推荐说明</Link>
            <span>沪 ICP 备 2026000000 号</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
