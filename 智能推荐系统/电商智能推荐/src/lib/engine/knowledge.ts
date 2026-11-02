import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import { REVIEWS } from "@/lib/data/reviews";
import type { Product } from "@/lib/types";
import { cosine, embed, overlapCount, tokenize } from "@/lib/engine/text";
import { SIZE_TABLE } from "@/lib/data/size-guide";

export type KnowledgeDoc = {
  id: string;
  type: "product" | "review" | "policy" | "size" | "brand";
  title: string;
  text: string;
  productId?: string;
  meta?: Record<string, string | number>;
  embedding: number[];
};

type ProductKnowledge = {
  facts: Record<string, string>;
  summary: string;
  sizeGuide: string;
  care: string;
};

const productKnowledgeCache = new Map<string, ProductKnowledge>();

export function productKnowledge(product: Product): ProductKnowledge {
  const cached = productKnowledgeCache.get(product.id);
  if (cached) return cached;
  const materials = product.materials
    .map((m) => `${m.name} ${m.pct}%`)
    .join("、");
  const facts: Record<string, string> = {
    品类: `${product.subcategory}（${product.category}）`,
    面料成分: materials,
    版型: product.fit,
    长度: product.length,
    厚度: product.fabricWeight,
    季节: product.season.join(" / "),
    风格: product.styleTags.join(" / "),
    适合场景: product.occasions.join(" / "),
    保暖指数: `${product.features.warmth}/5`,
    透气指数: `${product.features.breathability}/5`,
    弹性指数: `${product.features.stretch}/5`,
    正式度: `${product.features.formality}/5`,
    价格: `¥${product.price}`,
    尺码: product.sizes.map((s) => `${s.label}${s.stock > 0 ? "" : "(缺货)"}`).join(" / "),
    产地: product.origin,
    评分: `${product.rating}（${product.reviewCount} 条评价）`,
    近30天销量: `${product.sold30d} 件`,
  };
  const sizeRecommendation = suggestSize(product, "M", 165, 52);
  const knowledge: ProductKnowledge = {
    facts,
    summary: [
      product.name,
      `¥${product.price}`,
      `面料：${materials}`,
      `版型：${product.fit}`,
      `场景：${product.occasions.join("、")}`,
      product.description,
    ].join("；"),
    sizeGuide: `标准参考尺码 ${sizeRecommendation}，模特信息：${product.modelInfo}`,
    care: product.care,
  };
  productKnowledgeCache.set(product.id, knowledge);
  return knowledge;
}

export function suggestSize(
  product: Product,
  topSize: string,
  height: number,
  weight: number,
): string {
  if (product.role === "bag" || product.role === "accessory") return "均码";
  if (product.role === "shoes") {
    const base = 35 + Math.round((height - 155) / 5);
    const anchor = Math.max(35, Math.min(40, base));
    const available = product.sizes.find((s) => s.label === String(anchor) && s.stock > 0);
    if (available) return `${anchor}`;
    const fallback = product.sizes.find((s) => s.stock > 0);
    return fallback?.label ?? "37";
  }
  const bmi = weight / Math.pow(height / 100, 2);
  let estimate = topSize;
  if (bmi >= 26) estimate = "XL";
  else if (bmi >= 23) estimate = topSize === "XS" ? "S" : topSize === "S" ? "M" : "L";
  else if (bmi < 18) estimate = topSize === "L" ? "M" : "XS";
  const order = ["XS", "S", "M", "L", "XL"];
  const target = order.includes(estimate) ? estimate : "M";
  const inStock = product.sizes.find((s) => s.label === target && s.stock > 0);
  if (inStock) return target;
  const idx = order.indexOf(target);
  for (let d = 1; d < order.length; d += 1) {
    const upper = order[idx + d];
    const lower = order[idx - d];
    const found =
      product.sizes.find((s) => s.label === upper && s.stock > 0) ??
      product.sizes.find((s) => s.label === lower && s.stock > 0);
    if (found) return found.label;
  }
  return target;
}

