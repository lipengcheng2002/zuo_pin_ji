import type {
  AgentLog,
  AgentProductCard,
  AgentToolName,
  AgentTraceSnapshot,
  AgentTurnInput,
  AgentTurnResult,
  ChatMessage,
  ToolCallRecord,
} from "@/lib/agent/types";
import type { BehaviorEvent, Order, Product } from "@/lib/types";
import type { IntentResult } from "@/lib/engine/intent";
import { INTENT_LABEL, understand } from "@/lib/engine/intent";
import type { Recommendation } from "@/lib/engine/types";
import { buildProfileView, profileSummary } from "@/lib/engine/profile";
import { productKnowledge } from "@/lib/engine/knowledge";
import { assignVariant, variantModelVersion } from "@/lib/engine/experiment";
import {
  appendAgentLog,
  appendMessage,
  getCart,
  getEventStream,
  getRecentMessages,
  getSettings,
  saveSessionSlots,
} from "@/lib/store/db";
import {
  blockedAnswer,
  checkGuardrails,
  detectInjection,
  maskPII,
  sanitizeUserInput,
  shieldAnswer,
} from "@/lib/agent/guardrails";
import { composeAnswer, groundingFor, type ComposedAnswer } from "@/lib/agent/compose";
import {
  TOOL_CATALOG,
  executeTool,
  type ToolContext,
} from "@/lib/agent/tools";
import { llmConfig, composeWithLlm, planWithLlm, estimateTokens } from "@/lib/agent/llm";
import { priceCart } from "@/lib/commerce/pricing";
import { PROMPT_VERSION } from "@/lib/agent/config";

const MAX_PRODUCT_CARDS = 6;

type PlanStep = { tool: AgentToolName; args: Record<string, unknown> };

const labelForTool = (tool: AgentToolName): string =>
  TOOL_CATALOG.find((t) => t.name === tool)?.label ?? tool;

const mergeSlots = (
  current: IntentResult,
  historyIntents: IntentResult[],
  lastCards: AgentProductCard[],
  message: string,
): IntentResult => {
  const slots = {
    ...current.slots,
    colors: [...current.slots.colors],
    sizes: [...current.slots.sizes],
    occasions: [...current.slots.occasions],
    styles: [...current.slots.styles],
    categories: [...current.slots.categories],
    productRefs: [...current.slots.productRefs],
  };
  historyIntents.forEach((intent) => {
    if (!slots.categories.length && intent.slots.categories.length) {
      slots.categories = [...intent.slots.categories];
    }
    if (!slots.colors.length && intent.slots.colors.length) {
      slots.colors = [...intent.slots.colors];
    }
    if (!slots.sizes.length && intent.slots.sizes.length) {
      slots.sizes = [...intent.slots.sizes];
    }
    if (!slots.occasions.length && intent.slots.occasions.length) {
      slots.occasions = [...intent.slots.occasions];
    }
    if (!slots.styles.length && intent.slots.styles.length) {
      slots.styles = [...intent.slots.styles];
    }
    if (!slots.budget && intent.slots.budget) slots.budget = intent.slots.budget;
  });

  if (!slots.productRefs.length && lastCards.length) {
    if (/(这件|这个|它|那件|这套|上面那件|第一款)/.test(message)) {
      slots.productRefs = [lastCards[0].id];
    }
  }

  if (/(便宜|低一点|预算少|再低)/.test(message)) {
    const base = slots.budget?.max ?? 1800;
    slots.budget = { min: 0, max: Math.max(400, Math.round(base * 0.78)) };
  } else if (/(贵一点|预算提高|更好一点|升级)/.test(message)) {
    const base = slots.budget?.max ?? 1800;
    slots.budget = { min: 0, max: Math.round(base * 1.35) };
  }

  return {
    ...current,
    slots,
    rationale: [
      ...current.rationale,
      historyIntents.length ? "已合并最近对话中的场景与偏好" : "",
      slots.productRefs.length ? `上下文商品指代：${slots.productRefs.join(", ")}` : "",
    ].filter(Boolean),
  };
};

