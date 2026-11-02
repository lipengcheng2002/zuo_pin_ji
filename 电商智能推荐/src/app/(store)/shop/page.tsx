import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, CATEGORY_MAP, PRICE_BANDS, PRODUCTS } from "@/lib/data/catalog";
import { searchProducts } from "@/lib/engine/search";
import { ProductCard } from "@/components/product/ProductCard";
import { ShopToolbar, type ShopFacets } from "@/components/storefront/ShopToolbar";
import { Icon } from "@/components/ui/Icon";
import type { CategoryKey } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const csv = (value: string | string[] | undefined): string[] => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const numberParam = (value: string | string[] | undefined): number | undefined => {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildFacets = (): ShopFacets => {
  const colorMap = new Map<string, { name: string; hex: string; count: number }>();
  const sizeSet = new Set<string>();
  const occasionCount = new Map<string, number>();
  const styleCount = new Map<string, number>();

  PRODUCTS.forEach((product) => {
    product.colors.forEach((color) => {
      const entry = colorMap.get(color.name) ?? { name: color.name, hex: color.hex, count: 0 };
      entry.count += 1;
      colorMap.set(color.name, entry);
    });
    product.sizes.forEach((size) => sizeSet.add(size.label));
    product.occasions.forEach((occasion) =>
      occasionCount.set(occasion, (occasionCount.get(occasion) ?? 0) + 1),
    );
    product.styleTags.forEach((style) =>
      styleCount.set(style, (styleCount.get(style) ?? 0) + 1),
    );
  });

  const sizeOrder = ["XS", "S", "M", "L", "XL", "35", "36", "37", "38", "39", "40", "均码"];
  const sizes = [...sizeSet].sort(
    (a, b) => sizeOrder.indexOf(a) - sizeOrder.indexOf(b) || a.localeCompare(b),
  );

  return {
    categories: CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      count: PRODUCTS.filter((product) => product.category === category.key).length,
    })),
    colors: [...colorMap.values()].sort((a, b) => b.count - a.count),
    sizes,
    occasions: [...occasionCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    styles: [...styleCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    priceBands: PRICE_BANDS.map((band) => ({
      key: band.key,
      label: band.label,
      min: band.min,
      max: band.max,
    })),
    total: PRODUCTS.length,
  };
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const categoryKey = csv(params.category)[0] as CategoryKey | undefined;
  const category = categoryKey ? CATEGORY_MAP[categoryKey] : undefined;
  const title = query
    ? `搜索「${query}」`
    : category
      ? `${category.label} · ${category.labelEn}`
      : "全部单品";
  return {
    title,
    alternates: { canonical: "/shop" },
    description:
      category?.description ??
      "浏览织言 2026 秋冬全部单品：羊绒大衣、真丝衬衫、针织、裤装与鞋包配饰。",
  };
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const categoryKeys = csv(params.category) as CategoryKey[];
  const colors = csv(params.color);
  const sizes = csv(params.size);
  const occasions = csv(params.occasion);
  const styles = csv(params.style);
  const priceMin = numberParam(params.min);
  const priceMax = numberParam(params.max);
  const sort = (typeof params.sort === "string" ? params.sort : "relevance") as
    | "relevance"
    | "newest"
    | "price_asc"
    | "price_desc"
    | "popular";

  const result = searchProducts(query, {
    categories: categoryKeys.length ? categoryKeys : undefined,
    colors: colors.length ? colors : undefined,
    sizes: sizes.length ? sizes : undefined,
    occasions: occasions.length ? occasions : undefined,
    styleTags: styles.length ? styles : undefined,
    priceMin,
    priceMax,
    sort,
  });

  const facets = buildFacets();
  const primaryCategory = categoryKeys[0] ? CATEGORY_MAP[categoryKeys[0]] : undefined;
  const heading = query ? `关于「${query}」` : primaryCategory ? primaryCategory.label : "全部单品";
  const description = query
    ? `按相关度与你的画像综合排序，共 ${result.total} 件匹配单品。`
    : primaryCategory
      ? primaryCategory.description
      : "以面料与剪裁为核心的当代衣橱。32 件单品，覆盖通勤、约会、旅行与居家。";

  return (
    <div className="pb-10">
      <section className="border-b border-line bg-ivory">
        <div className="container-x pb-10 pt-8 md:pb-12 md:pt-10">
          <nav className="flex items-center gap-2 text-[9.5px] uppercase tracking-[0.16em] text-muted">
            <Link href="/" className="transition hover:text-ink">
              织言
            </Link>
            <span>/</span>
            <span>{query ? "搜索" : "全部单品"}</span>
            {primaryCategory ? (
              <>
                <span>/</span>
                <span className="text-ink">{primaryCategory.label}</span>
              </>
            ) : null}
          </nav>
          <div className="mt-7 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="eyebrow">Collection · Autumn / Winter 2026</p>
              <h1 className="display mt-3 text-[46px] leading-[1.02] md:text-[64px]">{heading}</h1>
              <p className="mt-4 max-w-xl text-[12px] leading-6 text-muted">{description}</p>
            </div>
            <div className="flex items-end gap-8">
              <div>
                <p className="num text-[30px] leading-none">{String(result.total).padStart(2, "0")}</p>
                <p className="mt-1.5 text-[9px] uppercase tracking-[0.18em] text-muted">Pieces</p>
              </div>
              <div className="border-l border-line pl-8">
                <p className="num text-[30px] leading-none">05</p>
                <p className="mt-1.5 text-[9px] uppercase tracking-[0.18em] text-muted">Recall</p>
              </div>
              <div className="border-l border-line pl-8">
                <p className="num text-[30px] leading-none">30</p>
                <p className="mt-1.5 text-[9px] uppercase tracking-[0.18em] text-muted">Days Return</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ShopToolbar facets={{ ...facets, total: result.total }} />

      <section className="container-x pt-8 md:pt-10">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[10.5px] text-muted">
            {result.total > 0 ? (
              <>
                已为你展示 <span className="num text-ink">{result.total}</span> 件
                {query ? `与「${query}」相关的单品` : "当季单品"}
              </>
            ) : (
              "没有找到符合条件的单品"
            )}
          </p>
          <p className="hidden items-center gap-1.5 text-[9.5px] text-muted sm:flex">
            <Icon name="sparkle" size={11} className="text-clay" />
            排序已融合画像与热度信号
          </p>
        </div>

        {result.products.length ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
            {result.products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center border-y border-line py-20 text-center">
            <Icon name="search" size={28} className="text-muted-light" />
            <p className="mt-4 text-[16px]">这个组合暂时没有对应单品</p>
            <p className="mt-2 max-w-sm text-[12px] leading-6 text-muted">
              试着减少一个筛选条件，或者描述你的场合、预算与风格，让 AI 造型师直接帮你找。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/shop" className="btn btn-outline btn-sm">
                清除全部筛选
              </Link>
              <Link
                href={`/stylist?prompt=${encodeURIComponent(query || "帮我找一套适合我的衣服")}`}
                className="btn btn-primary btn-sm"
              >
                <Icon name="sparkle" size={12} />
                问 AI 造型师
              </Link>
            </div>
          </div>
        )}

        {result.products.length ? (
          <div className="mt-14 flex flex-col items-start justify-between gap-5 border-t border-line pt-6 sm:flex-row sm:items-center">
            <p className="text-[11px] text-muted">
              已展示全部 {result.total} 件 · 想看更多？让造型师按场景继续推荐
            </p>
            <div className="flex items-center gap-4">
              <Link href="/stylist" className="link-underline">
                开始造型
                <Icon name="arrow-right" size={13} />
              </Link>
              <Link href="/account?tab=profile" className="text-[10px] tracking-[0.1em] text-muted hover:text-clay">
                调整风格偏好
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      <section className="container-x mt-16">
        <div className="border border-line bg-paper p-6 md:p-10">
          <div className="grid gap-8 md:grid-cols-12">
            <div className="md:col-span-5">
              <p className="eyebrow">Not sure where to start?</p>
              <h2 className="display mt-3 text-[30px] leading-[1.1] md:text-[38px]">
                不确定从哪件开始？
              </h2>
              <p className="mt-3 max-w-sm text-[11.5px] leading-6 text-muted">
                告诉 AI 造型师你的场合、预算与常穿尺码。它会在 30 秒内给出三套可执行的搭配，
                并解释每一件的理由。
              </p>
              <Link href="/stylist" className="btn btn-primary btn-sm mt-5">
                开始对话
                <Icon name="arrow-right" size={12} />
              </Link>
            </div>
            <div className="grid gap-4 md:col-span-7 md:grid-cols-3">
              {[
                ["01", "说出场景", "「下周去上海出差，帮我搭三套通勤。」"],
                ["02", "得到整套", "上装、下装、外套、鞋包一次配齐。"],
                ["03", "可解释推荐", "每件都标注依据，放心加入购物袋。"],
              ].map(([no, title, note]) => (
                <div key={no} className="border-t border-ink/70 pt-3">
                  <p className="num text-[9px] text-clay">{no}</p>
                  <p className="mt-2 text-[12px]">{title}</p>
                  <p className="mt-1.5 text-[10.5px] leading-5 text-muted">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
