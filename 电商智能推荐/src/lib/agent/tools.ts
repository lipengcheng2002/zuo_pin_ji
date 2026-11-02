import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import type { BehaviorEvent, Product, UserProfile } from "@/lib/types";
import type { ChatMessage, AgentAction, AgentToolName, ToolCallRecord } from "@/lib/agent/types";
import type { IntentResult } from "@/lib/engine/intent";
import type { Outfit, ProfileView, RecoTrace, Recommendation, SearchResult } from "@/lib/engine/types";
import type { RetrievedDoc } from "@/lib/engine/knowledge";
import {
  productKnowledge,
  productReviewSnippet,
  retrieveKnowledge,
  sizeTable,
  suggestSize,
} from "@/lib/engine/knowledge";
import { searchProducts } from "@/lib/engine/search";
import { recommend } from "@/lib/engine/recommend";
import { buildOutfit, outfitForProduct } from "@/lib/engine/outfit";
import { slotsToConstraints } from "@/lib/engine/intent";
import {
  addLine,
  priceCart,
  type CartView,
} from "@/lib/commerce/pricing";
import {
  getCart,
  getOrderByNo,
  getOrdersForUser,
  saveCart,
  saveProfileOverride,
} from "@/lib/store/db";
import type { AppSettings } from "@/lib/store/types";

export type SizeAdvice = {
  productId: string | null;
  productName: string;
  recommended: string;
  alternative: string | null;
  alternativeDirection: "up" | "down" | null;
  fitNote: string;
  reviewNote: string;
  disclaimer: string;
};

export type Comparison = {
  items: Array<{ product: Product; facts: Array<{ label: string; value: string }> }>;
  dimensions: Array<{ label: string; a: string; b: string; winner: "A" | "B" | "tie" }>;
  verdict: string;
  winnerId: string | null;
};

export type ToolContext = {
  sessionId: string;
  userId: string;
  events: BehaviorEvent[];
  profile: ProfileView;
  intent: IntentResult;
  settings: AppSettings;
  message: string;
  history: ChatMessage[];
  productRefs: string[];
  recommendations: Recommendation[];
  recallTrace: RecoTrace | null;
  searchResult: SearchResult | null;
  outfit: Outfit | null;
  comparison: Comparison | null;
  sizeAdvice: SizeAdvice | null;
  knowledge: RetrievedDoc[];
  orders: Awaited<ReturnType<typeof getOrdersForUser>> | null;
  cart: CartView | null;
  actions: AgentAction[];
  focusProduct: Product | null;
  toolCalls: ToolCallRecord[];
};

export type ToolOutcome = {
  summary: string;
  productIds?: string[];
  data?: unknown;
};

export type ToolDefinition = {
  name: AgentToolName;
  label: string;
  description: string;
  argsHint: string;
  risk: "low" | "medium";
};

export const TOOL_CATALOG: ToolDefinition[] = [
  {
    name: "search_catalog",
    label: "商品检索",
    description: "按关键词与结构化筛选检索在售商品，返回相关性排序后的候选。",
    argsHint: "{ query, categories, priceMax, limit }",
    risk: "low",
  },
  {
    name: "get_product",
    label: "商品档案",
    description: "读取单个商品的档案：面料、版型、尺码库存、养护与评价。",
    argsHint: "{ productId }",
    risk: "low",
  },
  {
    name: "recommend",
    label: "个性化召回",
    description: "调用召回与融合排序引擎，生成带理由的个性化推荐。",
    argsHint: "{ limit, occasion, priceMax, seedProductId }",
    risk: "low",
  },
  {
    name: "build_outfit",
    label: "整套搭配",
    description: "围绕场景、预算或指定单品，生成上装/下装/外套/鞋包配饰的完整组合。",
    argsHint: "{ occasion, budget, seedProductId }",
    risk: "low",
  },
  {
    name: "size_advisor",
    label: "尺码建议",
    description: "结合身高体重、常穿尺码与商品版型，计算建议尺码与替代尺码。",
    argsHint: "{ productId, height, weight }",
    risk: "low",
  },
  {
    name: "retrieve_knowledge",
    label: "RAG 检索",
    description: "检索商品知识、评价片段与品牌政策文档，为回答提供依据。",
    argsHint: "{ query, productId, types }",
    risk: "low",
  },
  {
    name: "compare_products",
    label: "商品对比",
    description: "对比两件商品的价格、面料、版型、保暖度、正式度与适配场景。",
    argsHint: "{ ids }",
    risk: "low",
  },
  {
    name: "get_cart",
    label: "查看购物袋",
    description: "读取当前购物袋并计算价格、优惠与搭配缺口。",
    argsHint: "{}",
    risk: "low",
  },
  {
    name: "add_to_cart",
    label: "加入购物袋",
    description: "将指定商品与尺码加入购物袋，校验库存后写入。",
    argsHint: "{ productId, size, color, qty }",
    risk: "medium",
  },
  {
    name: "get_orders",
    label: "订单查询",
    description: "查询当前用户订单状态与物流信息；支持订单号精确定位。",
    argsHint: "{ orderNo }",
    risk: "low",
  },
  {
    name: "update_preference",
    label: "偏好写入",
    description: "把用户明确表达的风格、色彩、场景、预算与尺码写入画像。",
    argsHint: "{ styles, colors, occasions, budget, sizes }",
    risk: "medium",
  },
];

