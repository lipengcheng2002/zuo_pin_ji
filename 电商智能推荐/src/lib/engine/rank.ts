import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import type { Product } from "@/lib/types";
import type {
  ProfileView,
  RecoScene,
  Recommendation,
  RankFactor,
  RecallSource,
} from "@/lib/engine/types";
import type { Candidate } from "@/lib/engine/recall";
import {
  clamp,
  cosine,
  overlapCount,
} from "@/lib/engine/text";
import { getComplementScore, getItemFeature } from "@/lib/engine/features";
import { getProductEmbedding, productAffinity } from "@/lib/engine/profile";

const BASE_WEIGHTS: Record<string, number> = {
  semantic: 0.21,
  collaborative: 0.18,
  constraint: 0.16,
  affinity: 0.15,
  trend: 0.09,
  quality: 0.08,
  complement: 0.04,
  business: 0.04,
  freshness: 0.03,
  editorial: 0.02,
};

export const SCENE_WEIGHTS: Record<RecoScene, Record<string, number>> = {
  home: {
    semantic: 0.2,
    collaborative: 0.19,
    constraint: 0.11,
    affinity: 0.17,
    trend: 0.1,
    quality: 0.08,
    complement: 0.02,
    business: 0.05,
    freshness: 0.05,
    editorial: 0.03,
  },
  stylist: {
    semantic: 0.2,
    collaborative: 0.14,
    constraint: 0.19,
    affinity: 0.18,
    trend: 0.06,
    quality: 0.08,
    complement: 0.07,
    business: 0.03,
    freshness: 0.03,
    editorial: 0.02,
  },
  pdp: {
    semantic: 0.1,
    collaborative: 0.1,
    constraint: 0.11,
    affinity: 0.08,
    trend: 0.05,
    quality: 0.07,
    complement: 0.38,
    business: 0.05,
    freshness: 0.03,
    editorial: 0.03,
  },
  cart: {
    semantic: 0.09,
    collaborative: 0.1,
    constraint: 0.14,
    affinity: 0.09,
    trend: 0.05,
    quality: 0.06,
    complement: 0.34,
    business: 0.07,
    freshness: 0.03,
    editorial: 0.03,
  },
  search: {
    semantic: 0.3,
    collaborative: 0.07,
    constraint: 0.29,
    affinity: 0.1,
    trend: 0.07,
    quality: 0.07,
    complement: 0.01,
    business: 0.02,
    freshness: 0.04,
    editorial: 0.03,
  },
  checkout: {
    semantic: 0.08,
    collaborative: 0.08,
    constraint: 0.12,
    affinity: 0.08,
    trend: 0.04,
    quality: 0.06,
    complement: 0.4,
    business: 0.08,
    freshness: 0.03,
    editorial: 0.03,
  },
  email: {
    semantic: 0.18,
    collaborative: 0.16,
    constraint: 0.12,
    affinity: 0.22,
    trend: 0.08,
    quality: 0.08,
    complement: 0.02,
    business: 0.05,
    freshness: 0.06,
    editorial: 0.03,
  },
};

const BASELINE_WEIGHTS: Record<string, number> = {
  semantic: 0,
  collaborative: 0.34,
  constraint: 0.32,
  affinity: 0,
  trend: 0.17,
  quality: 0.09,
  complement: 0,
  business: 0.04,
  freshness: 0.02,
  editorial: 0.02,
};

export type WeightsPreset = "balanced" | "conversion" | "discovery";
let weightsPreset: WeightsPreset = "balanced";

export function setRankWeightsPreset(preset: WeightsPreset): void {
  weightsPreset = preset;
}

const PRESET_MULTIPLIER: Record<WeightsPreset, Record<string, number>> = {
  balanced: {},
  conversion: {
    collaborative: 1.25,
    affinity: 1.2,
    business: 1.15,
    trend: 1.1,
    semantic: 0.9,
    editorial: 0.6,
    freshness: 0.7,
  },
  discovery: {
    freshness: 1.5,
    editorial: 1.4,
    semantic: 1.25,
    business: 0.5,
    trend: 0.8,
    collaborative: 0.8,
    affinity: 0.95,
  },
};