const rulePlan = (intent: IntentResult, message: string): PlanStep[] => {
  switch (intent.intent) {
    case "greeting":
    case "smalltalk":
      return [];
    case "styling":
      return [
        {
          tool: "build_outfit",
          args: {
            occasion: intent.slots.occasions[0],
            budget: intent.slots.budget?.max,
            seedProductId: intent.slots.productRefs[0],
          },
        },
        { tool: "recommend", args: { limit: 4, excludeOutfit: true } },
      ];
    case "find_product":
      return [{ tool: "recommend", args: { limit: 6 } }];
    case "size_advice":
      return [
        { tool: "recommend", args: { limit: 3 } },
        { tool: "size_advisor", args: { productId: intent.slots.productRefs[0] } },
      ];
    case "compare": {
      const steps: PlanStep[] = [];
      if (intent.slots.productRefs.length < 2) {
        steps.push({ tool: "recommend", args: { limit: 2 } });
      }
      steps.push({ tool: "compare_products", args: { ids: intent.slots.productRefs } });
      return steps;
    }
    case "product_qa": {
      const steps: PlanStep[] = [];
      if (intent.slots.productRefs.length) {
        steps.push({ tool: "get_product", args: { productId: intent.slots.productRefs[0] } });
      }
      steps.push({ tool: "retrieve_knowledge", args: { query: message } });
      return steps;
    }
    case "policy":
      return [
        {
          tool: "retrieve_knowledge",
          args: { query: message, types: ["policy", "size", "brand"] },
        },
      ];
    case "order_status":
      return [
        { tool: "get_orders", args: { orderNo: intent.slots.orderNo ?? undefined } },
      ];
    case "cart": {
      if (/(加购|加入购物袋|放进|下单|买这个|要这件|来一件)/.test(message)) {
        return [
          {
            tool: "add_to_cart",
            args: {
              productId: intent.slots.productRefs[0],
              size: intent.slots.sizes[0],
              color: intent.slots.colors[0],
            },
          },
          { tool: "get_cart", args: {} },
        ];
      }
      return [{ tool: "get_cart", args: {} }];
    }
    case "profile_update":
      return [{ tool: "update_preference", args: {} }];
    default:
      return [{ tool: "recommend", args: { limit: 6 } }];
  }
};

const enforceRequiredTools = (steps: PlanStep[], intent: IntentResult): PlanStep[] => {
  const has = (tool: AgentToolName) => steps.some((s) => s.tool === tool);
  const next = [...steps];
  if (intent.intent === "styling" && !has("build_outfit")) {
    next.unshift({
      tool: "build_outfit",
      args: { occasion: intent.slots.occasions[0], budget: intent.slots.budget?.max },
    });
  }
  if (intent.intent === "size_advice" && !has("size_advisor")) {
    next.push({ tool: "size_advisor", args: {} });
  }
  if (intent.intent === "policy" && !has("retrieve_knowledge")) {
    next.push({ tool: "retrieve_knowledge", args: { query: "售后 配送 退换 尺码" } });
  }
  if (intent.intent === "order_status" && !has("get_orders")) {
    next.push({ tool: "get_orders", args: {} });
  }
  return next;
};

const isMutatingToolAllowed = (
  tool: AgentToolName,
  message: string,
  intent: IntentResult,
): boolean => {
  if (tool === "add_to_cart") {
    return /(加购|加入购物袋|放进|下单|买这个|要这件|来一件|帮我买)/.test(message);
  }
  if (tool === "update_preference") {
    return intent.intent === "profile_update" || /(记住|以后都|我的尺码是|更新偏好)/.test(message);
  }
  return true;
};

const sanitizeArgs = (args: Record<string, unknown>): Record<string, unknown> => {
  const clean: Record<string, unknown> = {};
  Object.entries(args).forEach(([key, value]) => {
    if (typeof value === "string") clean[key] = value.slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean") clean[key] = value;
    else if (Array.isArray(value)) {
      clean[key] = value
        .filter((v) => typeof v === "string" || typeof v === "number")
        .slice(0, 8)
        .map((v) => (typeof v === "string" ? v.slice(0, 120) : v));
    } else if (value && typeof value === "object") {
      clean[key] = value;
    }
  });
  return clean;
};

const cardFromRecommendation = (item: Recommendation): AgentProductCard => {
  const product = item.product;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameEn: product.nameEn,
    price: product.price,
    compareAt: product.compareAt,
    category: product.category,
    subcategory: product.subcategory,
    art: product.editorial.art,
    palette: product.editorial.palette,
    accent: product.editorial.accent,
    colorName: product.colors[0].name,
    colorHex: product.colors[0].hex,
    colors: product.colors.map((c) => c.name),
    sizes: product.sizes.map((s) => ({ label: s.label, stock: s.stock })),
    rating: product.rating,
    badge: product.badges[0] ?? null,
    reasonHeadline: item.reason.headline,
    reasonDetail: item.reason.detail,
    reasonConfidence: item.reason.confidence,
    evidence: item.reason.evidence,
    score: item.score,
  };
};

