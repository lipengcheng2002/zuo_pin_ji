import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import { BEHAVIORS, DEMO_USER_ID, USER_MAP } from "@/lib/data/community";
import type { BehaviorEvent, CategoryKey, Product, UserProfile } from "@/lib/types";
import type { ProfileView } from "@/lib/engine/types";
import {
  addScaled,
  clamp,
  embed,
  l2normalize,
  overlapCount,
} from "@/lib/engine/text";

const DAY = 86400000;

const productDoc = (product: Product): string =>
  [
    product.name,
    product.nameEn,
    product.category,
    product.subcategory,
    product.colors.map((c) => c.name).join(" "),
    product.materials.map((m) => m.name).join(" "),
    product.styleTags.join(" "),
    product.occasions.join(" "),
    product.fit,
    product.length,
    product.fabricWeight,
    product.season.join(" "),
    product.description,
    product.story,
    product.features.silhouette,
    product.features.neckline,
    product.features.warmth >= 4 ? "保暖" : "轻薄",
  ].join(" | ");

const productEmbeddingCache = new Map<string, number[]>();

export const getProductEmbedding = (product: Product): number[] => {
  const cached = productEmbeddingCache.get(product.id);
  if (cached) return cached;
  const vec = embed(productDoc(product));
  productEmbeddingCache.set(product.id, vec);
  return vec;
};

export const getCatalogEmbeddings = (): Array<{ product: Product; vector: number[] }> =>
  PRODUCTS.map((product) => ({ product, vector: getProductEmbedding(product) }));

const staticProfileDoc = (user: UserProfile): string =>
  [
    user.archetype,
    user.styleKeywords.join(" "),
    user.favoriteColors.join(" "),
    user.occasions.join(" "),
    user.preferredFit,
    user.bodyType,
    `身高${user.height} 体重${user.weight}`,
    `预算${user.budget.min}到${user.budget.max}`,
    user.city,
    user.tags.join(" "),
  ].join(" | ");

const recencyWeight = (ts: string, now: number): number => {
  const days = Math.max(0, (now - new Date(ts).getTime()) / DAY);
  return Math.exp(-days / 28);
};

type AffinityBucket = Map<string, number>;

const bump = (bucket: AffinityBucket, key: string, amount: number) => {
  bucket.set(key, (bucket.get(key) ?? 0) + amount);
};

