import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import { BEHAVIORS } from "@/lib/data/community";
import type { Product } from "@/lib/types";
import type {
  ProfileView,
  RecallSource,
  RecallStat,
  RecoConstraints,
  RecoScene,
} from "@/lib/engine/types";
import {
  clamp,
  cosine,
  embed,
  normalizeScores,
  overlapCount,
} from "@/lib/engine/text";
import {
  getComplementScore,
  getCooccurrence,
  getFeatureStore,
  getItemFeature,
} from "@/lib/engine/features";
import { productAffinity, getProductEmbedding } from "@/lib/engine/profile";

export type Candidate = {
  product: Product;
  sourceScores: Partial<Record<RecallSource, number>>;
  sources: RecallSource[];
};

export type RecallOutput = {
  candidates: Map<string, Candidate>;
  stats: RecallStat[];
  filteredCount: number;
  filtersApplied: string[];
  relaxed: string[];
};

const SOURCE_LABEL: Record<RecallSource, string> = {
  vector: "向量召回 · Embedding ANN",
  collaborative: "协同过滤 · Item-CF / User-CF",
  rule: "规则召回 · 约束命中",
  trending: "热度召回 · 实时趋势",
  editorial: "编辑精选 · 新品",
};

const allAvailable = (product: Product): boolean =>
  product.sizes.some((s) => s.stock > 0);

const withinBudget = (product: Product, min?: number, max?: number): boolean => {
  if (min !== undefined && product.price < min * 0.8) return false;
  if (max !== undefined && product.price > max) return false;
  return true;
};

export function passesHardFilters(
  product: Product,
  constraints: RecoConstraints,
): boolean {
  if (constraints.excludeProductIds?.includes(product.id)) return false;
  if (constraints.excludeCategories?.includes(product.category)) return false;
  if (constraints.categories?.length && !constraints.categories.includes(product.category))
    return false;
  if (constraints.roles?.length && !constraints.roles.includes(product.role)) return false;
  if (constraints.colors?.length) {
    const hasColor = product.colors.some((c) =>
      constraints.colors!.some((name) => c.name.includes(name) || name.includes(c.name)),
    );
    if (!hasColor) return false;
  }
  if (constraints.sizes?.length) {
    const hasSize = product.sizes.some(
      (s) =>
        s.stock > 0 &&
        constraints.sizes!.some(
          (name) => s.label.toLowerCase() === name.toLowerCase(),
        ),
    );
    if (!hasSize) return false;
  }
  if (!withinBudget(product, constraints.priceMin, constraints.priceMax)) return false;
  if (constraints.inStockOnly !== false && !allAvailable(product)) return false;
  return true;
}

const takeTop = (
  scored: Array<{ id: string; score: number }>,
  limit = 24,
): Array<{ id: string; score: number }> =>
  scored
    .filter((s) => s.score > 0 && PRODUCT_MAP[s.id])
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

const recentUserProducts = (profile: ProfileView) => {
  const map = new Map<string, number>();
  profile.recentProducts.forEach((entry, index) => {
    const recencyBoost = 1 / (1 + index * 0.25);
    const typeBoost =
      entry.type === "purchase"
        ? 1.4
        : entry.type === "add_to_cart"
          ? 1.2
          : entry.type === "wishlist"
            ? 1.05
            : 0.9;
    map.set(entry.productId, recencyBoost * typeBoost);
  });
  return map;
};

const neighborCache = new Map<string, Map<string, number>>();

