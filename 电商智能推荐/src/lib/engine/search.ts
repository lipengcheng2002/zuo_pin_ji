import { PRODUCTS } from "@/lib/data/catalog";
import type { Product } from "@/lib/types";
import type { SearchFilters, SearchResult } from "@/lib/engine/types";
import { clamp, cosine, embed, tokenize } from "@/lib/engine/text";
import { passesHardFilters } from "@/lib/engine/recall";
import { getItemFeature } from "@/lib/engine/features";
import { understand } from "@/lib/engine/intent";

const docOf = (product: Product): string =>
  `${product.name} ${product.nameEn} ${product.subcategory} ${product.category} ${product.styleTags.join(" ")} ${product.occasions.join(" ")} ${product.colors.map((c) => c.name).join(" ")} ${product.materials.map((m) => m.name).join(" ")} ${product.description}`;

export function searchProducts(query: string, filters: SearchFilters = {}): SearchResult {
  const started = performance.now();
  const intent = understand(query || "");
  const constraints = {
    ...filters,
    categories:
      filters.categories?.length ? filters.categories : intent.slots.categories.length ? intent.slots.categories : undefined,
    colors:
      filters.colors?.length ? filters.colors : intent.slots.colors.length ? intent.slots.colors : undefined,
    sizes:
      filters.sizes?.length ? filters.sizes : intent.slots.sizes.length ? intent.slots.sizes : undefined,
    priceMin: filters.priceMin ?? intent.slots.budget?.min,
    priceMax: filters.priceMax ?? intent.slots.budget?.max,
    inStockOnly: true,
  };

  const queryVec = query ? embed(query) : null;
  const qTokens = query ? tokenize(query) : [];
  const candidates = PRODUCTS.filter((product) => passesHardFilters(product, constraints)).filter(
    (product) =>
      (!filters.styleTags?.length ||
        product.styleTags.some((tag) => filters.styleTags!.includes(tag))) &&
      (!filters.occasions?.length ||
        product.occasions.some((occasion) => filters.occasions!.includes(occasion))),
  );

  const scored = candidates.map((product) => {
    const text = docOf(product);
    const pTokens = tokenize(text);
    const pSet = new Set(pTokens);
    const hits = qTokens.filter((t) => pSet.has(t)).length;
    const lexical = qTokens.length ? hits / qTokens.length : 0;
    const semantic = queryVec ? clamp((cosine(queryVec, embed(text)) - 0.02) / 0.5) : 0;
    const exact = query && (product.name.includes(query) || product.nameEn.toLowerCase().includes(query.toLowerCase())) ? 0.6 : 0;
    const occasion = intent.slots.occasions.length
      ? intent.slots.occasions.filter((o) => product.occasions.includes(o)).length /
        intent.slots.occasions.length
      : 0;
    const style = intent.slots.styles.length
      ? intent.slots.styles.filter((s) => product.styleTags.includes(s)).length /
        intent.slots.styles.length
      : 0;
    const popularity = getItemFeature(product.id)?.popularity ?? 0.5;
    const priceFit =
      constraints.priceMax !== undefined && product.price <= constraints.priceMax ? 0.08 : 0;
    const score =
      (query ? lexical * 0.36 + semantic * 0.3 + exact + occasion * 0.12 + style * 0.1 : 0) +
      popularity * 0.18 +
      priceFit;
    return { product, score, lexical };
  });

  const sort = filters.sort ?? "relevance";
  const sorted = scored.sort((a, b) => {
    switch (sort) {
      case "newest":
        return a.product.releaseDate < b.product.releaseDate ? 1 : -1;
      case "price_asc":
        return a.product.price - b.product.price;
      case "price_desc":
        return b.product.price - a.product.price;
      case "popular":
        return b.product.sold30d - a.product.sold30d;
      default:
        return b.score - a.score;
    }
  });

  const suggestions = sorted
    .slice(0, 4)
    .map((s) => s.product.name)
    .filter((name) => name !== query);

  const result: SearchResult = {
    products: sorted.map((s) => s.product),
    total: sorted.length,
    query,
    slots: {
      categories: constraints.categories ?? [],
      colors: constraints.colors ?? [],
      sizes: constraints.sizes ?? [],
      price: intent.slots.budget,
      occasions: intent.slots.occasions,
      styles: intent.slots.styles,
    },
    tookMs: Number((performance.now() - started).toFixed(1)),
    suggestions: suggestions.length >= 2 ? suggestions : ["通勤大衣", "羊绒针织", "真丝衬衫"],
  };
  return result;
}

export const POPULAR_QUERIES = [
  "通勤大衣",
  "羊绒高领",
  "真丝衬衫",
  "弯刀阔腿裤",
  "约会连衣裙",
  "千元以内通勤",
];

export function filterForShop(params: {
  category?: string;
  colors?: string[];
  sizes?: string[];
  priceMin?: number;
  priceMax?: number;
  occasions?: string[];
  styles?: string[];
  sort?: SearchFilters["sort"];
  query?: string;
}): SearchResult {
  return searchProducts(params.query ?? "", {
    categories: params.category ? [params.category as Product["category"]] : undefined,
    colors: params.colors,
    sizes: params.sizes,
    priceMin: params.priceMin,
    priceMax: params.priceMax,
    occasions: params.occasions,
    styleTags: params.styles,
    sort: params.sort,
  });
}
