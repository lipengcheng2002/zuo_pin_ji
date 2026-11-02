import type { Product } from "@/lib/types";
import { PRODUCT_MAP } from "@/lib/data/catalog";
import type {
  Evidence,
  ProfileView,
  ReasonPayload,
  RecoScene,
  Recommendation,
  RankFactor,
} from "@/lib/engine/types";
import { clamp } from "@/lib/engine/text";
import {
  complementLabel,
  getComplementScore,
  getItemFeature,
} from "@/lib/engine/features";
import { productKnowledge, productReviewSnippet, suggestSize } from "@/lib/engine/knowledge";
import { productAffinity } from "@/lib/engine/profile";

const CATEGORY_LABEL: Record<string, string> = {
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

type ReasonInput = {
  item: Pick<Recommendation, "product" | "factors" | "sources" | "matchedTags">;
  profile: ProfileView;
  scene: RecoScene;
  triggerProduct?: Product;
  index: number;
};

const topFactor = (factors: RankFactor[]): RankFactor | undefined =>
  factors.find((f) => f.contribution > 0);

const matchingStyle = (profile: ProfileView, product: Product) =>
  profile.affinities.styles.find((s) => product.styleTags.includes(s.tag));

const matchingColor = (profile: ProfileView, product: Product) =>
  profile.affinities.colors.find((c) =>
    product.colors.some((pc) => pc.name === c.name || pc.name.includes(c.name)),
  );

const matchingOccasion = (profile: ProfileView, product: Product) =>
  profile.affinities.occasions.find((o) => product.occasions.includes(o.tag));

const pairFromHistory = (profile: ProfileView, product: Product): Product | undefined => {
  for (const entry of profile.recentProducts) {
    if (entry.productId === product.id) continue;
    const score = getComplementScore(product.id, entry.productId);
    if (score >= 0.55) {
      const candidate = PRODUCT_MAP[entry.productId];
      if (candidate) return candidate;
    }
  }
  return undefined;
};

const recommendedSize = (profile: ProfileView, product: Product): string =>
  suggestSize(product, profile.sizes.top, 165, 52);

export function generateReason({
  item,
  profile,
  scene,
  triggerProduct,
  index,
}: ReasonInput): ReasonPayload {
  const { product } = item;
  const feature = getItemFeature(product.id);
  const knowledge = productKnowledge(product);
  const style = matchingStyle(profile, product);
  const color = matchingColor(profile, product);
  const occasion = matchingOccasion(profile, product);
  const categoryLabel = CATEGORY_LABEL[product.category] ?? product.subcategory;
  const review = productReviewSnippet(product.id);
  const size = recommendedSize(profile, product);
  const sizeOption = product.sizes.find((s) => s.label === size);
  const complementToTrigger =
    triggerProduct && triggerProduct.id !== product.id
      ? getComplementScore(triggerProduct.id, product.id)
      : 0;
  const pair = pairFromHistory(profile, product);
  const strongest = topFactor(item.factors);
  const recentCategoryHits = profile.recentProducts.filter((entry) => {
    return PRODUCT_MAP[entry.productId]?.category === product.category;
  }).length;

  const evidence: Evidence[] = [];

  evidence.push({
    source: "画像",
    label: `${profile.archetype} · ${profile.rfm.segment}用户`,
    detail: `风格偏好 ${profile.affinities.styles.slice(0, 2).map((s) => s.tag).join(" / ") || "待补充"}；常购价格带 ¥${profile.priceBand.min}–${profile.priceBand.max}。`,
    confidence: 0.9,
  });

  evidence.push({
    source: "商品特征",
    label: `${product.materials[0]?.name ?? "面料"} ${product.materials[0]?.pct ?? ""}% · 保暖 ${product.features.warmth}/5`,
    detail: `${product.fit}，${product.length}；${product.occasions.slice(0, 2).join(" / ")}场景适用。`,
    confidence: 0.94,
  });

  if (profile.behavior.last30d > 0) {
    evidence.push({
      source: "行为",
      label: `近 30 天 ${profile.behavior.last30d} 次互动`,
      detail:
        recentCategoryHits > 0
          ? `其中 ${recentCategoryHits} 件${categoryLabel}进入近期关注列表。`
          : `浏览 ${profile.behavior.views} 次、收藏 ${profile.behavior.wishlists} 次、加购 ${profile.behavior.carts} 次。`,
      confidence: 0.86,
    });
  }

  if (review) {
    evidence.push({
      source: "评价",
      label: `「${review.title}」— ${review.author} ${review.rating}.0 星`,
      detail: `${review.height}cm / ${review.weight}kg，购 ${review.purchasedSize} 码，尺码感受「${review.fitFeedback}」。`,
      confidence: 0.78,
    });
  }

  if (feature && feature.popularity > 0.45) {
    evidence.push({
      source: "趋势",
      label: `近 30 天售出 ${product.sold30d} 件`,
      detail: `评分 ${product.rating}，复购率高于${categoryLabel}类目均值。`,
      confidence: 0.72,
    });
  }

  if (complementToTrigger > 0.4) {
    evidence.push({
      source: "搭配规则",
      label: `与「${triggerProduct!.name}」互补`,
      detail: `${complementLabel(product.role)}与${complementLabel(triggerProduct!.role)}在色彩、正式度与场景上匹配度 ${(complementToTrigger * 100).toFixed(0)}%。`,
      confidence: 0.88,
    });
  } else if (pair) {
    evidence.push({
      source: "搭配规则",
      label: `可搭配你的「${pair.name}」`,
      detail: `同属${pair.styleTags[0] ?? profile.archetype}风格，正式度差 ${Math.abs(pair.features.formality - product.features.formality)} 级。`,
      confidence: 0.82,
    });
  }

  // Headline — scene-aware priority, with light variation.
  let headline: string;
  if (scene === "pdp" || scene === "cart") {
    headline = complementToTrigger > 0.5 ? `与「${triggerProduct!.name}」成套` : `同类单品里的更优解`;
  } else if (style) {
    headline = index % 2 === 0 ? `${style.tag}衣橱的下一件` : `${color?.name ?? "中性色"} · ${style.tag}主线`;
  } else if (color) {
    headline = `${color.name}，你的常用色`;
  } else if (occasion) {
    headline = `为${occasion.tag}场景而选`;
  } else if (feature && product.sold30d > 180) {
    headline = `近 30 天 ${product.sold30d} 人选择`;
  } else {
    headline = `AI 为你挑选的${categoryLabel}`;
  }

  const profileClause =
    recentCategoryHits > 0
      ? `你近期关注过 ${recentCategoryHits} 件${categoryLabel}，对「${style?.tag ?? profile.archetype}」的偏好权重最高`
      : `你的画像偏向「${profile.archetype}」，${color ? `${color.name}与` : ""}${occasion?.tag ?? "日常"}场景是高频需求`;

  const materialClause = `${knowledge.facts["面料成分"]}，${product.fit}${product.length !== "—" ? `、${product.length}` : ""}`;

  const whyClause =
    size === "均码"
      ? "均码，适合你的日常搭配"
      : sizeOption
        ? `按你的常穿尺码建议 ${size} 码，当前${sizeOption.stock > 0 ? "有货" : "库存紧张"}`
        : `均码，适合你的日常搭配`;

  const pairingClause = pair
    ? `；可与你的「${pair.name}」直接组成一套`
    : complementToTrigger > 0.4
      ? `；与「${triggerProduct!.name}」的正式度和色温一致`
      : "";

  const detail = `${profileClause}。${materialClause}，${product.occasions[0]}与${product.occasions[1] ?? product.occasions[0]}都成立。${whyClause}${pairingClause}。`;

  const confidence = clamp(
    0.56 +
      evidence.length * 0.055 +
      (profile.isColdStart ? 0 : 0.1) +
      (strongest ? strongest.contribution * 0.5 : 0),
    0.55,
    0.97,
  );

  return {
    headline,
    detail,
    evidence: evidence.slice(0, 4),
    confidence: Number(confidence.toFixed(2)),
    generator: "template",
  };
}

export function enrichWithReasons(
  ranked: Array<{
    product: Product;
    score: number;
    sources: Recommendation["sources"];
    factors: RankFactor[];
    matchedTags: string[];
  }>,
  profile: ProfileView,
  scene: RecoScene,
  triggerProduct?: Product,
): Recommendation[] {
  return ranked.map((item, index) => ({
    product: item.product,
    score: item.score,
    rank: index + 1,
    sources: item.sources,
    factors: item.factors,
    matchedTags: item.matchedTags,
    reason: generateReason({ item, profile, scene, triggerProduct, index }),
    reviewSnippet: productReviewSnippet(item.product.id),
  }));
}

export const reasonHeadline = (payload: ReasonPayload) => payload.headline;

/** Explain a single PDP product using the same RAG-backed reason pipeline. */
export function explainProduct(
  product: Product,
  profile: ProfileView,
  scene: RecoScene = "home",
): ReasonPayload {
  const feature = getItemFeature(product.id);
  const affinity = productAffinity(profile, product);
  const factors: RankFactor[] = [
    {
      key: "affinity",
      label: "画像亲和",
      value: affinity,
      weight: 0.55,
      contribution: affinity * 0.55,
    },
    {
      key: "quality",
      label: "商品质量",
      value: feature?.qualityScore ?? 0.7,
      weight: 0.25,
      contribution: (feature?.qualityScore ?? 0.7) * 0.25,
    },
    {
      key: "trend",
      label: "热度趋势",
      value: feature?.trendScore ?? 0.4,
      weight: 0.2,
      contribution: (feature?.trendScore ?? 0.4) * 0.2,
    },
  ];
  return generateReason({
    item: { product, factors, sources: ["vector", "rule"], matchedTags: [] },
    profile,
    scene,
    index: 0,
  });
}