const FACTOR_LABEL: Record<string, string> = {
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

export type RankedItem = {
  product: Product;
  score: number;
  sources: RecallSource[];
  factors: RankFactor[];
  matchedTags: string[];
};

const DIVERSITY: Record<RecoScene, { lambda: number; cap: number }> = {
  home: { lambda: 0.78, cap: 2 },
  stylist: { lambda: 0.84, cap: 2 },
  pdp: { lambda: 0.86, cap: 3 },
  cart: { lambda: 0.86, cap: 2 },
  search: { lambda: 0.96, cap: 4 },
  checkout: { lambda: 0.9, cap: 2 },
  email: { lambda: 0.82, cap: 2 },
};

const getWeights = (scene: RecoScene, variant: "A" | "B") => {
  if (variant === "A") return { ...BASELINE_WEIGHTS };
  const merged = { ...BASE_WEIGHTS, ...SCENE_WEIGHTS[scene] };
  const multipliers = PRESET_MULTIPLIER[weightsPreset];
  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, value * (multipliers[key] ?? 1)]),
  );
};

const normalizeWeights = (weights: Record<string, number>) => {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0) || 1;
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total]),
  );
};

const matchedTagsFor = (
  candidate: Candidate,
  profile: ProfileView,
): string[] => {
  const { product } = candidate;
  const tags: string[] = [];
  const colorMatch = product.colors.find((c) =>
    profile.affinities.colors.some((fc) => fc.name === c.name),
  );
  if (colorMatch) tags.push(`${colorMatch.name}偏好`);
  const styleMatch = product.styleTags.find((t) =>
    profile.affinities.styles.some((s) => s.tag === t),
  );
  if (styleMatch) tags.push(styleMatch);
  const occasionMatch = product.occasions.find((o) =>
    profile.affinities.occasions.some((os) => os.tag === o),
  );
  if (occasionMatch) tags.push(occasionMatch);
  if (product.price <= profile.priceBand.max * 1.05) tags.push("预算内");
  if (product.sizes.some((s) => s.stock > 0)) tags.push("现货");
  if (candidate.sources.includes("collaborative")) tags.push("相似用户偏好");
  if (candidate.sources.includes("trending")) tags.push("近期热度");
  if (product.badges[0]) tags.push(product.badges[0]);
  return [...new Set(tags)].slice(0, 4);
};

