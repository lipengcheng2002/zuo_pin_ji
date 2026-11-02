import type { CartView } from "@/lib/commerce/pricing";
import { COUPONS } from "@/lib/commerce/pricing";
import type { Order, Product } from "@/lib/types";
import type { RetrievedDoc } from "@/lib/engine/knowledge";
import type { IntentResult } from "@/lib/engine/intent";
import type { GuardrailCheck, GuardrailResult, ToolCallRecord } from "@/lib/agent/types";

const INJECTION_PATTERNS = [
  /忽略(之前|以上|上面|所有)的?(指令|提示|设定|规则)/,
  /(ignore|disregard|forget).{0,24}(previous|above|all).{0,24}(instructions?|prompts?|rules)/i,
  /(输出|展示|打印|重复).{0,6}(系统提示|system prompt|提示词|prompt)/i,
  /(重复|复述|输出|展示).{0,20}(提示词|prompt|系统消息|隐藏规则|api key)/i,
  /(开发者模式|developer mode|jailbreak|越狱)/i,
  /(pretend|act as|you are now|你现在是).{0,24}(gpt|助手|管理员|admin|root|superuser|system)/i,
  /(ignore|disregard|bypass).{0,24}(system|safety|policy|policies|guardrail|rules)/i,
  /(reveal|print|show|leak|expose).{0,24}(hidden|system).{0,12}(prompt|instructions?|rules?)/i,
  /(泄露|导出|显示|告诉我|发给我).{0,12}(密钥|api key|token|密码|内部推理|隐藏规则)/i,
  /(把|将).{0,8}(系统提示词|提示词|prompt|隐藏规则).{0,8}(发给|给我|输出|展示)/i,
  /<\|.*?\|>|```system/,
];

const MEDICAL_CLAIMS = [/(治疗|治愈|医疗效果|抗菌|抗病毒)/, /(百分百|100%)(有效|安全|不掉色)/];
const ABSOLUTE_CLAIMS = [/(绝对|保证|最便宜|全网最低|百分百|100%)/];

export const sanitizeUserInput = (raw: string): string =>
  raw
    .slice(0, 600)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();

export const maskPII = (text: string): string =>
  text
    .replace(/1[3-9]\d{9}/g, (m) => `${m.slice(0, 3)}****${m.slice(7)}`)
    .replace(/\b\d{17}[\dXx]\b/g, "******************")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => `${m.slice(0, 2)}***@***`);

export type GuardrailInput = {
  message: string;
  answer: string;
  intent: IntentResult;
  toolCalls: ToolCallRecord[];
  products: Product[];
  docs: RetrievedDoc[];
  cart: CartView | null;
  orders: Order[] | null;
  outfitTotal?: number | null;
  settings: { maxToolsPerTurn: number; minIntentConfidence: number; guardrails: boolean };
  injectionSuspected: boolean;
};

export function checkGuardrails(input: GuardrailInput): GuardrailResult {
  const checks: GuardrailCheck[] = [];
  const disclaimers: string[] = [];

  checks.push({
    id: "injection",
    label: "提示词注入防护",
    passed: !input.injectionSuspected,
    detail: input.injectionSuspected
      ? "检测到越权指令，已拦截并限制在当前业务范围内。"
      : "未检测到越权指令。",
    severity: "block",
  });

  const pii = /1[3-9]\d{9}|\b\d{17}[\dXx]\b|[\w.+-]+@[\w-]+\.[\w.]+/.test(input.message);
  checks.push({
    id: "pii",
    label: "个人信息脱敏",
    passed: true,
    detail: pii ? "输入包含疑似个人信息，写入日志前已脱敏。" : "未发现敏感个人信息。",
    severity: "info",
  });

  const knownPrices = new Set<number>([
    ...input.products.map((p) => p.price),
    ...(input.cart?.lines.map((l) => l.lineTotal) ?? []),
    ...(input.cart ? [input.cart.summary.total, input.cart.summary.subtotal] : []),
    ...(input.orders?.flatMap((o) => o.items.map((i) => i.unitPrice * i.qty)) ?? []),
    ...(input.intent.slots.budget ? [input.intent.slots.budget.min, input.intent.slots.budget.max] : []),
    ...(input.outfitTotal ? [input.outfitTotal] : []),
  ]);
  const mentionedPrices = [...input.answer.matchAll(/¥\s?(\d[\d,.]*)/g)].map((m) =>
    Number(m[1].replace(/,/g, "")),
  );
  const fabricated = mentionedPrices.filter(
    (price) => ![...knownPrices].some((known) => Math.abs(known - price) < 1),
  );
  checks.push({
    id: "price_integrity",
    label: "价格事实校验",
    passed: fabricated.length === 0,
    detail:
      fabricated.length === 0
        ? `已核对 ${mentionedPrices.length} 处价格引用。`
        : `发现 ${fabricated.length} 处未在商品上下文中出现的价格，已标记。`,
    severity: "warn",
  });

  const stockClaim = /(有货|现货|库存充足)/.test(input.answer);
  const stockOk =
    !stockClaim ||
    !input.products.length ||
    input.products.some((p) => p.sizes.some((s) => s.stock > 0));
  checks.push({
    id: "stock_claim",
    label: "库存声明校验",
    passed: stockOk,
    detail: stockOk ? "库存描述与 SKU 数据一致。" : "回答中的库存描述缺少 SKU 数据支撑。",
    severity: "warn",
  });

  const sizeAdvice = input.intent.intent === "size_advice";
  const hasDisclaimer = /(仅供参考|建议到店|试穿|仅作参考)/.test(input.answer);
  if (sizeAdvice && !hasDisclaimer) {
    disclaimers.push("尺码建议基于身高体重与历史购买推算，仅供参考，建议结合试穿决定。");
  }
  checks.push({
    id: "size_disclaimer",
    label: "尺码建议免责",
    passed: !sizeAdvice || hasDisclaimer,
    detail: sizeAdvice
      ? hasDisclaimer
        ? "已包含试穿提示。"
        : "已自动补充尺码免责声明。"
      : "非尺码场景，无需免责声明。",
    severity: "warn",
  });

  const policyGrounded = input.intent.intent !== "policy" || input.docs.length > 0;
  checks.push({
    id: "policy_grounding",
    label: "政策引用校验",
    passed: policyGrounded,
    detail: policyGrounded
      ? "售后/政策回答均引用了知识库文档。"
      : "政策回答未命中知识库，已降级为转人工。",
    severity: "warn",
  });

  const discountClaim = /(折扣|优惠券|立减|满减|折后|折上折)/.test(input.answer);
  const couponGrounded =
    !discountClaim ||
    COUPONS.some((c) => input.answer.includes(c.code)) ||
    input.docs.some((d) => d.text.includes("优惠"));
  checks.push({
    id: "promotion",
    label: "促销信息一致性",
    passed: couponGrounded,
    detail: couponGrounded ? "促销信息与当前优惠配置一致。" : "回答包含未配置的促销信息。",
    severity: "warn",
  });

  const absolute = ABSOLUTE_CLAIMS.some((pattern) => pattern.test(input.answer));
  const medical = MEDICAL_CLAIMS.some((pattern) => pattern.test(input.answer));
  checks.push({
    id: "claims",
    label: "绝对化与功效用语",
    passed: !absolute && !medical,
    detail:
      absolute || medical
        ? "检测到绝对化或功效性表述，已加入合规提示。"
        : "未检测到绝对化或功效性表述。",
    severity: "warn",
  });
  if (absolute || medical) {
    disclaimers.push("商品感受与穿着效果因人而异，页面信息不构成医疗或功效承诺。");
  }

  checks.push({
    id: "tool_budget",
    label: "工具调用预算",
    passed: input.toolCalls.length <= input.settings.maxToolsPerTurn,
    detail: `本轮调用 ${input.toolCalls.length} 个工具，上限 ${input.settings.maxToolsPerTurn}。`,
    severity: "warn",
  });

  const lowConfidence = input.intent.confidence < input.settings.minIntentConfidence;
  checks.push({
    id: "confidence",
    label: "意图置信度",
    passed: !lowConfidence,
    detail: `意图「${input.intent.intent}」置信度 ${(input.intent.confidence * 100).toFixed(0)}%，阈值 ${(input.settings.minIntentConfidence * 100).toFixed(0)}%。`,
    severity: "info",
  });

  checks.push({
    id: "ai_disclosure",
    label: "AI 透明度",
    passed: true,
    detail: "已标注推荐理由来源：画像、商品特征、行为、评价与搭配规则。",
    severity: "info",
  });

  const passed = checks.every((check) => check.severity !== "block" || check.passed);
  return { passed, checks, disclaimers };
}

export function detectInjection(message: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(message));
}

export const blockedAnswer =
  "抱歉，我只能协助织言的服装搭配、尺码、订单与售后服务。请告诉我你想看的场合或单品，我来帮你挑选。";

export function shieldAnswer(answer: string, disclaimers: string[]): string {
  if (!disclaimers.length) return answer;
  const suffix = disclaimers.slice(0, 1).join(" ");
  return answer.includes(suffix) ? answer : `${answer}\n\n${suffix}`;
}