const buildNeighbors = (profile: ProfileView): Map<string, number> => {
  const cached = neighborCache.get(profile.userId);
  if (cached) return cached;
  const userItems = new Map<string, Set<string>>();
  BEHAVIORS.forEach((e) => {
    if (!e.productId) return;
    if (!userItems.has(e.userId)) userItems.set(e.userId, new Set());
    if (e.type === "add_to_cart" || e.type === "purchase" || e.type === "wishlist") {
      userItems.get(e.userId)!.add(e.productId);
    }
  });
  const mine = userItems.get(profile.userId) ?? new Set();
  const scores = new Map<string, number>();
  if (mine.size) {
    userItems.forEach((items, userId) => {
      if (userId === profile.userId) return;
      let shared = 0;
      items.forEach((id) => {
        if (mine.has(id)) shared += 1;
      });
      if (shared > 0) {
        scores.set(userId, shared / Math.sqrt(mine.size * items.size));
      }
    });
  }
  const top = new Map(
    [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
  );
  neighborCache.set(profile.userId, top);
  return top;
};

export function recall(
  profile: ProfileView,
  scene: RecoScene,
  constraints: RecoConstraints,
  triggerProduct?: Product,
  query?: string,
): RecallOutput {
  const stats: RecallStat[] = [];
  const candidates = new Map<string, Candidate>();
  const filtersApplied: string[] = [];
  const relaxed: string[] = [];
  const featureStore = getFeatureStore();

  const merge = (source: RecallSource, id: string, rawScore: number) => {
    const product = PRODUCT_MAP[id];
    if (!product) return;
    if (!candidates.has(id)) {
      candidates.set(id, { product, sourceScores: {}, sources: [] });
    }
    const entry = candidates.get(id)!;
    entry.sourceScores[source] = Math.max(entry.sourceScores[source] ?? 0, clamp(rawScore));
    if (!entry.sources.includes(source)) entry.sources.push(source);
  };

  // ---------- 1. Vector recall ----------
  const t0 = performance.now();
  const queryVector = query ? embed(query) : null;
  const seedVector = triggerProduct
    ? embed(
        `${triggerProduct.name} ${triggerProduct.category} ${triggerProduct.styleTags.join(" ")} ${triggerProduct.colors.map((c) => c.name).join(" ")}`,
      )
    : null;
  const vectorScores = PRODUCTS.map((product) => {
    const itemVec = getProductEmbedding(product);
    let score = cosine(profile.embedding, itemVec) * 0.6;
    if (seedVector) score += cosine(seedVector, itemVec) * 0.28;
    if (queryVector) score += cosine(queryVector, itemVec) * 0.42;
    if (scene === "pdp" && triggerProduct) {
      score += getComplementScore(triggerProduct.id, product.id) * 0.1;
    }
    return { id: product.id, score };
  });
  const vectorNormalized = normalizeScores(vectorScores);
  const vectorTop = takeTop(vectorScores, 26);
  vectorTop.forEach(({ id }) => merge("vector", id, vectorNormalized.get(id) ?? 0));
  stats.push({
    source: "vector",
    label: SOURCE_LABEL.vector,
    candidates: vectorScores.filter((v) => v.score > 0).length,
    contributed: vectorTop.length,
    latencyMs: Number((performance.now() - t0).toFixed(2)),
  });

  // ---------- 2. Collaborative filtering ----------
  const t1 = performance.now();
  const cfScores = new Map<string, number>();
  const recent = recentUserProducts(profile);
  recent.forEach((weight, productId) => {
    getCooccurrence(productId).forEach(({ productId: other, score }) => {
      cfScores.set(other, (cfScores.get(other) ?? 0) + score * weight);
    });
  });
  const neighbors = buildNeighbors(profile);
  if (neighbors.size) {
    const itemWeights = new Map<string, number>();
    BEHAVIORS.forEach((event) => {
      if (!event.productId) return;
      if (!["add_to_cart", "purchase", "wishlist"].includes(event.type)) return;
      const neighborWeight = neighbors.get(event.userId);
      if (!neighborWeight) return;
      const value = event.weight * neighborWeight;
      itemWeights.set(event.productId, (itemWeights.get(event.productId) ?? 0) + value);
    });
    itemWeights.forEach((value, id) => {
      cfScores.set(id, (cfScores.get(id) ?? 0) + value * 0.35);
    });
  }
  if (!cfScores.size) {
    PRODUCTS.forEach((p) => {
      const feature = featureStore.items.get(p.id);
      cfScores.set(p.id, (feature?.popularity ?? 0.5) * 0.6);
    });
  }
  const cfArray = [...cfScores.entries()].map(([id, score]) => ({ id, score }));
  const cfNormalized = normalizeScores(cfArray);
  const cfTop = takeTop(cfArray, 26);
  cfTop.forEach(({ id }) => merge("collaborative", id, cfNormalized.get(id) ?? 0));
  stats.push({
    source: "collaborative",
    label: SOURCE_LABEL.collaborative,
    candidates: cfScores.size,
    contributed: cfTop.length,
    latencyMs: Number((performance.now() - t1).toFixed(2)),
  });

  // ---------- 3. Rule recall ----------
  const t2 = performance.now();
  const hardFiltered = PRODUCTS.filter((p) => passesHardFilters(p, constraints));
  if (constraints.categories?.length) filtersApplied.push(`品类 ${constraints.categories.length} 项`);
  if (constraints.colors?.length) filtersApplied.push(`颜色 ${constraints.colors.join(" / ")}`);
  if (constraints.sizes?.length) filtersApplied.push(`尺码 ${constraints.sizes.join(" / ")}`);
  if (constraints.priceMax !== undefined) filtersApplied.push(`价格 ≤ ¥${constraints.priceMax}`);
  if (constraints.occasions?.length) filtersApplied.push(`场景 ${constraints.occasions.join(" / ")}`);
  if (constraints.styleTags?.length) filtersApplied.push(`风格 ${constraints.styleTags.join(" / ")}`);

  const ruleScores = hardFiltered.map((product) => {
    let score = 0.22;
    let max = 0.22;
    if (constraints.categories?.includes(product.category)) {
      score += 0.24;
    }
    max += 0.24;
    if (
      constraints.colors?.some((color) =>
        product.colors.some((c) => c.name.includes(color) || color.includes(c.name)),
      )
    ) {
      score += 0.18;
    }
    max += 0.18;
    if (constraints.occasions?.length) {
      const hits = overlapCount(constraints.occasions, product.occasions);
      score += clamp(hits / constraints.occasions.length) * 0.16;
      max += 0.16;
    }
    if (constraints.styleTags?.length) {
      const hits = overlapCount(constraints.styleTags, product.styleTags);
      score += clamp(hits / constraints.styleTags.length) * 0.14;
      max += 0.14;
    }
    if (constraints.sizes?.length) {
      const hasSize = product.sizes.some(
        (s) => s.stock > 0 && constraints.sizes!.includes(s.label),
      );
      if (hasSize) score += 0.1;
      max += 0.1;
    }
    if (constraints.priceMax !== undefined) {
      const ratio = product.price / Math.max(1, constraints.priceMax);
      score += clamp(1 - Math.abs(ratio - 0.65)) * 0.08;
      max += 0.08;
    }
    if (constraints.keywords?.length) {
      const text = `${product.name}${product.subcategory}${product.styleTags.join("")}${product.description}`;
      const hits = constraints.keywords.filter((k) => text.includes(k)).length;
      score += clamp(hits / Math.max(1, constraints.keywords.length)) * 0.14;
      max += 0.14;
    }
    return { id: product.id, score: clamp(score / max) };
  });
  const ruleNormalized = normalizeScores(ruleScores);
  const ruleTop = takeTop(ruleScores, 26);
  ruleTop.forEach(({ id }) => merge("rule", id, ruleNormalized.get(id) ?? 0));
  stats.push({
    source: "rule",
    label: SOURCE_LABEL.rule,
    candidates: hardFiltered.length,
    contributed: ruleTop.length,
    latencyMs: Number((performance.now() - t2).toFixed(2)),
  });

  // ---------- 4. Trending ----------
  const t3 = performance.now();
  const trendScores = PRODUCTS.map((product) => {
    const feature = featureStore.items.get(product.id);
    const score =
      (feature?.popularity ?? 0) * 0.55 +
      (feature?.trendScore ?? 0) * 0.3 +
      clamp(product.rating / 5) * 0.15;
    return { id: product.id, score };
  });
  const trendNormalized = normalizeScores(trendScores);
  const trendTop = takeTop(trendScores, 22);
  trendTop.forEach(({ id }) => merge("trending", id, trendNormalized.get(id) ?? 0));
  stats.push({
    source: "trending",
    label: SOURCE_LABEL.trending,
    candidates: trendScores.length,
    contributed: trendTop.length,
    latencyMs: Number((performance.now() - t3).toFixed(2)),
  });

  // ---------- 5. Editorial ----------
  const t4 = performance.now();
  const editorialScores = PRODUCTS.map((product) => ({
    id: product.id,
    score:
      (product.featured ? 0.5 : 0) +
      (product.badges.length ? 0.2 : 0) +
      (featureStore.items.get(product.id)?.freshness ?? 0) * 0.3,
  }));
  const editorialNormalized = normalizeScores(editorialScores);
  const editorialTop = takeTop(editorialScores, 16);
  editorialTop.forEach(({ id }) => merge("editorial", id, editorialNormalized.get(id) ?? 0));
  stats.push({
    source: "editorial",
    label: SOURCE_LABEL.editorial,
    candidates: PRODUCTS.length,
    contributed: editorialTop.length,
    latencyMs: Number((performance.now() - t4).toFixed(2)),
  });

  // ---------- Hard filtering & graceful relaxation ----------
  const isSearch = scene === "search";
  const hardFilteredIds = new Set(hardFiltered.map((p) => p.id));
  let filteredCount = 0;
  candidates.forEach((_, id) => {
    if (!hardFilteredIds.has(id)) {
      candidates.delete(id);
      return;
    }
    filteredCount += 1;
  });

  if (filteredCount < Math.max(4, constraints.categories?.length ? 4 : 8) && !isSearch) {
    // Relax colour first, then price ceiling — never category or stock.
    const relaxedConstraints: RecoConstraints = { ...constraints, colors: undefined };
    const relaxedSet = new Set(
      PRODUCTS.filter((p) => passesHardFilters(p, relaxedConstraints)).map((p) => p.id),
    );
    PRODUCTS.forEach((product) => {
      if (candidates.has(product.id)) return;
      if (!relaxedSet.has(product.id)) return;
      const score = productAffinity(profile, product);
      merge("rule", product.id, score * 0.6);
      filteredCount += 1;
    });
    if (constraints.colors?.length) relaxed.push("颜色约束已放宽以补足候选");
    if (filteredCount < 4 && constraints.priceMax !== undefined) {
      const budgetRelaxed: RecoConstraints = {
        ...relaxedConstraints,
        priceMax: Math.round(constraints.priceMax * 1.2),
      };
      const relaxedBudget = new Set(
        PRODUCTS.filter((p) => passesHardFilters(p, budgetRelaxed)).map((p) => p.id),
      );
      PRODUCTS.forEach((product) => {
        if (candidates.has(product.id)) return;
        if (!relaxedBudget.has(product.id)) return;
        merge("rule", product.id, productAffinity(profile, product) * 0.5);
        filteredCount += 1;
      });
      relaxed.push("价格上限已上浮 20%");
    }
  }

  return {
    candidates,
    stats,
    filteredCount,
    filtersApplied,
    relaxed,
  };
}

export const SOURCE_LABELS = SOURCE_LABEL;

export function recallCoverage(): { coverage: number; coldSkus: number } {
  const fs = getFeatureStore();
  return { coverage: fs.summary.coverage, coldSkus: fs.summary.coldStartSkus };
}

export const itemFeatureFor = (id: string) => getItemFeature(id);