export function rankCandidates(input: {
  candidates: Map<string, Candidate>;
  profile: ProfileView;
  scene: RecoScene;
  triggerProduct?: Product;
  variant: "A" | "B";
  limit: number;
  constraintsSummary?: string[];
}): {
  ranked: RankedItem[];
  weights: Record<string, number>;
  lambda: number;
  categoryCap: number;
  applied: number;
} {
  const { candidates, profile, scene, triggerProduct, variant, limit } = input;
  const weights = normalizeWeights(getWeights(scene, variant));
  const { lambda, cap } = DIVERSITY[scene];
  const scored: Array<RankedItem & { sourceCount: number }> = [];

  candidates.forEach((candidate) => {
    const { product } = candidate;
    const feature = getItemFeature(product.id);
    const itemVec = getProductEmbedding(product);
    const rawSemantic = cosine(profile.embedding, itemVec);
    const semantic = clamp((rawSemantic - 0.05) / 0.45);
    const affinity = productAffinity(profile, product);
    const constraint =
      candidate.sourceScores.rule ??
      clamp(
        (candidate.sourceScores.collaborative ?? 0) * 0.35 +
          (candidate.sourceScores.vector ?? 0) * 0.25,
      );
    const trend = clamp(
      (feature?.popularity ?? 0.4) * 0.55 + (feature?.trendScore ?? 0.4) * 0.45,
    );
    const quality = feature?.qualityScore ?? 0.7;
    const complement = triggerProduct
      ? getComplementScore(triggerProduct.id, product.id)
      : 0;
    const business = clamp(((feature?.marginIndex ?? 0.55) - 0.35) / 0.4);
    const freshness = feature?.freshness ?? 0.4;
    const editorial = candidate.sourceScores.editorial ?? (product.featured ? 0.7 : 0.2);

    const values: Record<string, number> = {
      semantic,
      collaborative: candidate.sourceScores.collaborative ?? 0,
      constraint,
      affinity,
      trend,
      quality,
      complement,
      business,
      freshness,
      editorial,
    };

    let score = 0;
    const factors: RankFactor[] = [];
    Object.entries(weights).forEach(([key, weight]) => {
      if (weight <= 0) return;
      const value = values[key] ?? 0;
      const contribution = value * weight;
      score += contribution;
      factors.push({
        key,
        label: FACTOR_LABEL[key] ?? key,
        value: Number(value.toFixed(3)),
        weight: Number(weight.toFixed(3)),
        contribution: Number(contribution.toFixed(3)),
      });
    });

    if (triggerProduct && product.id === triggerProduct.id) score -= 0.6;
    if (product.price > profile.priceBand.max * 1.35) score -= 0.07;
    const totalStock = product.sizes.reduce((s, x) => s + x.stock, 0);
    if (totalStock < 6) score -= 0.03;
    if (candidate.sources.length >= 3) score += 0.012;

    factors.sort((a, b) => b.contribution - a.contribution);
    scored.push({
      product,
      score: clamp(score),
      sources: candidate.sources,
      factors,
      matchedTags: matchedTagsFor(candidate, profile),
      sourceCount: candidate.sources.length,
    });
  });

  scored.sort((a, b) => b.score - a.score);

  // MMR diversification with category quota.
  const selected: RankedItem[] = [];
  const pool = [...scored];
  const categoryCount = new Map<string, number>();
  const vectorCache = new Map<string, number[]>();
  const vecOf = (p: Product) => {
    let v = vectorCache.get(p.id);
    if (!v) {
      v = getProductEmbedding(p);
      vectorCache.set(p.id, v);
    }
    return v;
  };

  let applied = 0;
  while (selected.length < limit && pool.length) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const item = pool[i];
      const count = categoryCount.get(item.product.category) ?? 0;
      if (count >= cap) continue;
      let maxSim = 0;
      for (const chosen of selected) {
        maxSim = Math.max(
          maxSim,
          cosine(vecOf(item.product), vecOf(chosen.product)),
        );
      }
      const value = lambda * item.score - (1 - lambda) * maxSim;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) break;
    const [chosen] = pool.splice(bestIndex, 1);
    selected.push({
      product: chosen.product,
      score: chosen.score,
      sources: chosen.sources,
      factors: chosen.factors,
      matchedTags: chosen.matchedTags,
    });
    categoryCount.set(
      chosen.product.category,
      (categoryCount.get(chosen.product.category) ?? 0) + 1,
    );
    if (selected.length > 0) applied = categoryCount.size;
  }

  // Fill with the remainder if the quota starved the list.
  if (selected.length < limit) {
    for (const item of pool) {
      if (selected.length >= limit) break;
      selected.push({
        product: item.product,
        score: item.score,
        sources: item.sources,
        factors: item.factors,
        matchedTags: item.matchedTags,
      });
    }
  }

  return {
    ranked: selected.map((item, index) => ({ ...item, rank: index + 1 })) as RankedItem[],
    weights,
    lambda,
    categoryCap: cap,
    applied,
  };
}

export function rankingFormula(weights: Record<string, number>): string {
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, w]) => `${FACTOR_LABEL[key] ?? key} ${Math.round(w * 100)}%`)
    .join(" + ");
}

export const productById = (id: string): Product | undefined => PRODUCT_MAP[id];

export const catalogSize = PRODUCTS.length;

export const factorEntries = (rec: Pick<Recommendation, "factors">) =>
  rec.factors.map((f) => ({
    ...f,
    percent: Math.round(f.contribution * 100),
  }));

export const popularity = (id: string) => getItemFeature(id)?.popularity ?? 0;

export const styleOverlap = (a: Product, b: Product) =>
  overlapCount(a.styleTags, b.styleTags);