const resolveProduct = (ref?: string): Product | undefined => {
  if (!ref) return undefined;
  const direct = PRODUCT_MAP[ref];
  if (direct) return direct;
  const lowered = ref.toLowerCase();
  return PRODUCTS.find(
    (p) =>
      p.slug === lowered ||
      p.name === ref ||
      p.name.includes(ref) ||
      p.nameEn.toLowerCase().includes(lowered),
  );
};

const firstAvailableSize = (product: Product, recommended: string): string => {
  const exact = product.sizes.find((s) => s.label === recommended && s.stock > 0);
  if (exact) return exact.label;
  return product.sizes.find((s) => s.stock > 0)?.label ?? recommended;
};

export async function executeTool(
  name: AgentToolName,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case "search_catalog": {
      const query =
        (typeof args.query === "string" && args.query) ||
        ctx.intent.slots.keywords.join(" ") ||
        ctx.message;
      const result = searchProducts(query, {
        categories: ctx.intent.slots.categories.length
          ? ctx.intent.slots.categories
          : undefined,
        colors: ctx.intent.slots.colors.length ? ctx.intent.slots.colors : undefined,
        priceMax: ctx.intent.slots.budget?.max,
        sort: "relevance",
      });
      ctx.searchResult = result;
      return {
        summary: `检索「${query}」命中 ${result.total} 件，前 3 件：${result.products
          .slice(0, 3)
          .map((p) => `${p.name} ¥${p.price}`)
          .join("、")}`,
        productIds: result.products.slice(0, 6).map((p) => p.id),
      };
    }

    case "get_product": {
      const ref =
        (typeof args.productId === "string" ? args.productId : undefined) ??
        ctx.productRefs[0] ??
        ctx.recommendations[0]?.product.id ??
        ctx.searchResult?.products[0]?.id;
      const product = resolveProduct(ref);
      if (!product) throw new Error("未找到对应商品，请提供商品名称或 ID");
      ctx.focusProduct = product;
      const knowledge = productKnowledge(product);
      return {
        summary: `${product.name}：${knowledge.facts["面料成分"]}；${product.fit}；评分 ${product.rating}，近 30 天售出 ${product.sold30d} 件。`,
        productIds: [product.id],
        data: knowledge.facts,
      };
    }

    case "recommend": {
      const limit = typeof args.limit === "number" ? Math.min(12, args.limit) : 6;
      const seed = resolveProduct(
        (typeof args.seedProductId === "string" ? args.seedProductId : undefined) ??
          ctx.productRefs[0],
      );
      const constraints = slotsToConstraints(ctx.intent);
      if (typeof args.priceMax === "number") constraints.priceMax = args.priceMax;
      if (typeof args.priceMin === "number") constraints.priceMin = args.priceMin;
      if (typeof args.occasion === "string") constraints.occasions = [args.occasion];
      if (typeof args.category === "string") {
        constraints.categories = [args.category as Product["category"]];
      }
      if (Array.isArray(args.excludeIds)) {
        constraints.excludeProductIds = (args.excludeIds as string[]).filter(
          (id): id is string => typeof id === "string",
        );
      }
      if (args.excludeOutfit && ctx.outfit) {
        constraints.excludeProductIds = [
          ...(constraints.excludeProductIds ?? []),
          ...ctx.outfit.items.map((item) => item.product.id),
        ];
      }
      const result = recommend(
        {
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          scene: "stylist",
          constraints,
          limit,
          triggerProductId: seed?.id,
          query: ctx.message,
        },
        { events: ctx.events, userProfile: ctx.profile },
      );
      ctx.recommendations = result.items;
      ctx.recallTrace = result.trace;
      if (!ctx.focusProduct && result.items[0]) ctx.focusProduct = result.items[0].product;
      return {
        summary: `返回 ${result.items.length} 件推荐；Top1「${result.items[0]?.product.name ?? "无"}」，匹配度 ${Math.round((result.items[0]?.score ?? 0) * 100)}%，召回 ${result.trace.candidateCount} 件，时延 ${result.trace.totalLatencyMs}ms。`,
        productIds: result.items.map((item) => item.product.id),
        data: { trace: result.trace },
      };
    }

    case "build_outfit": {
      const seed = resolveProduct(
        (typeof args.seedProductId === "string" ? args.seedProductId : undefined) ??
          ctx.productRefs[0],
      );
      const occasion =
        (typeof args.occasion === "string" ? args.occasion : undefined) ??
        ctx.intent.slots.occasions[0];
      const budget =
        typeof args.budget === "number"
          ? args.budget
          : ctx.intent.slots.budget?.max;
      const outfit = seed
        ? outfitForProduct(seed.id, ctx.userId)
        : buildOutfit({
            userId: ctx.userId,
            occasion,
            budget,
            events: ctx.events,
          });
      ctx.outfit = outfit;
      return {
        summary: `生成「${outfit.title}」共 ${outfit.items.length} 件，合计 ¥${outfit.total}；搭配逻辑：${outfit.harmony.join(" / ")}。`,
        productIds: outfit.items.map((item) => item.product.id),
      };
    }

    case "size_advisor": {
      const ref =
        (typeof args.productId === "string" ? args.productId : undefined) ??
        ctx.focusProduct?.id ??
        ctx.productRefs[0] ??
        ctx.recommendations[0]?.product.id;
      const product = resolveProduct(ref);
      if (!product) {
        const top = sizeTable.tops.find((row) => row.size === ctx.profile.sizes.top);
        ctx.sizeAdvice = {
          productId: null,
          productName: "通用尺码参考",
          recommended: ctx.profile.sizes.top,
          alternative: ctx.profile.sizes.bottom,
          alternativeDirection: null,
          fitNote: top
            ? `上衣 ${ctx.profile.sizes.top} 码对应胸围 ${top.bust}、腰围 ${top.waist}、臀围 ${top.hip}（cm）；下装 ${ctx.profile.sizes.bottom} 码。`
            : "请提供商品名称与身高体重，我可以给出更准确的建议。",
          reviewNote: "不同版型的松量不同，宽松针织可选小一码，外套按胸围选。",
          disclaimer: "尺码建议基于身高体重与历史购买推算，仅供参考，建议结合试穿决定。",
        };
        return {
          summary: `通用尺码建议：上衣 ${ctx.profile.sizes.top}，下装 ${ctx.profile.sizes.bottom}，鞋履 ${ctx.profile.sizes.shoes}。`,
          data: ctx.sizeAdvice,
        };
      }
      const height =
        typeof args.height === "number" ? args.height : ctx.profile.body.height;
      const weight =
        typeof args.weight === "number" ? args.weight : ctx.profile.body.weight;
      const baseSize =
        product.role === "bottom"
          ? ctx.profile.sizes.bottom
          : product.role === "shoes"
            ? ctx.profile.sizes.shoes
            : ctx.profile.sizes.top;
      const recommended = suggestSize(product, baseSize, height, weight);
      const available = product.sizes.find((s) => s.label === recommended && s.stock > 0);
      const review = productReviewSnippet(product.id);
      const fitFeedback = review?.fitFeedback ?? "正常";
      const sizeOrder =
        product.role === "shoes"
          ? product.sizes.map((size) => size.label)
          : ["XS", "S", "M", "L", "XL"];
      const currentIndex = sizeOrder.indexOf(recommended);
      const preferUp = fitFeedback !== "偏大";
      const steps = preferUp ? [1, -1, 2, -2] : [-1, 1, -2, 2];
      let alternative: string | null = null;
      let alternativeDirection: "up" | "down" | null = null;
      for (const step of steps) {
        const candidate = sizeOrder[currentIndex + step];
        if (!candidate) continue;
        const option = product.sizes.find((size) => size.label === candidate);
        if (option && option.stock > 0) {
          alternative = candidate;
          alternativeDirection = step > 0 ? "up" : "down";
          break;
        }
      }
      const fitNote =
        fitFeedback === "偏小"
          ? "用户普遍反馈偏小，介于两码之间建议选大一码。"
          : fitFeedback === "偏大"
            ? "用户普遍反馈偏大，介于两码之间建议选小一码。"
            : "版型与标注尺码一致，按常穿尺码选择即可。";
      ctx.sizeAdvice = {
        productId: product.id,
        productName: product.name,
        recommended: available ? recommended : firstAvailableSize(product, recommended),
        alternative,
        alternativeDirection,
        fitNote,
        reviewNote: review
          ? `「${review.title}」— ${review.author}，${review.height}cm/${review.weight}kg，购 ${review.purchasedSize} 码。`
          : "暂无同款评价数据。",
        disclaimer: "尺码建议基于身高体重与历史购买推算，仅供参考，建议结合试穿决定。",
      };
      return {
        summary: `${product.name} 建议 ${ctx.sizeAdvice.recommended} 码（${height}cm / ${weight}kg）；${fitNote}`,
        productIds: [product.id],
        data: ctx.sizeAdvice,
      };
    }

    case "retrieve_knowledge": {
      const query =
        (typeof args.query === "string" && args.query) || ctx.message;
      const types = Array.isArray(args.types)
        ? (args.types as RetrievedDoc["type"][])
        : undefined;
      const docs = retrieveKnowledge(query, {
        productId:
          (typeof args.productId === "string" ? args.productId : undefined) ??
          ctx.focusProduct?.id,
        types,
        topK: 4,
      });
      ctx.knowledge = [...docs, ...ctx.knowledge.filter((d) => !docs.some((x) => x.id === d.id))];
      return {
        summary: `命中 ${docs.length} 条知识：${docs.map((d) => d.title).join("；")}`,
        data: docs.map((d) => ({ id: d.id, title: d.title, score: d.score })),
      };
    }

    case "compare_products": {
      const ids = Array.isArray(args.ids)
        ? (args.ids as string[])
        : [...ctx.productRefs];
      let products = ids.map(resolveProduct).filter((p): p is Product => Boolean(p));
      products = [...new Map(products.map((p) => [p.id, p])).values()].slice(0, 2);
      if (products.length < 2) {
        const fillers = ctx.recommendations
          .map((r) => r.product)
          .filter((p) => !products.some((x) => x.id === p.id));
        products = [...products, ...fillers].slice(0, 2);
      }
      if (products.length < 2) {
        const fallback = PRODUCTS.filter((p) => p.category === ctx.intent.slots.categories[0]);
        products = [...products, ...fallback].slice(0, 2);
      }
      if (products.length < 2) throw new Error("需要两件商品才能对比");
      const [a, b] = products;
      const dims: Comparison["dimensions"] = [
        {
          label: "价格",
          a: `¥${a.price}`,
          b: `¥${b.price}`,
          winner: a.price === b.price ? "tie" : a.price < b.price ? "A" : "B",
        },
        {
          label: "面料",
          a: a.materials.map((m) => `${m.name}${m.pct}%`).join("、"),
          b: b.materials.map((m) => `${m.name}${m.pct}%`).join("、"),
          winner: "tie",
        },
        { label: "版型", a: a.fit, b: b.fit, winner: "tie" },
        {
          label: "保暖",
          a: `${a.features.warmth}/5`,
          b: `${b.features.warmth}/5`,
          winner:
            a.features.warmth === b.features.warmth
              ? "tie"
              : a.features.warmth > b.features.warmth
                ? "A"
                : "B",
        },
        {
          label: "正式度",
          a: `${a.features.formality}/5`,
          b: `${b.features.formality}/5`,
          winner:
            a.features.formality === b.features.formality
              ? "tie"
              : a.features.formality > b.features.formality
                ? "A"
                : "B",
        },
        {
          label: "场景",
          a: a.occasions.join(" / "),
          b: b.occasions.join(" / "),
          winner: "tie",
        },
        {
          label: "适合身高",
          a: a.modelInfo,
          b: b.modelInfo,
          winner: "tie",
        },
      ];
      const affA = ctx.profile.affinities.styles.filter((s) => a.styleTags.includes(s.tag)).length;
      const affB = ctx.profile.affinities.styles.filter((s) => b.styleTags.includes(s.tag)).length;
      const priceFitA = a.price <= ctx.profile.priceBand.max ? 1 : 0;
      const priceFitB = b.price <= ctx.profile.priceBand.max ? 1 : 0;
      const scoreA = affA * 2 + priceFitA;
      const scoreB = affB * 2 + priceFitB;
      const winner = scoreA === scoreB ? null : scoreA > scoreB ? a : b;
      const verdict = winner
        ? `更贴合你的是「${winner.name}」：在${winner.styleTags.slice(0, 2).join("、")}风格与你的预算之间取得了更好的平衡，另一件则在${(winner.id === a.id ? b : a).styleTags[0] ?? "场景"}上更有针对性。`
        : "两件在你的画像下匹配度接近：预算优先选价格更低的一件，场景优先看正式度。";
      ctx.comparison = {
        items: [
          {
            product: a,
            facts: [
              { label: "价格", value: `¥${a.price}` },
              { label: "面料", value: a.materials.map((m) => `${m.name}${m.pct}%`).join("、") },
              { label: "版型", value: a.fit },
            ],
          },
          {
            product: b,
            facts: [
              { label: "价格", value: `¥${b.price}` },
              { label: "面料", value: b.materials.map((m) => `${m.name}${m.pct}%`).join("、") },
              { label: "版型", value: b.fit },
            ],
          },
        ],
        dimensions: dims,
        verdict,
        winnerId: winner?.id ?? null,
      };
      return {
        summary: `对比 ${a.name} / ${b.name}：${verdict}`,
        productIds: [a.id, b.id],
        data: ctx.comparison,
      };
    }

    case "get_cart": {
      const cart = await getCart(ctx.sessionId);
      ctx.cart = priceCart(cart);
      if (!ctx.recommendations.length && ctx.cart.lines.length) {
        const seed = ctx.cart.lines[0].productId;
        const result = recommend(
          {
            userId: ctx.userId,
            sessionId: ctx.sessionId,
            scene: "cart",
            triggerProductId: seed,
            limit: 3,
            excludeProductIds: ctx.cart.lines.map((l) => l.productId),
          },
          { events: ctx.events, userProfile: ctx.profile },
        );
        ctx.recommendations = result.items;
      }
      return {
        summary: `购物袋 ${ctx.cart.itemCount} 件，小计 ¥${ctx.cart.summary.subtotal}，应付 ¥${ctx.cart.summary.total}。`,
        productIds: ctx.cart.lines.map((l) => l.productId),
        data: ctx.cart.summary,
      };
    }

    case "add_to_cart": {
      const ref =
        (typeof args.productId === "string" ? args.productId : undefined) ??
        ctx.focusProduct?.id ??
        ctx.productRefs[0] ??
        (ctx.recommendations.length === 1 ? ctx.recommendations[0].product.id : undefined);
      const product = resolveProduct(ref);
      if (!product) throw new Error("请告诉我具体要加入购物袋的商品");
      const requestedSize =
        (typeof args.size === "string" ? args.size : undefined) ??
        ctx.intent.slots.sizes[0];
      const size = requestedSize
        ? product.sizes.find((s) => s.label === requestedSize.toUpperCase())?.label ??
          requestedSize
        : firstAvailableSize(
            product,
            suggestSize(product, ctx.profile.sizes.top, ctx.profile.body.height, ctx.profile.body.weight),
          );
      const sizeOption = product.sizes.find((s) => s.label === size);
      if (!sizeOption || sizeOption.stock <= 0) {
        return {
          summary: `${product.name} 的 ${size} 码暂时缺货，可关注补货或选择其他尺码。`,
          productIds: [product.id],
        };
      }
      const requestedColor =
        (typeof args.color === "string" ? args.color : undefined) ??
        ctx.intent.slots.colors[0];
      const color =
        product.colors.find((c) => c.name === requestedColor)?.name ?? product.colors[0].name;
      const cart = await getCart(ctx.sessionId);
      const updated = addLine(cart, {
        productId: product.id,
        size,
        color,
        qty: typeof args.qty === "number" ? Math.min(9, args.qty) : 1,
      });
      await saveCart(updated);
      ctx.cart = priceCart(updated);
      const action: AgentAction = {
        type: "added_to_cart",
        productId: product.id,
        name: product.name,
        size,
        color,
      };
      ctx.actions.push(action);
      return {
        summary: `已加入购物袋：${product.name} ${color} / ${size}，当前共 ${ctx.cart.itemCount} 件，合计 ¥${ctx.cart.summary.total}。`,
        productIds: [product.id],
        data: action,
      };
    }

    case "get_orders": {
      const orderNo = typeof args.orderNo === "string" ? args.orderNo : ctx.intent.slots.orderNo;
      if (orderNo) {
        const order = await getOrderByNo(orderNo);
        ctx.orders = order ? [order] : [];
        return {
          summary: order
            ? `订单 ${order.orderNo}：${order.status}，合计 ¥${order.total}${order.trackingNo ? `，运单 ${order.trackingNo}` : ""}。`
            : `未找到订单 ${orderNo}。`,
          data: order ?? null,
        };
      }
      const orders = await getOrdersForUser(ctx.userId);
      ctx.orders = orders;
      return {
        summary: orders.length
          ? `最近订单 ${orders[0].orderNo}：${orders[0].status}，${orders.length} 笔历史订单。`
          : "当前账户暂无订单。",
        productIds: orders[0]?.items.map((i) => i.productId) ?? [],
        data: orders.slice(0, 3),
      };
    }

    case "update_preference": {
      const patch: Partial<UserProfile> = {};
      const styles = Array.isArray(args.styles)
        ? (args.styles as string[])
        : ctx.intent.slots.styles;
      const colors = Array.isArray(args.colors)
        ? (args.colors as string[])
        : ctx.intent.slots.colors;
      const occasions = Array.isArray(args.occasions)
        ? (args.occasions as string[])
        : ctx.intent.slots.occasions;
      if (styles.length) patch.styleKeywords = styles;
      if (colors.length) patch.favoriteColors = colors;
      if (occasions.length) patch.occasions = occasions;
      if (typeof args.height === "number" && typeof args.weight === "number") {
        patch.height = args.height;
        patch.weight = args.weight;
      }
      if (args.sizes && typeof args.sizes === "object") {
        patch.sizes = args.sizes as UserProfile["sizes"];
      } else if (ctx.intent.slots.sizes.length) {
        patch.sizes = {
          ...ctx.profile.sizes,
          top: ctx.intent.slots.sizes[0],
        };
      }
      const merged = await saveProfileOverride(ctx.userId, patch);
      const tags = [
        ...(merged.styleKeywords ?? []),
        ...(merged.occasions ?? []),
        ...(merged.favoriteColors ?? []),
      ].slice(0, 4);
      const action: AgentAction = { type: "preference_updated", tags };
      ctx.actions.push(action);
      return {
        summary: `已写入偏好：${tags.join("、") || "已更新"}。`,
        data: action,
      };
    }

    default: {
      const exhaustive: never = name;
      throw new Error(`未实现的工具：${String(exhaustive)}`);
    }
  }
}
