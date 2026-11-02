import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import { BEHAVIORS, DEMO_USER_ID } from "@/lib/data/community";
import type { BehaviorEvent, Product } from "@/lib/types";
import type {
  ProfileView,
  RecoRequest,
  RecoResult,
  RecoScene,
} from "@/lib/engine/types";
import { buildProfileView } from "@/lib/engine/profile";
import { recall } from "@/lib/engine/recall";
import { rankCandidates, rankingFormula } from "@/lib/engine/rank";
import { enrichWithReasons } from "@/lib/engine/reason";
import { assignVariant, variantModelVersion } from "@/lib/engine/experiment";
import { getItemFeature } from "@/lib/engine/features";

const DEFAULT_LIMIT = 8;

let personalizationEnabled = true;
let explanationsEnabled = true;

export function setPersonalizationEnabled(enabled: boolean): void {
  personalizationEnabled = enabled;
}

export function setExplanationsEnabled(enabled: boolean): void {
  explanationsEnabled = enabled;
}

const requestId = () =>
  `rec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function recommend(
  request: RecoRequest,
  options: { events?: BehaviorEvent[]; userProfile?: ProfileView } = {},
): RecoResult {
  const started = performance.now();
  const scene: RecoScene = request.scene;
  const userId = request.userId ?? DEMO_USER_ID;
  const events = options.events ?? BEHAVIORS;
  const baseProfile =
    options.userProfile ??
    buildProfileView(userId, events, request.interests ?? []);
  const profile = personalizationEnabled
    ? baseProfile
    : buildProfileView("anon_preview", [], request.interests ?? []);
  const limit = Math.max(1, Math.min(24, request.limit ?? DEFAULT_LIMIT));
  const triggerProduct = request.triggerProductId
    ? PRODUCT_MAP[request.triggerProductId]
    : undefined;
  const variant = assignVariant(request.sessionId ?? userId, userId);

  const constraints = {
    ...request.constraints,
    excludeProductIds: [
      ...(request.constraints?.excludeProductIds ?? []),
      ...(request.excludeProductIds ?? []),
      ...(triggerProduct ? [triggerProduct.id] : []),
    ],
    inStockOnly: request.constraints?.inStockOnly ?? true,
  };

  const recallResult = recall(
    profile,
    scene,
    constraints,
    triggerProduct,
    request.query,
  );

  let ranked = rankCandidates({
    candidates: recallResult.candidates,
    profile,
    scene,
    triggerProduct,
    variant,
    limit,
  });

  let fallback = false;
  if (!ranked.ranked.length) {
    fallback = true;
    const popular = [...PRODUCTS]
      .filter((p) => p.sizes.some((s) => s.stock > 0))
      .filter((p) => !constraints.excludeProductIds?.includes(p.id))
      .sort(
        (a, b) => (getItemFeature(b.id)?.popularity ?? 0) - (getItemFeature(a.id)?.popularity ?? 0),
      )
      .slice(0, limit)
      .map((product) => {
        const score = getItemFeature(product.id)?.popularity ?? 0.5;
        return {
          product,
          score,
          sourceScores: { trending: score },
          sources: ["trending"] as RecoResult["items"][number]["sources"],
          factors: [],
          matchedTags: ["热门"],
        };
      });
    const rankedFallback = rankCandidates({
      candidates: new Map(popular.map((p) => [p.product.id, p])),
      profile,
      scene,
      variant,
      limit,
    });
    ranked = rankedFallback;
  }

  const items = enrichWithReasons(ranked.ranked, profile, scene, triggerProduct);
  if (!explanationsEnabled) {
    items.forEach((item) => {
      item.reason = {
        headline: "编辑精选",
        detail: "本期编辑精选单品，按当季主题与库存状态排序。",
        evidence: [],
        confidence: 0.6,
        generator: "template",
      };
    });
  }

  const sourceContribution = new Map<string, number>();
  items.forEach((item) => {
    item.sources.forEach((source) => {
      sourceContribution.set(source, (sourceContribution.get(source) ?? 0) + 1);
    });
  });
  const recallStats = recallResult.stats.map((stat) => ({
    ...stat,
    contributed: sourceContribution.get(stat.source) ?? 0,
  }));

  const totalLatency = Number((performance.now() - started).toFixed(2));

  return {
    items,
    profile,
    fallback,
    trace: {
      requestId: requestId(),
      userId: profile.userId,
      scene,
      variant,
      modelVersion: variantModelVersion(variant),
      recall: recallStats,
      candidateCount: recallResult.candidates.size,
      filteredCount: recallResult.filteredCount,
      rankingFormula: rankingFormula(ranked.weights),
      weights: ranked.weights,
      filters: [...recallResult.filtersApplied, ...recallResult.relaxed],
      diversification: {
        mmrLambda: ranked.lambda,
        categoryCap: ranked.categoryCap,
        applied: ranked.applied,
      },
      coldStart: profile.isColdStart,
      totalLatencyMs: totalLatency,
    },
  };
}

export function similarProducts(productId: string, limit = 6): Product[] {
  const seed = PRODUCT_MAP[productId];
  if (!seed) return [];
  const profile = buildProfileView(DEMO_USER_ID);
  const result = recommend(
    {
      userId: DEMO_USER_ID,
      scene: "pdp",
      triggerProductId: productId,
      limit,
      constraints: {
        excludeCategories: [],
      },
    },
    { userProfile: profile },
  );
  return result.items.map((item) => item.product).filter((p) => p.id !== seed.id);
}

export function recommendForUser(
  userId: string,
  scene: RecoScene = "home",
  limit = 8,
  events?: BehaviorEvent[],
): RecoResult {
  return recommend({ userId, scene, limit }, { events });
}

export function profileForUser(userId: string, events?: BehaviorEvent[]): ProfileView {
  return buildProfileView(userId, events ?? BEHAVIORS);
}

export const sceneLabel: Record<RecoScene, string> = {
  home: "首页「为你精选」",
  stylist: "AI 造型师对话",
  pdp: "商品详情页「搭配这套」",
  cart: "购物袋交叉推荐",
  search: "搜索结果排序",
  checkout: "结算页加购推荐",
  email: "订阅邮件个性化",
};

export const recommendationSummary = (result: RecoResult): string =>
  result.items
    .slice(0, 4)
    .map(
      (item, index) =>
        `${index + 1}. ${item.product.name}（¥${item.product.price}，匹配度 ${(item.score * 100).toFixed(0)}%）— ${item.reason.detail}`,
    )
    .join("\n");