const cardFromProduct = (product: Product, headline: string, detail: string): AgentProductCard => {
  const knowledge = productKnowledge(product);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameEn: product.nameEn,
    price: product.price,
    compareAt: product.compareAt,
    category: product.category,
    subcategory: product.subcategory,
    art: product.editorial.art,
    palette: product.editorial.palette,
    accent: product.editorial.accent,
    colorName: product.colors[0].name,
    colorHex: product.colors[0].hex,
    colors: product.colors.map((c) => c.name),
    sizes: product.sizes.map((s) => ({ label: s.label, stock: s.stock })),
    rating: product.rating,
    badge: product.badges[0] ?? null,
    reasonHeadline: headline,
    reasonDetail: detail,
    reasonConfidence: 0.82,
    evidence: [
      {
        source: "商品特征",
        label: knowledge.facts["面料成分"],
        detail: `${product.fit}；评分 ${product.rating}。`,
        confidence: 0.9,
      },
    ],
    score: 0.8,
  };
};

const makeTrace = (input: {
  requestId: string;
  intent: IntentResult;
  plan: string[];
  tools: ToolCallRecord[];
  ctx: ToolContext;
  guardrails: AgentTraceSnapshot["guardrails"];
  mode: "llm" | "local";
  model: string;
  latencyMs: number;
  tokens: number;
  variant: "A" | "B";
}): AgentTraceSnapshot => ({
  requestId: input.requestId,
  intent: input.intent.intent,
  intentLabel: INTENT_LABEL[input.intent.intent],
  confidence: Number(input.intent.confidence.toFixed(2)),
  slots: input.intent.slots,
  plan: input.plan,
  tools: input.tools,
  recall: input.ctx.recallTrace,
  guardrails: input.guardrails,
  mode: input.mode,
  model: input.model,
  promptVersion: PROMPT_VERSION,
  latencyMs: Number(input.latencyMs.toFixed(1)),
  tokens: input.tokens,
  variant: input.variant,
  profileTags: input.ctx.profile.tags.slice(0, 8),
});

