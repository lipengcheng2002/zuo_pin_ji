import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import { BEHAVIORS } from "@/lib/data/community";
import type { BehaviorEvent, Product } from "@/lib/types";
import { clamp, colorHarmony, overlapCount } from "@/lib/engine/text";

export type ItemFeature = {
  productId: string;
  category: string;
  price: number;
  impressions: number;
  clicks: number;
  carts: number;
  purchases: number;
  ctr: number;
  cvr: number;
  cartRate: number;
  trendScore: number;
  qualityScore: number;
  marginIndex: number;
  returnRate: number;
  stock: number;
  freshness: number;
  completeness: number;
  popularity: number;
};

const CATEGORY_MARGIN: Record<string, number> = {
  outerwear: 0.56,
  knitwear: 0.61,
  shirting: 0.55,
  dresses: 0.59,
  trousers: 0.54,
  skirts: 0.56,
  shoes: 0.49,
  bags: 0.63,
  accessories: 0.69,
};

const seededReturnRate = (id: string): number => {
  const num = Number(id.replace(/\D/g, "")) || 1;
  return 0.035 + ((num * 37) % 90) / 1000;
};

const stockOf = (product: Product) =>
  product.sizes.reduce((sum, s) => sum + s.stock, 0);

const daysSince = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  return Math.max(0, diff / 86400000);
};

export type FeatureStore = {
  items: Map<string, ItemFeature>;
  cooccurrence: Map<string, Map<string, number>>;
  complements: Map<string, Map<string, number>>;
  summary: {
    interactedSkus: number;
    catalogSize: number;
    coverage: number;
    coldStartSkus: number;
    avgQuality: number;
    avgCtr: number;
    avgCvr: number;
    totalEvents: number;
  };
};

let store: FeatureStore | null = null;
let storeVersion = -1;

