import type { Metadata } from "next";
import Link from "next/link";
import { bestSellers, CATEGORIES, PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import { getEventStream } from "@/lib/store/db";
import { buildProfileView } from "@/lib/engine/profile";
import { currentUserId } from "@/lib/customer-auth";
import { recommend } from "@/lib/engine/recommend";
import { ProductArt } from "@/components/product/ProductArt";
import { ProductCard } from "@/components/product/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "织言 ZHIYAN — 懂你的 AI 时装衣橱",
  description:
    "以面料与剪裁为核心的当代衣橱。AI 造型师通过意图理解与多路召回，为每一次出门找到恰如其分的那一件。",
  alternates: { canonical: "/" },
};

const LOOKS = [
  {
    id: "p03",
    occasion: "通勤",
    title: "长堤之上",
    note: "风衣 + 阔腿裤，一整天的利落。",
    href: "/shop?occasion=%E9%80%9A%E5%8B%A4",
    tone: "from-[#d8ccba] to-[#b8a88f]",
  },
  {
    id: "p11",
    occasion: "晚宴",
    title: "夜航之前",
    note: "缎面顺着光落下，不必再添装饰。",
    href: "/shop?category=dresses",
    tone: "from-[#cbb9a6] to-[#8f7a66]",
  },
  {
    id: "p02",
    occasion: "周末",
    title: "岩层的周末",
    note: "短夹克与直筒牛仔，轻装出门。",
    href: "/shop?occasion=%E5%91%A8%E6%9C%AB",
    tone: "from-[#cfc8bc] to-[#9b9487]",
  },
];

const VALUE_PROPS = [
  { icon: "truck" as const, title: "顺丰包邮", note: "满 ¥599 免运费，2–4 日送达" },
  { icon: "refresh" as const, title: "30 天退换", note: "吊牌完整即可，首程换货运费由我们承担" },
  { icon: "sparkle" as const, title: "AI 尺码建议", note: "基于身形与历史购买，降低退换" },
  { icon: "leaf" as const, title: "可追溯面料", note: "可溯源羊绒与 RWS 认证羊毛" },
];