export async function runAgent(input: AgentTurnInput): Promise<AgentTurnResult> {
  const started = performance.now();
  const sessionId = input.sessionId;
  const userId = input.userId;
  const cleanMessage = sanitizeUserInput(input.message);
  const settings = await getSettings();
  const events: BehaviorEvent[] = await getEventStream();
  const profile = buildProfileView(userId, events);
  const history = (
    input.history?.length ? input.history : await getRecentMessages(sessionId, 10, userId)
  ).filter((m) => !(m.role === "user" && m.content === cleanMessage));
  const variant = assignVariant(sessionId, userId);
  const llm = llmConfig();
  const injection = detectInjection(cleanMessage);
  const requestId =
    input.requestId ?? `agt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  let intent = understand(cleanMessage);
  const historyIntents = history
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => understand(m.content));
  const lastCards =
    [...history].reverse().find((m) => m.role === "assistant" && m.products?.length)?.products ??
    [];
  intent = mergeSlots(intent, historyIntents, lastCards, cleanMessage);

  const ctx: ToolContext = {
    sessionId,
    userId,
    events,
    profile,
    intent,
    settings,
    message: cleanMessage,
    history,
    productRefs: intent.slots.productRefs,
    recommendations: [],
    recallTrace: null,
    searchResult: null,
    outfit: null,
    comparison: null,
    sizeAdvice: null,
    knowledge: [],
    orders: null,
    cart: null,
    actions: [],
    focusProduct: null,
    toolCalls: [],
  };

  const planLabels: string[] = [
    `意图理解：${INTENT_LABEL[intent.intent]}（置信度 ${(intent.confidence * 100).toFixed(0)}%）`,
    `槽位抽取：${intent.rationale.slice(1, 4).join("；") || "上下文补全"}`,
  ];

  let steps: PlanStep[] = [];
  let planner: "llm" | "rule" = "rule";
  let llmTokens = 0;

  if (!injection && intent.intent !== "greeting" && intent.intent !== "smalltalk") {
    const llmPlan = await planWithLlm({
      message: cleanMessage,
      profileSummary: profileSummary(profile),
      history: history.slice(-4).map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`),
    });
    if (llmPlan) {
      steps = llmPlan.steps;
      planner = "llm";
      llmTokens += llmPlan.tokens;
    } else {
      steps = rulePlan(intent, cleanMessage);
    }
    steps = enforceRequiredTools(steps, intent).slice(0, settings.maxToolsPerTurn);
    planLabels.push(
      `${planner === "llm" ? "LLM" : "规则"}规划器：${steps.map((s) => labelForTool(s.tool)).join(" → ") || "无需工具"}`,
    );
  } else if (injection) {
    planLabels.push("护栏：检测到越权指令，跳过工具调用");
  } else {
    planLabels.push("寒暄意图：无需工具，直接回复");
  }

  for (const step of steps) {
    if (ctx.toolCalls.length >= settings.maxToolsPerTurn) break;
    if (!isMutatingToolAllowed(step.tool, cleanMessage, intent)) {
      ctx.toolCalls.push({
        id: `tc_${ctx.toolCalls.length}_${Date.now().toString(36)}`,
        tool: step.tool,
        label: "安全拦截",
        args: step.args,
        status: "skipped",
        summary: "写入型工具缺少明确的用户指令，已跳过。",
        latencyMs: 0,
      });
      continue;
    }
    const toolStarted = performance.now();
    const args = sanitizeArgs(step.args);
    try {
      const outcome = await executeTool(step.tool, args, ctx);
      ctx.toolCalls.push({
        id: `tc_${ctx.toolCalls.length}_${Date.now().toString(36)}`,
        tool: step.tool,
        label: labelForTool(step.tool),
        args,
        status: "ok",
        summary: outcome.summary,
        latencyMs: Number((performance.now() - toolStarted).toFixed(1)),
        productIds: outcome.productIds,
      });
    } catch (error) {
      ctx.toolCalls.push({
        id: `tc_${ctx.toolCalls.length}_${Date.now().toString(36)}`,
        tool: step.tool,
        label: labelForTool(step.tool),
        args,
        status: "error",
        summary: (error as Error).message,
        latencyMs: Number((performance.now() - toolStarted).toFixed(1)),
      });
    }
  }

  if (ctx.recallTrace) {
    planLabels.push(`召回：${ctx.recallTrace.recall.map((r) => `${r.source} ${r.candidates}`).join(" / ")}；候选 ${ctx.recallTrace.candidateCount} 件，融合排序后保留 ${ctx.recommendations.length} 件`);
    planLabels.push(`排序公式：${ctx.recallTrace.rankingFormula}`);
  }
  if (ctx.knowledge.length) {
    planLabels.push(`RAG 依据：${ctx.knowledge.slice(0, 3).map((d) => d.title).join("；")}`);
  }

  const composed: ComposedAnswer = composeAnswer(ctx);
  let answer = composed.answer;
  let mode: "llm" | "local" = "local";
  let model = "zhiyan-local-planner-v2";

  if (llm.configured && !injection) {
    const polished = await composeWithLlm({
      baseAnswer: composed.answer,
      intentLabel: INTENT_LABEL[intent.intent],
      profileSummary: profileSummary(profile),
      grounding: groundingFor(ctx),
      products: ctx.recommendations
        .slice(0, 4)
        .map((r) => `${r.product.name} ¥${r.product.price}`)
        .join("；"),
      temperature: settings.llmTemperature,
    });
    if (polished && polished.text.length > 20) {
      answer = polished.text;
      mode = "llm";
      model = llm.model;
      llmTokens += polished.tokens;
    }
  }

  const guardrailProducts: Product[] = [
    ...ctx.recommendations.map((r) => r.product),
    ...(ctx.outfit?.items.map((i) => i.product) ?? []),
    ...(ctx.focusProduct ? [ctx.focusProduct] : []),
  ];
  let guardrails = checkGuardrails({
    message: cleanMessage,
    answer,
    intent,
    toolCalls: ctx.toolCalls,
    products: guardrailProducts,
    docs: ctx.knowledge,
    cart: ctx.cart,
    orders: ctx.orders as Order[] | null,
    outfitTotal: ctx.outfit?.total ?? null,
    settings,
    injectionSuspected: injection,
  });

  if (!guardrails.checks.find((c) => c.id === "price_integrity")?.passed && mode === "llm") {
    answer = composed.answer;
    mode = "local";
    model = "zhiyan-local-planner-v2";
    guardrails = checkGuardrails({
      message: cleanMessage,
      answer,
      intent,
      toolCalls: ctx.toolCalls,
      products: guardrailProducts,
      docs: ctx.knowledge,
      cart: ctx.cart,
      orders: ctx.orders as Order[] | null,
      outfitTotal: ctx.outfit?.total ?? null,
      settings,
      injectionSuspected: injection,
    });
  }

  if (injection || !guardrails.passed) {
    answer = blockedAnswer;
  }
  answer = shieldAnswer(answer, guardrails.disclaimers);

  const cards: AgentProductCard[] = ctx.recommendations
    .slice(0, MAX_PRODUCT_CARDS)
    .map(cardFromRecommendation);
  if (!cards.length && ctx.focusProduct) {
    const focus = ctx.focusProduct;
    cards.push(
      cardFromProduct(
        focus,
        `已核对「${focus.name}」档案`,
        `${focus.materials.map((m) => `${m.name} ${m.pct}%`).join("、")}，${focus.fit}；${focus.rating} 分，近 30 天售出 ${focus.sold30d} 件。`,
      ),
    );
  }
  if (!cards.length && ctx.searchResult?.products.length) {
    ctx.searchResult.products.slice(0, 4).forEach((product) => {
      cards.push(
        cardFromProduct(product, product.styleTags[0] ?? "相关单品", `${product.fit}，${product.occasions.slice(0, 2).join(" / ")}。`),
      );
    });
  }

  const latency = Number((performance.now() - started).toFixed(1));
  const trace = makeTrace({
    requestId,
    intent,
    plan: planLabels,
    tools: ctx.toolCalls,
    ctx,
    guardrails,
    mode,
    model,
    latencyMs: latency,
    tokens: llmTokens + estimateTokens(answer),
    variant,
  });

  const assistantMessage: ChatMessage = {
    id: `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    role: "assistant",
    content: answer,
    ts: new Date().toISOString(),
    products: cards,
    outfit: ctx.outfit,
    trace,
    suggestions: composed.suggestions.slice(0, 4),
    action: ctx.actions[0] ?? null,
    followUp: composed.followUp,
  };
  const userMessage: ChatMessage = {
    id: `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}u`,
    role: "user",
    content: cleanMessage,
    ts: new Date().toISOString(),
  };

  try {
    await appendMessage(sessionId, userId, userMessage);
    await appendMessage(sessionId, userId, assistantMessage);
    await saveSessionSlots(sessionId, userId, intent.slots as unknown as Record<string, unknown>);
    const log: AgentLog = {
      id: `log_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      sessionId,
      userId,
      userMessage: maskPII(cleanMessage),
      answerPreview: maskPII(answer.slice(0, 120)),
      intent: intent.intent,
      intentLabel: INTENT_LABEL[intent.intent],
      confidence: intent.confidence,
      mode,
      model,
      tools: ctx.toolCalls.map((t) => t.tool),
      toolCalls: ctx.toolCalls.length,
      guardrailsTriggered: guardrails.checks
        .filter((c) => !c.passed)
        .map((c) => c.label),
      latencyMs: latency,
      tokens: trace.tokens,
      variant,
      feedback: null,
      ts: new Date().toISOString(),
    };
    await appendAgentLog(log);
  } catch (error) {
    console.error("[agent] failed to persist turn", error);
  }

  return {
    message: assistantMessage,
    trace,
    recommendations: ctx.recommendations,
    profile,
    actions: ctx.actions,
  };
}

export const agentMeta = async () => {
  const settings = await getSettings();
  const llm = llmConfig();
  return {
    enabled: settings.agentEnabled,
    mode: llm.configured ? ("llm" as const) : ("local" as const),
    model: llm.configured ? llm.model : "zhiyan-local-planner-v2",
    provider: llm.configured ? llm.providerLabel : "ZHIYAN Local",
    planner: llm.configured && llm.plannerEnabled ? ("llm" as const) : ("rule" as const),
    promptVersion: PROMPT_VERSION,
    tools: TOOL_CATALOG,
    variantModel: variantModelVersion("B"),
    maxToolsPerTurn: settings.maxToolsPerTurn,
    minIntentConfidence: settings.minIntentConfidence,
  };
};

export async function getSessionCart(sessionId: string) {
  const cart = await getCart(sessionId);
  return priceCart(cart);
}