const buildStore = (events: BehaviorEvent[]): FeatureStore => {
  const views = new Map<string, number>();
  const clicks = new Map<string, number>();
  const carts = new Map<string, number>();
  const purchases = new Map<string, number>();
  const recent = new Map<string, number>();
  const pairs = new Map<string, Map<string, number>>();

  const now = Date.now();
  const sessions = new Map<string, Set<string>>();

  events.forEach((event) => {
    if (event.productId) {
      const id = event.productId;
      if (event.type === "view") views.set(id, (views.get(id) ?? 0) + 1);
      if (event.type === "click") clicks.set(id, (clicks.get(id) ?? 0) + 1);
      if (event.type === "add_to_cart") carts.set(id, (carts.get(id) ?? 0) + 1);
      if (event.type === "purchase") purchases.set(id, (purchases.get(id) ?? 0) + 1);
      if (now - new Date(event.ts).getTime() < 14 * 86400000) {
        recent.set(id, (recent.get(id) ?? 0) + event.weight);
      }
      if (!sessions.has(event.sessionId)) sessions.set(event.sessionId, new Set());
      sessions.get(event.sessionId)!.add(id);
    }
  });

  sessions.forEach((ids) => {
    const list = [...ids];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (!pairs.has(a)) pairs.set(a, new Map());
        if (!pairs.has(b)) pairs.set(b, new Map());
        pairs.get(a)!.set(b, (pairs.get(a)!.get(b) ?? 0) + 1);
        pairs.get(b)!.set(a, (pairs.get(b)!.get(a) ?? 0) + 1);
      }
    }
  });

  const items = new Map<string, ItemFeature>();
  const maxSold = Math.max(...PRODUCTS.map((p) => p.sold30d));
  const maxReviews = Math.max(...PRODUCTS.map((p) => p.reviewCount));
  let interacted = 0;
  let qualitySum = 0;
  let ctrSum = 0;
  let cvrSum = 0;

  PRODUCTS.forEach((product) => {
    const impressions = (views.get(product.id) ?? 0) + (clicks.get(product.id) ?? 0);
    const clickCount = (clicks.get(product.id) ?? 0) + (carts.get(product.id) ?? 0);
    const cartCount = carts.get(product.id) ?? 0;
    const purchaseCount = purchases.get(product.id) ?? 0;
    const ctr = (clickCount + 10) / (impressions + 240);
    const cvr = (purchaseCount + 3) / (clickCount * 2 + 90);
    const cartRate = (cartCount + 2) / (clickCount + 70);
    const popularity =
      clamp(product.sold30d / maxSold) * 0.65 +
      clamp((recent.get(product.id) ?? 0) / 60) * 0.2 +
      clamp(product.rating / 5) * 0.15;
    const quality =
      clamp((product.rating - 4.1) / 0.9) * 0.62 +
      clamp(Math.log(product.reviewCount + 1) / Math.log(maxReviews + 1)) * 0.24 +
      clamp(1 - seededReturnRate(product.id) * 4) * 0.14;
    const completeness =
      [
        product.description,
        product.story,
        product.materials.length ? "m" : "",
        product.colors.length ? "c" : "",
        product.sizes.length ? "s" : "",
        product.features.silhouette,
        product.care,
        product.origin,
      ].filter(Boolean).length / 8;
    const freshness = clamp(1 - daysSince(product.releaseDate) / 180);
    const margin = clamp(
      (CATEGORY_MARGIN[product.category] ?? 0.55) + (product.price > 2000 ? 0.03 : 0),
    );
    const stock = stockOf(product);
    if (impressions > 0 || purchaseCount > 0) interacted += 1;
    qualitySum += quality;
    ctrSum += ctr;
    cvrSum += cvr;

    items.set(product.id, {
      productId: product.id,
      category: product.category,
      price: product.price,
      impressions,
      clicks: clickCount,
      carts: cartCount,
      purchases: purchaseCount,
      ctr,
      cvr,
      cartRate,
      trendScore: clamp(
        clamp((recent.get(product.id) ?? 0) / 50) * 0.55 + freshness * 0.45,
      ),
      qualityScore: clamp(quality),
      marginIndex: margin,
      returnRate: seededReturnRate(product.id),
      stock,
      freshness,
      completeness,
      popularity: clamp(popularity),
    });
  });

  const complements = new Map<string, Map<string, number>>();
  PRODUCTS.forEach((seed) => {
    const ranked = PRODUCTS.filter((candidate) => candidate.id !== seed.id)
      .map((candidate) => {
        const co = pairs.get(seed.id)?.get(candidate.id) ?? 0;
        const coScore = clamp(co / 4) * 0.32;
        const roleFit = complementScoreByRole(seed.role, candidate.role);
        const occasion = overlapCount(seed.occasions, candidate.occasions) > 0 ? 0.16 : 0;
        const formality = 1 - Math.abs(seed.features.formality - candidate.features.formality) / 4;
        const color = colorHarmony(seed.colors[0].hex, candidate.colors[0].hex) * 0.14;
        return {
          id: candidate.id,
          score: clamp(coScore + roleFit * 0.42 + occasion + formality * 0.12 + color),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    complements.set(seed.id, new Map(ranked.map((r) => [r.id, r.score])));
  });

  return {
    items,
    cooccurrence: pairs,
    complements,
    summary: {
      interactedSkus: interacted,
      catalogSize: PRODUCTS.length,
      coverage: interacted / PRODUCTS.length,
      coldStartSkus: PRODUCTS.length - interacted,
      avgQuality: qualitySum / PRODUCTS.length,
      avgCtr: ctrSum / PRODUCTS.length,
      avgCvr: cvrSum / PRODUCTS.length,
      totalEvents: events.length,
    },
  };
};

export const complementScoreByRole = (
  seedRole: Product["role"],
  candidateRole: Product["role"],
): number => {
  if (seedRole === candidateRole) return candidateRole === "accessory" ? 0.2 : 0.08;
  const map: Record<string, Product["role"][]> = {
    outer: ["top", "bottom", "dress", "shoes", "bag", "accessory"],
    top: ["bottom", "outer", "shoes", "bag", "accessory"],
    bottom: ["top", "outer", "shoes", "bag", "accessory"],
    dress: ["outer", "shoes", "bag", "accessory"],
    shoes: ["bottom", "dress", "outer", "bag"],
    bag: ["outer", "top", "bottom", "dress", "shoes", "accessory"],
    accessory: ["outer", "top", "dress", "bag", "shoes"],
  };
  const order = map[seedRole] ?? [];
  const index = order.indexOf(candidateRole);
  return index === -1 ? 0 : 1 - index * 0.08;
};

export function getFeatureStore(events: BehaviorEvent[] = BEHAVIORS): FeatureStore {
  if (store && storeVersion === events.length) return store;
  store = buildStore(events);
  storeVersion = events.length;
  return store;
}

export const invalidateFeatureStore = (): void => {
  store = null;
  storeVersion = -1;
};

export function getItemFeature(productId: string): ItemFeature | undefined {
  return getFeatureStore().items.get(productId);
}

export function getComplementScore(seedId: string, candidateId: string): number {
  return getFeatureStore().complements.get(seedId)?.get(candidateId) ?? 0;
}

export function getCooccurrence(seedId: string): Array<{ productId: string; score: number }> {
  const pairs = getFeatureStore().cooccurrence.get(seedId);
  if (!pairs) return [];
  const max = Math.max(1, ...pairs.values());
  return [...pairs.entries()]
    .map(([productId, value]) => ({ productId, score: value / max }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

export function featureCompleteness(product: Product): number {
  return getFeatureStore().items.get(product.id)?.completeness ?? 0.8;
}

export function catalogFeatureMatrix(): Array<{
  product: Product;
  feature: ItemFeature;
  topColor: string;
  colors: string;
  material: string;
  sizeAvailability: number;
}> {
  const fs = getFeatureStore();
  return PRODUCTS.map((product) => {
    const feature = fs.items.get(product.id)!;
    const available = product.sizes.filter((s) => s.stock > 0).length;
    return {
      product,
      feature,
      topColor: product.colors[0].name,
      colors: product.colors.map((c) => c.name).join(" / "),
      material: product.materials.map((m) => `${m.name} ${m.pct}%`).join(" · "),
      sizeAvailability: available / Math.max(1, product.sizes.length),
    };
  });
}

export const complementLabel = (role: Product["role"]): string =>
  ({
    outer: "外套",
    top: "上装",
    bottom: "下装",
    dress: "连衣裙",
    shoes: "鞋履",
    bag: "包袋",
    accessory: "配饰",
  })[role];

export const getProductById = (id: string): Product | undefined => PRODUCT_MAP[id];