export default async function HomePage() {
  const [events, userId] = await Promise.all([getEventStream(), currentUserId()]);
  const profile = buildProfileView(userId, events);
  const forYou = recommend(
    { userId, scene: "home", limit: 8 },
    { events, userProfile: profile },
  );
  const heroProduct = forYou.items[0]?.product ?? PRODUCT_MAP["p01"];
  const edit = ["p05", "p21", "p26"]
    .map((id) => PRODUCT_MAP[id])
    .filter(Boolean);
  const categoryCounts = CATEGORIES.map((category) => ({
    ...category,
    count: PRODUCTS.filter((product) => product.category === category.key).length,
  }));
  const profileTags = profile.tags.slice(0, 4);
  const weights = Object.entries(forYou.trace.weights)
    .filter(([, value]) => value > 0.03)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxWeight = Math.max(...weights.map(([, value]) => value), 0.01);
  const weightLabels: Record<string, string> = {
    semantic: "语义匹配",
    collaborative: "协同信号",
    constraint: "约束命中",
    affinity: "画像亲和",
    trend: "热度趋势",
    quality: "商品质量",
    complement: "搭配互补",
    business: "商业价值",
    freshness: "上新时效",
    editorial: "编辑加权",
  };
  const heroRec = forYou.items[0];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "织言 ZHIYAN",
    alternateName: "ZHIYAN Atelier",
    url: siteUrl,
    logo: `${siteUrl}/og.png`,
    description:
      "以面料与剪裁为核心的当代衣橱，提供可解释的 AI 个性化推荐与造型服务。",
    foundingDate: "2019",
  };

  return (
    <div className="overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd).replace(/</g, "\\u003c") }}
      />
      {/* Hero */}
      <section className="relative border-b border-line bg-ivory">
        <div className="pointer-events-none absolute inset-0 surface-grid opacity-[0.35]" />
        <div className="container-x relative grid gap-10 pb-12 pt-10 lg:grid-cols-12 lg:gap-8 lg:pb-16 lg:pt-16">
          <div className="flex flex-col justify-center lg:col-span-6 xl:col-span-7">
            <div className="flex items-center gap-4">
              <span className="h-px w-10 bg-ink/40" />
              <p className="eyebrow eyebrow-ink">Autumn / Winter 2026 · 第 07 季</p>
            </div>
            <h1 className="display mt-7 text-[clamp(56px,9vw,112px)]">
              衣橱，
              <br />
              <span className="relative inline-block">
                应当懂你
              </span>
              <span className="text-clay">。</span>
            </h1>
            <p className="mt-8 max-w-[430px] text-[13px] leading-7 text-ink-soft/80">
              以 1,200 万次真实穿搭行为为经纬。织言的 AI 造型师理解你的身形、场合与预算，
              在 32 件当季单品中，找到恰如其分的那一件——并告诉你为什么。
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/stylist" className="btn btn-primary w-full sm:w-auto">
                <Icon name="sparkle" size={14} />
                与 AI 造型师对话
              </Link>
              <Link href="/shop?sort=newest" className="btn btn-ghost w-full sm:w-auto">
                浏览 2026 秋冬系列
              </Link>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
              {[
                { value: "32", label: "当季精选单品" },
                { value: "05", label: "路召回融合" },
                { value: "62ms", label: "P95 推荐时延" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="num text-[26px] leading-none tracking-tight">{stat.value}</dt>
                  <dd className="mt-2 text-[10px] leading-4 tracking-wide text-muted">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative lg:col-span-6 xl:col-span-5">
            <div
              className="relative ml-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden lg:mt-2"
              style={{
                background: `linear-gradient(160deg, ${heroProduct.editorial.palette[0]}, ${heroProduct.editorial.palette[1]})`,
              }}
            >
              <ProductArt
                art={heroProduct.editorial.art}
                color={heroProduct.colors[0].hex}
                accent={heroProduct.editorial.accent}
                className="scale-[1.02]"
              />
              <div className="absolute left-5 top-5 flex items-center gap-2 bg-ivory/70 px-3 py-1.5 backdrop-blur-sm">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-clay" />
                <span className="text-[8.5px] uppercase tracking-[0.18em]">AI&apos;s Pick</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between bg-gradient-to-t from-ink/55 to-transparent px-5 pb-5 pt-16 text-ivory">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.22em] text-ivory/70">
                    {heroProduct.nameEn} · Look 01
                  </p>
                  <p className="mt-1.5 font-display text-[26px] leading-none">{heroProduct.name}</p>
                </div>
                <p className="num text-[12px]">{money(heroProduct.price)}</p>
              </div>
            </div>

            <div className="absolute -left-2 bottom-20 hidden w-[248px] border border-line bg-paper/95 p-4 shadow-[0_24px_60px_-32px_rgba(23,22,15,0.55)] backdrop-blur-md sm:block lg:-left-10 xl:-left-16">
              <div className="flex items-center gap-2 text-clay">
                <Icon name="sparkle" size={12} />
                <span className="text-[9px] uppercase tracking-[0.18em]">Why this one</span>
              </div>
              <p className="mt-2 text-[12px] leading-5">
                {heroRec?.reason.headline ?? "与你近期的静奢偏好同频"}
              </p>
              <p className="mt-1.5 line-clamp-3 text-[10.5px] leading-4 text-muted">
                {heroRec?.reason.detail ??
                  "双面羊绒的垂坠与你的通勤场景吻和，落肩廓形在 165cm 身高上留下恰好的空气感。"}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                <span className="num text-[9px] text-muted">
                  匹配 {Math.round((heroRec?.score ?? 0.92) * 100)}%
                </span>
                <span className="text-[9px] tracking-[0.12em] text-clay">RAG 依据 · 4</span>
              </div>
            </div>

            <div className="absolute -right-3 top-8 hidden rotate-90 text-[8px] uppercase tracking-[0.4em] text-muted/60 xl:block">
              ZHIYAN ATELIER · SHANGHAI
            </div>
          </div>
        </div>

        <div className="container-x relative">
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-4 text-[10px] tracking-[0.1em] text-muted">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="flex items-center gap-1.5">
                <Icon name="star" size={11} className="text-clay" /> 4.8 / 5 · 12,486 条真实评价
              </span>
              <span>上海 · 杭州 · 北京 72 小时达</span>
            </div>
            <Link href="/stylist" className="flex items-center gap-1.5 text-ink transition hover:text-clay">
              <Icon name="zap" size={11} />
              今日已生成 1,284 套造型
              <Icon name="arrow-right" size={11} />
            </Link>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="border-b border-line bg-paper">
        <div className="container-x grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
          {VALUE_PROPS.map((item) => (
            <div key={item.title} className="flex items-start gap-3 px-1 py-6 lg:px-8 lg:first:pl-0 lg:last:pr-0">
              <Icon name={item.icon} size={17} className="mt-0.5 text-clay" />
              <div>
                <p className="text-[11.5px] tracking-wide">{item.title}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* For you */}
      <section className="container-x py-16 md:py-24">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Curated for you · 为你精选</p>
            <h2 className="display mt-3 text-[38px] md:text-[52px]">按你的衣橱，重新计算。</h2>
            <p className="mt-4 max-w-xl text-[12px] leading-6 text-muted">
              基于 {profile.behavior.last30d} 次近期行为、{profile.affinities.styles.length} 个风格标签与当前库存，
              实时融合排序。每件推荐都附带可核对的依据。
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <div className="flex flex-wrap gap-1.5 md:justify-end">
              {profileTags.map((tag) => (
                <span key={tag} className="chip chip-clay">
                  {tag}
                </span>
              ))}
            </div>
            <p className="num text-[9.5px] text-muted">
              {forYou.trace.modelVersion} · {forYou.trace.totalLatencyMs}ms · {forYou.trace.candidateCount} 候选
            </p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {forYou.items.slice(0, 4).map((item, index) => (
            <ProductCard
              key={item.product.id}
              product={item.product}
              index={index}
              score={item.score}
              reason={{
                headline: item.reason.headline,
                detail: item.reason.detail,
                confidence: item.reason.confidence,
              }}
            />
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="text-[11px] text-muted">
            推荐结果由画像、商品特征、行为序列与搭配规则共同生成 · 可解释、可回溯
          </p>
          <div className="flex items-center gap-4">
            <Link href="/shop?sort=popular" className="link-underline">
              浏览全系列
            </Link>
            <Link href="/stylist" className="link-underline border-clay text-clay hover:border-clay-dark hover:text-clay-dark">
              让造型师继续
              <Icon name="arrow-right" size={13} />
            </Link>
          </div>
        </div>
      </section>

      {/* Editorial split */}
      <section className="border-y border-line bg-[#ece6db]">
        <div className="grid lg:grid-cols-2">
          <div className="flex flex-col justify-center px-6 py-16 md:px-14 lg:py-24 xl:px-24">
            <p className="eyebrow eyebrow-ink">The Season · 以静制动</p>
            <h2 className="display mt-5 text-[52px] leading-[1.02] md:text-[72px]">
              少一点，
              <br />
              但准确一点。
            </h2>
            <p className="mt-6 max-w-md text-[13px] leading-7 text-ink-soft/80">
              2026 秋冬系列只保留 32 件单品。我们取消了多余的装饰、季节性的噪音，
              把预算放在面料与剪裁上：可溯源羊绒、双面呢、19 姆米真丝与植鞣皮革。
            </p>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-ink/15 pt-5">
              {[
                ["05", "种核心面料"],
                ["12", "年合作工坊"],
                ["32", "本季单品"],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="num text-[22px]">{value}</p>
                  <p className="mt-1 text-[9.5px] tracking-wide text-muted">{label}</p>
                </div>
              ))}
            </div>
            <Link href="/shop" className="link-underline mt-9 self-start">
              进入系列
              <Icon name="arrow-right" size={13} />
            </Link>
          </div>
          <div className="relative min-h-[420px] overflow-hidden lg:min-h-[620px]">
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(155deg, #d6cbbb, #ab9a82)" }}
            />
            <ProductArt
              art="trench"
              color="#b08a5e"
              accent="#7c6042"
              className="absolute inset-0 scale-[1.06]"
            />
            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between border-t border-ink/20 pt-3">
              <p className="text-[9px] uppercase tracking-[0.22em] text-ink/60">
                Causeway Trench · 双排扣风衣
              </p>
              <p className="num text-[11px] text-ink/70">¥2,580</p>
            </div>
          </div>
        </div>
      </section>

      {/* The Edit */}
      <section className="container-x py-16 md:py-24">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">The Edit · 本季编辑</p>
            <h2 className="display mt-3 text-[38px] md:text-[52px]">三件，组成整个秋天。</h2>
          </div>
          <Link href="/shop?sort=popular" className="link-underline hidden sm:inline-flex">
            全部单品
            <Icon name="arrow-right" size={13} />
          </Link>
        </div>
        <div className="mt-10 grid gap-x-6 gap-y-10 md:grid-cols-3">
          {edit.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              reason={{
                headline:
                  index === 0
                    ? "被 342 人加入衣橱的基础层"
                    : index === 1
                      ? "你的通勤鞋履首选"
                      : "一条能改变整体质感的围巾",
                detail:
                  index === 0
                    ? "12 针高领羊绒，保暖但不显臃肿，叠加任何外套都成立。"
                    : index === 1
                      ? "整张小羊皮包覆、可更换真皮大底，走久了会贴合脚型。"
                      : "双面水波纹羊绒，中性色与大衣、针织都能自然衔接。",
              }}
            />
          ))}
        </div>
      </section>

      {/* AI Atelier */}
      <section id="ai" className="relative overflow-hidden bg-ink text-ivory">
        <div className="absolute inset-0 opacity-[0.16] surface-grid" />
        <div className="container-x relative grid gap-14 py-20 lg:grid-cols-12 lg:py-28">
          <div className="lg:col-span-6">
            <p className="eyebrow text-ivory/40">AI Atelier · 造型工作室</p>
            <h2 className="display mt-4 text-[44px] leading-[1.05] md:text-[64px]">
              不是猜你喜欢，
              <br />
              是理解你<span className="text-[#c9a87b]">为什么</span>喜欢。
            </h2>
            <p className="mt-6 max-w-lg text-[13px] leading-7 text-ivory/60">
              每一次推荐都经过意图理解、五路召回、十因子融合与 RAG 理由生成。
              你能看到它读了哪些依据，也能随时修改或关闭个性化。
            </p>
            <div className="mt-10 space-y-6">
              {[
                {
                  no: "01",
                  title: "先理解，再检索",
                  text: "从一句「下周去上海出差」里，读出城市、温差、通勤场景与行李限制。",
                },
                {
                  no: "02",
                  title: "五路召回，十因子排序",
                  text: "向量、协同、规则、热度、编辑五路并行，再按画像与场景融合。",
                },
                {
                  no: "03",
                  title: "给每一个理由找到出处",
                  text: "理由来自商品特征库、评价片段与你的行为，而不是一句模板。",
                },
              ].map((step) => (
                <div key={step.no} className="flex gap-5 border-t border-ivory/12 pt-5">
                  <span className="num text-[10px] text-[#c9a87b]">{step.no}</span>
                  <div>
                    <p className="text-[14px] tracking-wide">{step.title}</p>
                    <p className="mt-1.5 max-w-md text-[11.5px] leading-5 text-ivory/50">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/stylist" className="btn btn-clay">
                开始一次造型
                <Icon name="arrow-right" size={13} />
              </Link>
              <Link href="/account?tab=profile" className="btn border border-ivory/25 text-ivory hover:border-ivory">
                查看我的风格档案
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6 lg:pl-8">
            <div className="border border-ivory/15 bg-ivory/[0.04] p-6 backdrop-blur-sm md:p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#c9a87b]" />
                  <span className="text-[9px] uppercase tracking-[0.2em] text-ivory/50">Live reasoning</span>
                </div>
                <span className="num text-[9px] text-ivory/35">{forYou.trace.requestId}</span>
              </div>
              <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-ivory/35">输入 · 画像</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profileTags.map((tag) => (
                  <span key={tag} className="border border-ivory/20 px-2 py-1 text-[9.5px] text-ivory/70">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-ivory/35">融合权重</p>
              <div className="mt-3 space-y-3">
                {weights.map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-[10px] text-ivory/55">
                      {weightLabels[key] ?? key}
                    </span>
                    <div className="h-[3px] flex-1 bg-ivory/10">
                      <div
                        className="h-full bg-[#c9a87b]"
                        style={{ width: `${Math.round((value / maxWeight) * 100)}%` }}
                      />
                    </div>
                    <span className="num w-8 text-right text-[9.5px] text-ivory/45">
                      {(value * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-7 border-t border-ivory/12 pt-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/35">Top 1 推荐理由</p>
                <p className="mt-2 font-display text-[22px] leading-snug text-ivory/90">
                  {heroRec?.reason.headline ?? "静奢衣橱的下一件"}
                </p>
                <p className="mt-2 text-[11px] leading-5 text-ivory/50">
                  {heroRec?.reason.detail ??
                    "你近期关注的针织与大衣都指向同一种轮廓：直身、落肩、不喧哗。"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(heroRec?.reason.evidence ?? []).slice(0, 3).map((evidence) => (
                    <span
                      key={`${evidence.source}-${evidence.label}`}
                      className="border border-ivory/15 px-2 py-1 text-[9px] text-ivory/55"
                    >
                      {evidence.source} · {evidence.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-ivory/12 pt-4">
                <span className="text-[9px] text-ivory/35">recall → rank → reason</span>
                <span className="num text-[9px] text-ivory/45">
                  {forYou.trace.totalLatencyMs}ms · {forYou.trace.variant} 组
                </span>
              </div>
            </div>
            <p className="mt-4 text-[9.5px] leading-4 text-ivory/30">
              画面中的数据来自当前会话的真实推荐链路；生产环境可切换为 LLM 增强模式。
            </p>
          </div>
        </div>
      </section>

      {/* Lookbook */}
      <section className="container-x py-16 md:py-24">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">City Wardrobe · 城市衣橱</p>
            <h2 className="display mt-3 text-[38px] md:text-[52px]">三种城市，三种节奏。</h2>
          </div>
          <p className="max-w-sm text-[11px] leading-5 text-muted">
            每套造型都由 AI 造型师与编辑共同完成，点击进入对应场景的完整选品。
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {LOOKS.map((look, index) => {
            const product = PRODUCT_MAP[look.id];
            return (
              <Link key={look.id} href={look.href} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-br ${look.tone}`} />
                  <ProductArt
                    art={product.editorial.art}
                    color={product.colors[0].hex}
                    accent={product.editorial.accent}
                    className="relative transition duration-700 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/55 to-transparent p-5 pt-16">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-ivory/65">
                      0{index + 1} · {look.occasion}
                    </p>
                    <p className="mt-1.5 font-display text-[30px] leading-none text-ivory">{look.title}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-b border-line py-3">
                  <p className="text-[11px] text-muted">{look.note}</p>
                  <Icon name="arrow-up-right" size={14} className="text-muted transition group-hover:text-clay" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Categories + bestsellers */}
      <section className="border-y border-line bg-paper">
        <div className="container-x grid gap-14 py-16 md:py-20 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="eyebrow">Index · 品类索引</p>
            <h2 className="display mt-3 text-[36px] md:text-[44px]">按衣橱结构浏览</h2>
            <div className="mt-6 divide-y divide-line border-t border-line">
              {categoryCounts.map((category, index) => (
                <Link
                  key={category.key}
                  href={`/shop?category=${category.key}`}
                  className="group flex items-center justify-between py-3.5"
                >
                  <span className="flex items-baseline gap-4">
                    <span className="num text-[9px] text-muted-light">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13px] transition group-hover:text-clay">{category.label}</span>
                    <span className="text-[9px] uppercase tracking-[0.16em] text-muted-light">
                      {category.labelEn}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="num text-[10px] text-muted">{category.count}</span>
                    <Icon
                      name="arrow-right"
                      size={13}
                      className="text-muted-light transition group-hover:translate-x-1 group-hover:text-clay"
                    />
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div className="lg:col-span-7 lg:pl-10">
            <div className="flex items-end justify-between">
              <div>
                <p className="eyebrow">Most Loved · 本月热选</p>
                <h2 className="display mt-3 text-[36px] md:text-[44px]">被反复选择的</h2>
              </div>
              <Link href="/shop?sort=popular" className="hidden text-[10px] tracking-[0.14em] text-muted hover:text-clay sm:block">
                全部 →
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8">
              {bestSellers.slice(0, 4).map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={index}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Story */}
      <section id="story" className="container-x py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="eyebrow">Our Craft · 关于织言</p>
            <h2 className="display mt-4 text-[40px] leading-[1.05] md:text-[52px]">
              一件衣服的价值，
              <br />
              在触感与时间里。
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <p className="text-[13px] leading-8 text-ink-soft/80">
              织言创立于 2019 年，与 12 家长期合作的小型工坊共同完成每一季。
              我们不追逐季节性的噪音，而是把预算放在面料、剪裁与工艺上：
              内蒙古可溯源羊绒、双面呢手工缝合、19 姆米真丝与意大利植鞣皮革。
            </p>
            <p className="mt-4 text-[13px] leading-8 text-ink-soft/80">
              织言 AI 造型师是品牌在数字世界的延伸。它不替你做决定，只是把「为什么适合你」
              讲清楚——让你更快找到真正会穿很多年的那一件。
            </p>
            <div className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
              {[
                { title: "可追溯羊绒", note: "内蒙古牧场直采，纤度 15.5 微米" },
                { title: "双面呢工艺", note: "手工缝合，无里衬也保持挺括" },
                { title: "旧衣回收", note: "寄回任意品牌衣物，换取 ¥100 礼券" },
              ].map((item) => (
                <div key={item.title}>
                  <p className="text-[12px]">{item.title}</p>
                  <p className="mt-1.5 text-[10.5px] leading-5 text-muted">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-x pb-4">
        <div className="relative overflow-hidden border border-line bg-[#e7e0d4] px-6 py-14 md:px-16 md:py-20">
          <div className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-[#d5c9b7] blur-2xl" />
          <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
            <div>
              <p className="eyebrow">Personal Stylist</p>
              <h2 className="display mt-4 max-w-2xl text-[40px] leading-[1.05] md:text-[60px]">
                让 AI 造型师，
                <br />
                先认识你。
              </h2>
              <p className="mt-4 max-w-md text-[12px] leading-6 text-ink-soft/70">
                从身形、场合到预算，用一次对话建立你的风格坐标。之后每一次打开，都会更准确一点。
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/stylist" className="btn btn-primary w-full sm:w-auto">
                开始对话
                <Icon name="arrow-right" size={14} />
              </Link>
              <Link href="/account?tab=profile" className="text-center text-[10px] tracking-[0.12em] text-muted underline-offset-4 hover:text-ink hover:underline">
                先完善风格偏好
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
