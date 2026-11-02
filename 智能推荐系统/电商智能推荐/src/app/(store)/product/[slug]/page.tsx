import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCT_BY_SLUG, PRODUCTS } from "@/lib/data/catalog";
import { REVIEWS } from "@/lib/data/reviews";
import { getEventStream, getStore } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { committedStock, withAvailability } from "@/lib/commerce/inventory";
import { buildProfileView } from "@/lib/engine/profile";
import { explainProduct } from "@/lib/engine/reason";
import { recommend } from "@/lib/engine/recommend";
import { outfitForProduct, outfitSlotLabel } from "@/lib/engine/outfit";
import { suggestSize } from "@/lib/engine/knowledge";
import { ProductHero } from "@/components/product/ProductHero";
import { ProductArt } from "@/components/product/ProductArt";
import { ProductCard } from "@/components/product/ProductCard";
import { OutfitAddAll } from "@/components/product/OutfitAddAll";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/utils/format";
import type { Recommendation, RecallSource } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = PRODUCT_BY_SLUG[slug];
  if (!product) return { title: "商品不存在" };
  return {
    alternates: { canonical: `/product/${product.slug}` },
    title: `${product.name} · ${product.nameEn}`,
    description: `${product.description} ${product.materials.map((m) => `${m.name}${m.pct}%`).join("、")}，${product.fit}，¥${product.price}。`,
    openGraph: {
      title: `${product.name} · 织言 ZHIYAN`,
      description: product.description,
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = PRODUCT_BY_SLUG[slug];
  if (!product) notFound();

  const [events, state, userId] = await Promise.all([
    getEventStream(),
    getStore(),
    currentUserId(),
  ]);
  const committed = committedStock(state.orders);
  const displayProduct = withAvailability(product, committed);
  const profile = buildProfileView(userId, events);
  const reason = explainProduct(product, profile);
  const baseSize =
    product.role === "bottom"
      ? profile.sizes.bottom
      : product.role === "shoes"
        ? profile.sizes.shoes
        : profile.sizes.top;
  const suggestedSize = suggestSize(
    product,
    baseSize,
    profile.body.height,
    profile.body.weight,
  );

  const outfit = outfitForProduct(product.id, userId);
  const outfitItems = outfit.items.map((item) => {
    const availableProduct = withAvailability(item.product, committed);
    const base =
      availableProduct.role === "bottom"
        ? profile.sizes.bottom
        : availableProduct.role === "shoes"
          ? profile.sizes.shoes
          : profile.sizes.top;
    const size = suggestSize(
      availableProduct,
      base,
      profile.body.height,
      profile.body.weight,
    );
    const safeSize = availableProduct.sizes.find(
      (option) => option.label === size && option.stock > 0,
    )
      ? size
      : availableProduct.sizes.find((option) => option.stock > 0)?.label ?? size;
    return {
      slot: item.slot,
      product: availableProduct,
      size: safeSize,
      color: availableProduct.colors[0].name,
    };
  });

  const relatedResult = recommend(
    {
      userId,
      scene: "home",
      limit: 4,
      constraints: {
        categories: [product.category],
        excludeProductIds: [product.id],
      },
    },
    { events, userProfile: profile },
  );
  let related = relatedResult.items;
  if (related.length < 3) {
    const fallback: Recommendation[] = PRODUCTS.filter(
      (candidate) =>
        candidate.id !== product.id &&
        candidate.styleTags.some((tag) => product.styleTags.includes(tag)),
    )
      .slice(0, 4)
      .map((candidate) => ({
        product: candidate,
        score: 0.7,
        rank: 0,
        sources: ["rule"] as RecallSource[],
        factors: [],
        matchedTags: [],
        reason: {
          headline: "同风格单品",
          detail: candidate.description,
          evidence: [],
          confidence: 0.7,
          generator: "template" as const,
        },
      }));
    related = [
      ...related,
      ...fallback.filter(
        (item) => !related.some((existing) => existing.product.id === item.product.id),
      ),
    ].slice(0, 4);
  }

  const productReviews = REVIEWS.filter((review) => review.productId === product.id);
  const reviewWeights = [0.79, 0.14, 0.04, 0.02, 0.01];
  const distribution = reviewWeights.map((weight, index) => ({
    star: 5 - index,
    count: Math.round(product.reviewCount * weight),
    percent: Math.round(weight * 100),
  }));
  const outfitAddItems = outfitItems.map((item) => ({
    productId: item.product.id,
    name: item.product.name,
    size: item.size,
    color: item.color,
    price: item.product.price,
  }));
  const outfitTotal = outfitItems.reduce((sum, item) => sum + item.product.price, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    alternateName: product.nameEn,
    description: product.description,
    sku: product.sku,
    brand: { "@type": "Brand", name: "织言 ZHIYAN" },
    offers: {
      "@type": "Offer",
      priceCurrency: "CNY",
      price: product.price,
      availability: displayProduct.sizes.some((size) => size.stock > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `https://zhiyan.example.com/product/${product.slug}`,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
    },
  };

  return (
    <div className="pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="container-x flex items-center gap-2 border-b border-line py-4 text-[9.5px] uppercase tracking-[0.14em] text-muted">
        <Link href="/" className="transition hover:text-ink">织言</Link>
        <span>/</span>
        <Link href={`/shop?category=${product.category}`} className="transition hover:text-ink">
          {product.subcategory}
        </Link>
        <span>/</span>
        <span className="truncate text-ink">{product.name}</span>
      </div>

      <section className="container-x pt-6 md:pt-10">
        <ProductHero
          product={displayProduct}
          reason={{
            headline: reason.headline,
            detail: reason.detail,
            evidence: reason.evidence,
            confidence: reason.confidence,
          }}
          suggestedSize={suggestedSize}
          profileTags={profile.tags.slice(0, 4)}
          ratingCount={product.reviewCount}
        />
      </section>

      {outfitItems.length > 1 ? (
        <section className="container-x mt-16 md:mt-24">
          <div className="border border-line bg-paper">
            <div className="flex flex-col gap-4 border-b border-line px-6 py-5 md:flex-row md:items-end md:justify-between md:px-8">
              <div>
                <p className="eyebrow">Complete the look · 搭配这套</p>
                <h2 className="display mt-2 text-[30px] md:text-[38px]">围绕「{product.name}」的完整造型</h2>
                <p className="mt-2 text-[11px] text-muted">
                  已按你的尺码与色彩偏好配比 · {outfit.harmony.join(" / ")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="num text-[18px]">{money(outfitTotal)}</p>
                <OutfitAddAll items={outfitAddItems} />
              </div>
            </div>
            <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0 lg:grid-cols-6">
              {outfitItems.map((item) => (
                <Link
                  key={item.product.id}
                  href={`/product/${item.product.slug}`}
                  className="group flex gap-3 p-4 md:flex-col md:gap-0"
                >
                  <div
                    className="h-[96px] w-[76px] shrink-0 overflow-hidden md:h-auto md:w-full md:aspect-[4/5]"
                    style={{
                      background: `linear-gradient(150deg, ${item.product.editorial.palette[0]}, ${item.product.editorial.palette[1]})`,
                    }}
                  >
                    <ProductArt
                      art={item.product.editorial.art}
                      color={item.product.colors[0].hex}
                      accent={item.product.editorial.accent}
                      className="transition duration-500 group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="min-w-0 pt-1 md:pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[8.5px] uppercase tracking-[0.16em] text-clay">
                        {outfitSlotLabel(item.slot)}
                      </p>
                      <span className="num text-[9px] text-muted">¥{item.product.price}</span>
                    </div>
                    <p className="mt-1 truncate text-[11.5px]">{item.product.name}</p>
                    <p className="mt-0.5 text-[9px] text-muted">{item.color} / {item.size}</p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-line px-6 py-4 text-[10px] text-muted sm:flex-row sm:items-center sm:justify-between md:px-8">
              <p>{outfit.notes}</p>
              <Link
                href={`/stylist?prompt=${encodeURIComponent(`围绕「${product.name}」再给我两个不同的搭配方向`)}`}
                className="flex items-center gap-1.5 text-clay hover:underline"
              >
                换一种搭配思路
                <Icon name="arrow-right" size={11} />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="container-x mt-16 md:mt-24">
        <div className="grid gap-10 border-y border-line py-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="eyebrow">Fabric & Craft · 面料与工艺</p>
            <h2 className="display mt-3 text-[32px] leading-[1.1] md:text-[42px]">
              触感，是设计的
              <br />
              第一层语言。
            </h2>
            <p className="mt-4 text-[11.5px] leading-6 text-muted">{product.story}</p>
          </div>
          <div className="lg:col-span-5 lg:col-start-6">
            <div className="space-y-4">
              {product.materials.map((material) => (
                <div key={material.name}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[12px]">{material.name}</p>
                    <p className="num text-[11px] text-muted">{material.pct}%</p>
                  </div>
                  <div className="mt-2 h-[2px] bg-line">
                    <div className="h-full bg-ink/60" style={{ width: `${material.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-[10.5px]">
              {[
                ["产地", product.origin],
                ["版型", product.fit],
                ["厚度", product.fabricWeight],
                ["季节", product.season.join(" / ")],
                ["养护", product.care],
                ["试穿", product.modelInfo],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[8.5px] uppercase tracking-[0.14em] text-muted">{label}</dt>
                  <dd className="mt-1 leading-5 text-ink-soft/80">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:col-span-2 lg:col-start-11">
            <div
              className="relative aspect-[3/4] overflow-hidden"
              style={{
                background: `linear-gradient(160deg, ${product.editorial.palette[0]}, ${product.editorial.palette[1]})`,
              }}
            >
              <div
                className="absolute inset-0 opacity-60"
                style={{
                  backgroundImage: `repeating-linear-gradient(48deg, ${product.colors[0].hex}33 0px, ${product.colors[0].hex}33 1px, transparent 1px, transparent 8px)`,
                }}
              />
              <div className="absolute inset-x-4 bottom-4">
                <p className="font-display text-[24px] leading-none">{product.materials[0]?.name}</p>
                <p className="mt-1.5 text-[8.5px] uppercase tracking-[0.16em] text-ink/50">
                  {product.nameEn}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-x mt-16 md:mt-20">
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow">Reviews · 穿着反馈</p>
            <h2 className="display mt-3 text-[32px] md:text-[42px]">真实穿着者说</h2>
          </div>
          <p className="hidden text-[10px] text-muted sm:block">尺码反馈来自已验证购买</p>
        </div>
        <div className="mt-8 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <div className="flex items-baseline gap-3">
              <p className="num text-[48px] leading-none">{product.rating}</p>
              <p className="text-[11px] text-muted">/ 5 · {product.reviewCount} 条</p>
            </div>
            <div className="mt-4 space-y-2">
              {distribution.map((row) => (
                <div key={row.star} className="flex items-center gap-3">
                  <span className="num w-6 text-[9px] text-muted">{row.star}★</span>
                  <div className="h-[3px] flex-1 bg-line">
                    <div className="h-full bg-clay/70" style={{ width: `${row.percent}%` }} />
                  </div>
                  <span className="num w-8 text-right text-[9px] text-muted">{row.percent}%</span>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-line pt-4 text-[10px] leading-5 text-muted">
              <p>尺码感受：{productReviews.filter((r) => r.fitFeedback === "正常").length} / {productReviews.length} 位用户认为正常</p>
              <p className="mt-1">78% 的购买者表示会再次购买同系列。</p>
            </div>
          </div>
          <div className="lg:col-span-9">
            <div className="grid gap-5 md:grid-cols-3">
              {productReviews.map((review) => (
                <article key={review.id} className="border-t border-ink/50 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bone text-[10px]">
                        {review.author.slice(0, 1)}
                      </span>
                      <div>
                        <p className="text-[10.5px]">{review.author}</p>
                        <p className="text-[8.5px] text-muted">{review.city} · 已购</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Icon
                          key={index}
                          name="star"
                          size={9}
                          className={index < review.rating ? "fill-current text-clay" : "text-line-strong"}
                          strokeWidth={index < review.rating ? 0 : 1}
                        />
                      ))}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[12px]">{review.title}</h3>
                  <p className="mt-1.5 text-[10.5px] leading-5 text-muted">{review.body}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="chip h-6 text-[8.5px]">{review.height}cm / {review.weight}kg</span>
                    <span className="chip h-6 text-[8.5px]">购 {review.purchasedSize} 码</span>
                    <span className="chip h-6 text-[8.5px]">尺码{review.fitFeedback}</span>
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-5 text-right text-[9.5px] text-muted">
              展示 3 / {product.reviewCount} 条评价 · 内容来自已验证购买
            </p>
          </div>
        </div>
      </section>

      {related.length ? (
        <section className="container-x mt-16 md:mt-24">
          <div className="flex items-end justify-between">
            <div>
              <p className="eyebrow">You may also like · 与你同频</p>
              <h2 className="display mt-3 text-[32px] md:text-[42px]">还可以看看这些</h2>
            </div>
            <Link href={`/shop?category=${product.category}`} className="link-underline hidden sm:inline-flex">
              同类单品
              <Icon name="arrow-right" size={13} />
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
            {related.map((item, index) => (
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
        </section>
      ) : null}

      <section className="container-x mt-16">
        <div className="flex flex-col items-start justify-between gap-5 border border-line bg-[#eee8dd] px-6 py-8 md:flex-row md:items-center md:px-10">
          <div>
            <p className="eyebrow">A note on AI</p>
            <p className="mt-2 max-w-2xl text-[11.5px] leading-6 text-ink-soft/75">
              本页的推荐理由与尺码建议由织言画像引擎生成，依据包括你的风格偏好、近期行为、商品特征与评价片段。
              每一处推荐依据都可以在理由卡片中查看。你可以随时在账户中修改或关闭个性化。
            </p>
          </div>
          <Link href="/account?tab=profile" className="btn btn-ghost btn-sm shrink-0">
            管理我的偏好
          </Link>
        </div>
      </section>
    </div>
  );
}