const POLICY_DOCS: Array<Omit<KnowledgeDoc, "embedding">> = [
  {
    id: "policy_shipping",
    type: "policy",
    title: "配送与运费",
    text: "订单实付满 ¥599 免标准配送费，未满收取 ¥20。标准配送使用顺丰速运，通常 2–4 个工作日送达；新疆、西藏等偏远地区增加 2–3 天。工作日 16:00 前的订单当天发出，之后的订单次日发出。所有包裹提供全程物流追踪，发货后可在「我的订单」查看运单号。",
  },
  {
    id: "policy_return",
    type: "policy",
    title: "30 天退换政策",
    text: "签收后 30 天内，商品保持吊牌完整、未洗涤、不影响二次销售的情况下，可申请无理由退货或换货。首次换货运费由品牌承担，退货退款将在仓库验收后 1–3 个工作日原路退回。内衣、耳饰等贴身商品出于卫生原因不支持无理由退换；定制修改商品不支持退换。AI 造型师推荐的商品与常规商品适用同一退换政策。",
  },
  {
    id: "policy_size",
    type: "size",
    title: "尺码参考与建议",
    text: `上衣尺码参考（胸围/腰围/臀围，单位 cm）：${SIZE_TABLE.tops
      .map((s) => `${s.size} 胸 ${s.bust} 腰 ${s.waist} 臀 ${s.hip}`)
      .join("；")}。鞋履尺码参考（脚长 cm）：${SIZE_TABLE.shoes
      .map((s) => `${s.size} → ${s.foot}`)
      .join("；")}。AI 尺码建议基于你的身高、体重、常穿尺码与历史购买记录综合判断，仅作参考；若在两个尺码之间，阔腿裤与宽松针织建议选小一码，修身针织与外套建议按实际胸围选择。`,
  },
  {
    id: "policy_care",
    type: "policy",
    title: "面料养护指南",
    text: "羊绒与羊毛：30°C 以下冷水手洗或使用羊毛程序，专用洗涤剂，平铺阴干，切勿悬挂与拧干；每穿着 2–3 次休息一天，让纤维恢复。真丝与醋酸：冷水手洗，阴干，低温蒸汽熨烫，避免阳光直射与香水接触。皮革：避免雨水浸泡，定期使用同色皮革保养霜，存放时使用鞋撑或填充软纸。牛仔：翻面冷水洗涤，减少清洗频率以保留色泽。",
  },
  {
    id: "policy_member",
    type: "policy",
    title: "会员与积分",
    text: "会员分为银卡、白金、黑金三级。消费 1 元累计 1 积分，100 积分可抵 ¥10，积分在订单完成后 T+1 到账。白金会员享受生日双倍积分与优先客服；黑金会员额外享有每年两次免费改衣服务。积分有效期 24 个月，退货订单对应积分将扣回。",
  },
  {
    id: "policy_coupon",
    type: "policy",
    title: "优惠券使用规则",
    text: "新客首单可使用 NEW15 享 85 折（最高减 ¥300）；全场可使用 ZHIYAN10 享 9 折（满 ¥800 可用）；FREESHIP 可免除 ¥20 标准运费。优惠券不可叠加使用，每单限用一张；与限时特价商品同享时以较低价结算。优惠券不找零、不折现，退货后优惠券按原规则退回。",
  },
  {
    id: "policy_invoice",
    type: "policy",
    title: "发票与售后",
    text: "支持开具电子普通发票，订单完成后 24 小时内自动开具并发送至账户邮箱；如需增值税专用发票，请联系客服并提供开票资料。商品出现质量问题（非人为损坏）可在 90 天内申请免费维修或更换。客服工作时间每日 09:00–22:00，复杂问题承诺 24 小时内响应。",
  },
  {
    id: "policy_sustainability",
    type: "policy",
    title: "可持续与溯源",
    text: "织言的羊绒来自内蒙古可追溯牧场，所有羊毛供应商通过 RWS 认证。包装使用 FSC 认证纸张与可降解内袋。品牌提供旧衣回收计划：寄回任意品牌的可穿着衣物，可获得 ¥100 衣橱礼券，回收衣物将捐赠或进入再生纤维链路。",
  },
  {
    id: "policy_ai",
    type: "policy",
    title: "AI 推荐的透明度说明",
    text: "织言 AI 造型师基于你的显式偏好（风格、尺码、预算）与隐式行为（浏览、收藏、购买）生成推荐。每一件推荐商品都附带可解释的理由与依据来源，你可以随时在「账户 - 风格偏好」中修改或关闭个性化推荐。我们不会将你的个人数据出售给第三方，也不会使用敏感信息进行推荐。AI 的输出可能存在偏差，最终购买决策由你做出。",
  },
  {
    id: "brand_story",
    type: "brand",
    title: "关于织言",
    text: "织言 ZHIYAN 创立于 2019 年，是一个以面料与剪裁为核心的当代衣橱品牌。我们相信衣服的价值来自触感、比例与时间，而不是季节性的噪音。每一季只做有限的系列，与长期合作的小型工坊共同完成。织言 AI 造型师是我们的数字化延伸：用可解释的推荐，帮助每个人更快找到与自己相处的那一件。",
  },
];

let corpus: KnowledgeDoc[] | null = null;