const toSorted = (bucket: AffinityBucket, limit = 5) => {
  const max = Math.max(1, ...bucket.values());
  return [...bucket.entries()]
    .map(([key, value]) => ({ key, weight: clamp(value / max) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
};

const EMPTY_PROFILE = (userId: string, interests: string[] = []): ProfileView => {
  const staticVec = l2normalize(embed(["访客", ...interests].join(" | ")));
  return {
    userId,
    name: "访客",
    archetype: "待识别",
    isColdStart: true,
    embedding: staticVec,
    staticEmbedding: staticVec,
    rfm: {
      recencyDays: 0,
      frequency: 0,
      monetary: 0,
      segment: "新客",
    },
    behavior: {
      total: 0,
      last30d: 0,
      views: 0,
      wishlists: 0,
      carts: 0,
      purchases: 0,
      topQueries: [],
    },
    affinities: {
      styles: [],
      colors: [],
      occasions: [],
      categories: [],
    },
    recentProducts: [],
    tags: ["新访客", "冷启动"],
    priceBand: { min: 0, max: 5000 },
    sizes: { top: "M", bottom: "M", shoes: "37" },
    body: { height: 165, weight: 52, bodyType: "未填写" },
    updatedAt: new Date().toISOString(),
  };
};

const cache = new Map<string, { version: number; view: ProfileView }>();

let profileOverrides: Record<string, Partial<UserProfile>> = {};
let dynamicProfiles: Record<string, UserProfile> = {};

export function registerUserOverrides(next: Record<string, Partial<UserProfile>>): void {
  profileOverrides = next;
  cache.clear();
}

export function registerUserProfiles(next: Record<string, UserProfile>): void {
  dynamicProfiles = next;
  cache.clear();
}

const resolveUser = (userId: string): UserProfile | undefined => {
  const base = dynamicProfiles[userId] ?? USER_MAP[userId];
  if (!base) return undefined;
  const override = profileOverrides[userId];
  if (!override) return base;
  return {
    ...base,
    ...override,
    sizes: { ...base.sizes, ...(override.sizes ?? {}) },
  };
};

export function buildProfileView(
  userId: string,
  events: BehaviorEvent[] = BEHAVIORS,
  interests: string[] = [],
): ProfileView {
  const user = resolveUser(userId);
  const userEvents = events.filter((e) => e.userId === userId);
  const version = userEvents.length;
  const cached = cache.get(userId);
  if (cached && cached.version === version) {
    if (cached.view.isColdStart && interests.length) {
      return cached.view;
    }
    return cached.view;
  }

  if (!user) {
    const view = EMPTY_PROFILE(userId, interests);
    cache.set(userId, { version, view });
    return view;
  }

  const now = Date.now();
  const sorted = [...userEvents].sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const styles: AffinityBucket = new Map();
  const colors: AffinityBucket = new Map();
  const occasions: AffinityBucket = new Map();
  const categories: AffinityBucket = new Map();
  const queries: AffinityBucket = new Map();
  const behaviorVector = new Array<number>(getProductEmbedding(PRODUCTS[0]).length).fill(0);
  const recent: ProfileView["recentProducts"] = [];
  const seen = new Set<string>();

  let views = 0;
  let wishlists = 0;
  let carts = 0;
  let purchases = 0;
  let last30d = 0;
  let lastPurchaseTs: string | null = null;
  let monetary = 0;

  for (const event of sorted) {
    const weight = event.weight * recencyWeight(event.ts, now);
    if (Date.now() - new Date(event.ts).getTime() < 30 * DAY) last30d += 1;
    if (event.type === "view") views += 1;
    if (event.type === "wishlist") wishlists += 1;
    if (event.type === "add_to_cart") carts += 1;
    if (event.type === "purchase") {
      purchases += 1;
      if (!lastPurchaseTs) lastPurchaseTs = event.ts;
    }
    if (event.query) bump(queries, event.query, weight);
    const product = event.productId ? PRODUCT_MAP[event.productId] : undefined;
    if (!product) continue;

    addScaled(behaviorVector, getProductEmbedding(product), weight);
    product.styleTags.forEach((tag) => bump(styles, tag, weight));
    product.colors.forEach((color) => bump(colors, color.name, weight * 0.8));
    product.occasions.forEach((occasion) => bump(occasions, occasion, weight * 0.7));
    bump(categories, product.category, weight * 0.9);
    if (event.type === "purchase") monetary += product.price;

    if (!seen.has(product.id) && recent.length < 8) {
      seen.add(product.id);
      recent.push({
        productId: product.id,
        name: product.name,
        type: event.type,
        ts: event.ts,
      });
    }
  }

  const staticVec = l2normalize(embed(staticProfileDoc(user)));
  const hasSignal = userEvents.length >= 3;
  const normalizedBehavior = l2normalize(behaviorVector);
  const blended = new Array<number>(staticVec.length).fill(0);
  if (hasSignal) {
    addScaled(blended, normalizedBehavior, 0.62);
    addScaled(blended, staticVec, 0.38);
  } else {
    addScaled(blended, staticVec, 1);
  }
  const embedding = l2normalize(blended);

  const recencyDays = sorted.length
    ? Math.max(0, Math.round((now - new Date(sorted[0].ts).getTime()) / DAY))
    : 999;
  const frequency = Math.max(purchases, user.ordersCount);
  const monetaryValue = Math.max(monetary, user.lifetimeValue);
  const segment: ProfileView["rfm"]["segment"] =
    recencyDays > 60 && monetaryValue < 6000
      ? "沉睡"
      : monetaryValue >= 10000 && frequency >= 4
        ? "高价值"
        : frequency >= 2
          ? "成长"
          : "潜力";

  const styleAff = toSorted(styles);
  const colorAff = toSorted(colors);
  const occasionAff = toSorted(occasions);
  const categoryAff = toSorted(categories) as Array<{ key: CategoryKey; weight: number }>;

  const purchasePrices = sorted
    .filter((e) => e.type === "purchase" && e.productId)
    .map((e) => PRODUCT_MAP[e.productId as string]?.price)
    .filter((v): v is number => Boolean(v));
  const avgPurchase = purchasePrices.length
    ? Math.round(purchasePrices.reduce((a, b) => a + b, 0) / purchasePrices.length)
    : null;

  const tags = new Set(user.tags);
  tags.add(user.archetype);
  if (styleAff[0]) tags.add(`${styleAff[0].key}偏好`);
  if (colorAff[0]) tags.add(`${colorAff[0].key}色偏好`);
  if (categoryAff[0]) {
    const label: Record<string, string> = {
      outerwear: "外套",
      knitwear: "针织",
      shirting: "衬衫",
      dresses: "连衣裙",
      trousers: "裤装",
      skirts: "半裙",
      shoes: "鞋履",
      bags: "包袋",
      accessories: "配饰",
    };
    tags.add(`${label[categoryAff[0].key] ?? categoryAff[0].key}高频`);
  }
  tags.add(last30d >= 8 ? "近30天高活跃" : "近30天活跃");
  if (getSeasonAffinity(sorted, now) >= 0.6) tags.add("关注保暖材质");
  if (avgPurchase && avgPurchase >= 1500) tags.add("中高客单");

  const view: ProfileView = {
    userId,
    name: user.name,
    archetype: user.archetype,
    isColdStart: !hasSignal,
    embedding,
    staticEmbedding: staticVec,
    rfm: {
      recencyDays,
      frequency,
      monetary: monetaryValue,
      segment,
    },
    behavior: {
      total: userEvents.length,
      last30d,
      views,
      wishlists,
      carts,
      purchases,
      topQueries: toSorted(queries, 4).map((q) => q.key),
    },
    affinities: {
      styles: styleAff.map((s) => ({ tag: s.key, weight: s.weight })),
      colors: colorAff.map((c) => ({ name: c.key, weight: c.weight })),
      occasions: occasionAff.map((o) => ({ tag: o.key, weight: o.weight })),
      categories: categoryAff,
    },
    recentProducts: recent,
    tags: [...tags],
    priceBand: {
      min: avgPurchase ? Math.max(user.budget.min, Math.round(avgPurchase * 0.6)) : user.budget.min,
      max: avgPurchase ? Math.max(user.budget.max, Math.round(avgPurchase * 1.5)) : user.budget.max,
    },
    sizes: user.sizes,
    body: { height: user.height, weight: user.weight, bodyType: user.bodyType },
    updatedAt: new Date().toISOString(),
  };

  cache.set(userId, { version, view });
  return view;
}

const getSeasonAffinity = (events: BehaviorEvent[], now: number): number => {
  const winterEvents = events.filter((e) => {
    if (!e.productId) return false;
    const product = PRODUCT_MAP[e.productId];
    return product && product.features.warmth >= 4;
  });
  const recent = winterEvents.filter(
    (e) => now - new Date(e.ts).getTime() < 45 * DAY,
  );
  return recent.length / Math.max(1, events.length);
};

export function profileSummary(view: ProfileView): string {
  const styles = view.affinities.styles.map((s) => s.tag).slice(0, 3).join("、") || "尚未识别";
  const colors = view.affinities.colors.map((c) => c.name).slice(0, 3).join("、") || "尚未识别";
  const occasions = view.affinities.occasions.map((o) => o.tag).slice(0, 3).join("、") || "尚未识别";
  const recent = view.recentProducts
    .slice(0, 3)
    .map((p) => p.name)
    .join("、");
  return [
    `用户 ${view.name}，风格类型「${view.archetype}」，RFM 分层「${view.rfm.segment}」。`,
    `近 30 天行为 ${view.behavior.last30d} 次，其中浏览 ${view.behavior.views} 次、收藏 ${view.behavior.wishlists} 次、加购 ${view.behavior.carts} 次、购买 ${view.behavior.purchases} 次。`,
    `风格偏好：${styles}；色彩偏好：${colors}；高频场景：${occasions}。`,
    `常穿尺码：上衣 ${view.sizes.top} / 下装 ${view.sizes.bottom} / 鞋 ${view.sizes.shoes}；价格带 ¥${view.priceBand.min}–${view.priceBand.max}。`,
    recent ? `最近关注：${recent}。` : "",
    `画像标签：${view.tags.slice(0, 8).join("、")}。`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const demoProfile = (): ProfileView => buildProfileView(DEMO_USER_ID);

export const productAffinity = (view: ProfileView, product: Product): number => {
  const tagMatch = overlapCount(view.affinities.styles.map((s) => s.tag), product.styleTags);
  const styleScore = clamp(tagMatch / Math.max(1, product.styleTags.length)) * 0.45;
  const colorMatch = product.colors.some((c) =>
    view.affinities.colors.some((fc) => fc.name === c.name),
  )
    ? 0.2
    : 0;
  const occasionMatch = overlapCount(
    view.affinities.occasions.map((o) => o.tag),
    product.occasions,
  );
  const occasionScore = clamp(occasionMatch / Math.max(1, product.occasions.length)) * 0.2;
  const priceFit =
    product.price >= view.priceBand.min * 0.8 && product.price <= view.priceBand.max
      ? 0.15
      : product.price < view.priceBand.min * 0.8
        ? 0.08
        : 0;
  return clamp(styleScore + colorMatch + occasionScore + priceFit);
};
