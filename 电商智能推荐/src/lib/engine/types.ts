import type { CategoryKey, Product, Review } from "@/lib/types";

export type RecoScene =
  | "home"
  | "stylist"
  | "pdp"
  | "cart"
  | "search"
  | "checkout"
  | "email";

export type RecallSource =
  | "vector"
  | "collaborative"
  | "rule"
  | "trending"
  | "editorial";

export type RecoConstraints = {
  categories?: CategoryKey[];
  excludeCategories?: CategoryKey[];
  colors?: string[];
  sizes?: string[];
  occasions?: string[];
  styleTags?: string[];
  priceMin?: number;
  priceMax?: number;
  keywords?: string[];
  excludeProductIds?: string[];
  inStockOnly?: boolean;
  roles?: Array<Product["role"]>;
};

export type RecoRequest = {
  userId?: string;
  sessionId?: string;
  scene: RecoScene;
  constraints?: RecoConstraints;
  limit?: number;
  triggerProductId?: string;
  query?: string;
  interests?: string[];
  excludeProductIds?: string[];
};

export type RankFactor = {
  key: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
};

export type EvidenceSource =
  | "画像"
  | "商品特征"
  | "行为"
  | "评价"
  | "趋势"
  | "搭配规则";

export type Evidence = {
  source: EvidenceSource;
  label: string;
  detail: string;
  confidence: number;
};

export type ReasonPayload = {
  headline: string;
  detail: string;
  evidence: Evidence[];
  confidence: number;
  generator: "template" | "llm";
};

export type Recommendation = {
  product: Product;
  score: number;
  rank: number;
  sources: RecallSource[];
  factors: RankFactor[];
  reason: ReasonPayload;
  matchedTags: string[];
  reviewSnippet?: Pick<Review, "author" | "rating" | "body" | "fitFeedback"> | null;
};

export type RecallStat = {
  source: RecallSource;
  label: string;
  candidates: number;
  contributed: number;
  latencyMs: number;
};

export type RecoTrace = {
  requestId: string;
  userId: string;
  scene: RecoScene;
  variant: "A" | "B";
  modelVersion: string;
  recall: RecallStat[];
  candidateCount: number;
  filteredCount: number;
  rankingFormula: string;
  weights: Record<string, number>;
  filters: string[];
  diversification: {
    mmrLambda: number;
    categoryCap: number;
    applied: number;
  };
  coldStart: boolean;
  totalLatencyMs: number;
};

export type RecoResult = {
  items: Recommendation[];
  trace: RecoTrace;
  profile: ProfileView | null;
  fallback: boolean;
};

export type ProfileView = {
  userId: string;
  name: string;
  archetype: string;
  isColdStart: boolean;
  embedding: number[];
  staticEmbedding: number[];
  rfm: {
    recencyDays: number;
    frequency: number;
    monetary: number;
    segment: "高价值" | "潜力" | "成长" | "沉睡" | "新客";
  };
  behavior: {
    total: number;
    last30d: number;
    views: number;
    wishlists: number;
    carts: number;
    purchases: number;
    topQueries: string[];
  };
  affinities: {
    styles: Array<{ tag: string; weight: number }>;
    colors: Array<{ name: string; weight: number }>;
    occasions: Array<{ tag: string; weight: number }>;
    categories: Array<{ key: CategoryKey; weight: number }>;
  };
  recentProducts: Array<{ productId: string; name: string; type: string; ts: string }>;
  tags: string[];
  priceBand: { min: number; max: number };
  sizes: { top: string; bottom: string; shoes: string };
  body: { height: number; weight: number; bodyType: string };
  updatedAt: string;
};

export type SearchFilters = RecoConstraints & {
  sort?: "relevance" | "newest" | "price_asc" | "price_desc" | "popular";
};

export type SearchResult = {
  products: Product[];
  total: number;
  query: string;
  slots: Record<string, unknown>;
  tookMs: number;
  suggestions: string[];
};

export type OutfitSlot =
  | "outer"
  | "top"
  | "bottom"
  | "dress"
  | "shoes"
  | "bag"
  | "accessory";

export type Outfit = {
  id: string;
  title: string;
  occasion: string;
  items: Array<{ slot: OutfitSlot; product: Product; reason: string }>;
  total: number;
  harmony: string[];
  notes: string;
  scene: RecoScene;
};