const buildCorpus = (): KnowledgeDoc[] => {
  const docs: KnowledgeDoc[] = [];
  PRODUCTS.forEach((product) => {
    const knowledge = productKnowledge(product);
    docs.push({
      id: `kb_product_${product.id}`,
      type: "product",
      title: `${product.name} · ${product.nameEn}`,
      productId: product.id,
      text: [
        knowledge.summary,
        `版型：${product.fit}`,
        `风格：${product.styleTags.join("、")}`,
        `场景：${product.occasions.join("、")}`,
        `保暖 ${product.features.warmth}/5，透气 ${product.features.breathability}/5，弹性 ${product.features.stretch}/5，正式度 ${product.features.formality}/5。`,
        `尺码：${product.sizes.map((s) => `${s.label}${s.stock > 0 ? "有货" : "缺货"}`).join("、")}。`,
        `护理：${product.care}`,
        `产地：${product.origin}。`,
      ].join("\n"),
      embedding: embed(
        `${product.name} ${product.nameEn} ${product.category} ${product.subcategory} ${product.styleTags.join(" ")} ${product.materials.map((m) => m.name).join(" ")} ${product.description}`,
      ),
    });
  });
  REVIEWS.forEach((review) => {
    docs.push({
      id: `kb_review_${review.id}`,
      type: "review",
      title: `${review.title} · ${review.rating} 星`,
      productId: review.productId,
      text: `${review.body}（身高 ${review.height}cm / 体重 ${review.weight}kg，购买尺码 ${review.purchasedSize}，尺码感受：${review.fitFeedback}）`,
      meta: { rating: review.rating, author: review.author, fit: review.fitFeedback },
      embedding: embed(
        `${review.title} ${review.body} ${review.fitFeedback} ${PRODUCT_MAP[review.productId]?.name ?? ""}`,
      ),
    });
  });
  POLICY_DOCS.forEach((doc) => {
    docs.push({ ...doc, embedding: embed(`${doc.title} ${doc.text}`) });
  });
  return docs;
};

export const knowledgeCorpus = (): KnowledgeDoc[] => {
  if (!corpus) corpus = buildCorpus();
  return corpus;
};

const POLICY_ALIASES: Record<string, string[]> = {
  policy_shipping: ["配送", "运费", "包邮", "发货", "快递", "多久", "顺丰", "偏远"],
  policy_return: ["退货", "退款", "换货", "退换", "无理由", "吊牌", "到账", "三十天", "30天"],
  policy_size: ["尺码", "码数", "胸围", "腰围", "臀围", "脚长", "身高", "体重"],
  policy_care: ["洗", "养护", "保养", "起球", "缩水", "羊绒洗", "真丝", "存放"],
  policy_member: ["会员", "积分", "白金", "黑金", "银卡", "生日"],
  policy_coupon: ["优惠券", "折扣", "满减", "立减", "NEW15", "ZHIYAN10", "免运费"],
  policy_invoice: ["发票", "开票", "售后", "维修", "质量问题", "客服"],
  policy_sustainability: ["可持续", "回收", "溯源", "环保", "旧衣"],
  policy_ai: ["AI", "推荐", "隐私", "个性化", "数据", "画像", "透明度"],
  brand_story: ["品牌", "织言", "创立", "工坊", "故事"],
};

const aliasScore = (docId: string, query: string): number => {
  const aliases = POLICY_ALIASES[docId];
  if (!aliases) return 0;
  const hits = aliases.filter((alias) => query.toLowerCase().includes(alias.toLowerCase())).length;
  return hits > 0 ? 0.42 + Math.min(0.18, hits * 0.06) : 0;
};

export type RetrievedDoc = KnowledgeDoc & { score: number };

export function retrieveKnowledge(
  query: string,
  options: {
    productId?: string;
    types?: KnowledgeDoc["type"][];
    topK?: number;
    boostProduct?: boolean;
  } = {},
): RetrievedDoc[] {
  const { productId, types, topK = 4 } = options;
  const queryVec = embed(query);
  const queryTokens = tokenize(query);
  const docs = knowledgeCorpus().filter((doc) =>
    types ? types.includes(doc.type) : true,
  );
  const scored = docs.map((doc) => {
    const lexical = overlapCount(queryTokens, tokenize(doc.text)) / Math.max(6, queryTokens.length);
    let score = cosine(queryVec, doc.embedding) * 0.55 + lexical * 0.45;
    score += aliasScore(doc.id, query);
    if (productId && doc.productId === productId) score += 0.24;
    if (options.boostProduct && doc.type === "product") score += 0.06;
    if (doc.type === "policy") score += 0.04;
    return { ...doc, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function policyByTopic(topic: string): KnowledgeDoc | undefined {
  const results = retrieveKnowledge(topic, { types: ["policy", "size", "brand"], topK: 1 });
  return results[0];
}

export const ALL_POLICIES = POLICY_DOCS;

export const sizeTable = SIZE_TABLE;

export function productReviewSnippet(productId: string, fitFeedback?: "偏小" | "正常" | "偏大") {
  const reviews = REVIEWS.filter((r) => r.productId === productId);
  return (
    reviews.find((r) => fitFeedback && r.fitFeedback === fitFeedback && r.rating >= 4) ??
    reviews.find((r) => r.rating >= 4) ??
    reviews[0] ??
    null
  );
}
