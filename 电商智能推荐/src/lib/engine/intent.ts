import type { CategoryKey } from "@/lib/types";
import type { RecoConstraints } from "@/lib/engine/types";
import { PRODUCTS } from "@/lib/data/catalog";

export type IntentName =
  | "styling"
  | "find_product"
  | "size_advice"
  | "compare"
  | "product_qa"
  | "policy"
  | "order_status"
  | "cart"
  | "profile_update"
  | "greeting"
  | "smalltalk";

export type IntentSlots = {
  categories: CategoryKey[];
  colors: string[];
  sizes: string[];
  occasions: string[];
  styles: string[];
  budget: { min: number; max: number } | null;
  keywords: string[];
  productRefs: string[];
  warmth: "warm" | "light" | null;
  formality: "formal" | "casual" | null;
  gift: boolean;
  orderNo: string | null;
};

export type IntentResult = {
  intent: IntentName;
  confidence: number;
  slots: IntentSlots;
  normalized: string;
  rationale: string[];
  sentiment: "positive" | "neutral" | "negative";
};

const CATEGORY_LEXICON: Array<{ key: CategoryKey; terms: string[] }> = [
  { key: "skirts", terms: ["半裙", "百褶裙", "工装裙", "短裙", "伞裙", "铅笔裙"] },
  { key: "dresses", terms: ["连衣裙", "吊带裙", "茶歇裙", "长裙", "礼服", "裙装", "睡袍", "家居袍"] },
  { key: "outerwear", terms: ["外套", "大衣", "风衣", "夹克", "西装", "西服", "羽绒", "棉服", "外搭", "羊绒大衣"] },
  { key: "knitwear", terms: ["针织", "毛衣", "羊绒", "开衫", "打底", "高领", "毛衫", "针织衫"] },
  { key: "shirting", terms: ["衬衫", "衬衣", "府绸"] },
  { key: "trousers", terms: ["裤装", "裤子", "阔腿裤", "西裤", "牛仔裤", "束脚裤", "工装裤", "直筒裤"] },
  { key: "shoes", terms: ["鞋履", "鞋子", "短靴", "乐福鞋", "德比鞋", "高跟鞋", "平底鞋", "靴子"] },
  { key: "bags", terms: ["包袋", "托特包", "手袋", "肩背包", "通勤包", "小包"] },
  { key: "accessories", terms: ["围巾", "丝巾", "方巾", "耳环", "配饰", "首饰", "礼物"] },
];

const COLOR_LEXICON: Array<{ name: string; terms: string[] }> = [
  { name: "墨黑", terms: ["墨黑", "黑色", "黑", "纯黑", "深黑"] },
  { name: "雾白", terms: ["雾白", "白色", "白", "米白", "奶白", "本白"] },
  { name: "燕麦", terms: ["燕麦", "米色", "卡其", "奶茶色", "浅驼"] },
  { name: "炭灰", terms: ["炭灰", "深灰"] },
  { name: "烟灰", terms: ["烟灰", "浅灰", "灰色"] },
  { name: "驼色", terms: ["驼色", "棕色", "咖色", "焦糖"] },
  { name: "雾蓝", terms: ["雾蓝", "蓝色", "蓝", "浅蓝"] },
  { name: "酒红", terms: ["酒红", "红色", "红", "勃艮第"] },
  { name: "苔绿", terms: ["苔绿", "绿色", "绿", "橄榄绿"] },
  { name: "松针", terms: ["松针", "深绿", "墨绿"] },
  { name: "陶土", terms: ["陶土", "橘色", "橙色", "赭石"] },
  { name: "砂金", terms: ["砂金", "金色", "香槟"] },
  { name: "靛青", terms: ["靛青", "深蓝", "牛仔蓝", "藏青"] },
  { name: "银灰", terms: ["银灰", "银色"] },
];

const OCCASION_LEXICON: Array<{ tag: string; terms: string[] }> = [
  { tag: "通勤", terms: ["通勤", "上班", "办公室", "开会", "商务", "职场", "见客户"] },
  { tag: "约会", terms: ["约会", "相亲", "见人", "晚餐", "下午茶"] },
  { tag: "晚宴", terms: ["晚宴", "婚礼", "年会", "派对", "正式场合", "酒会", "典礼"] },
  { tag: "周末", terms: ["周末", "逛街", "咖啡", "日常", "休闲", "citywalk"] },
  { tag: "旅行", terms: ["旅行", "出差", "度假", "飞机", "打包"] },
  { tag: "户外", terms: ["户外", "露营", "徒步", "运动", "爬山", "骑行"] },
  { tag: "居家", terms: ["居家", "在家", "家居", "睡衣", "窝着"] },
];

const STYLE_LEXICON: Array<{ tag: string; terms: string[] }> = [
  { tag: "静奢", terms: ["静奢", "老钱", "高级感", "低调奢华", "质感"] },
  { tag: "极简", terms: ["极简", "简约", "基础款", "纯色", "性冷淡"] },
  { tag: "法式", terms: ["法式", "巴黎", "慵懒", "松弛感"] },
  { tag: "复古", terms: ["复古", "vintage", "老派"] },
  { tag: "新中式", terms: ["新中式", "国风", "东方", "中式"] },
  { tag: "机能", terms: ["机能", "山系", "gorpcore", "冲锋", "轻户外"] },
  { tag: "浪漫", terms: ["浪漫", "温柔", "甜美", "仙女", "氛围感"] },
  { tag: "学院", terms: ["学院", "preppy", "学生", "文艺"] },
  { tag: "中性", terms: ["中性", "无性别", "unisex", "男友风"] },
  { tag: "都市", terms: ["都市", "干练"] },
];

const STOPWORDS = new Set([
  "推荐", "有没有", "想要", "想买", "想看", "找", "一件", "一些", "适合", "适合我",
  "我", "的", "了", "吗", "呢", "吧", "呀", "请", "帮我", "给我", "可以", "什么",
  "怎么", "如何", "比较", "一下", "这个", "那个", "看看", "需要", "穿", "搭配",
  "建议", "点", "款",
]);

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

const cnToNumber = (input: string): number | null => {
  const clean = input.replace(/[^\u4e00-\u9fff0-9]/g, "");
  if (!clean) return null;
  if (/^\d+$/.test(clean)) return Number(clean);
  let total = 0;
  let section = 0;
  let number = 0;
  let lastUnit = 1;
  for (const char of clean) {
    if (CN_NUM[char]) {
      number = CN_NUM[char];
      continue;
    }
    const unit = char === "十" ? 10 : char === "百" ? 100 : char === "千" ? 1000 : char === "万" ? 10000 : 0;
    if (!unit) continue;
    lastUnit = unit;
    if (unit === 10000) {
      section += number;
      total += section * 10000;
      section = 0;
      number = 0;
    } else {
      section += (number || 1) * unit;
      number = 0;
    }
  }
  if (number) {
    // 一千五 / 两百五 shorthand: the trailing digit means the next unit down.
    section += lastUnit === 1000 ? number * 100 : lastUnit === 100 ? number * 10 : number;
  }
  const result = total + section;
  return result > 0 ? result : null;
};

const parseBudget = (text: string): IntentSlots["budget"] => {
  const range = text.match(/(\d{2,5})\s*[-~到至]\s*(\d{2,5})\s*(元|块)?/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const cnRange = text.match(/([一二两三四五六七八九十]+)\s*[-~到至]\s*([一二两三四五六七八九十]+)\s*(元|块)/);
  if (cnRange) {
    const min = cnToNumber(cnRange[1]);
    const max = cnToNumber(cnRange[2]);
    if (min && max) return { min, max };
  }
  const underCn = text.match(/([一二两三四五六七八九十百千]+)\s*(元|块)?\s*(以内|以下|内)/);
  if (underCn) {
    const n = cnToNumber(underCn[1]);
    if (n) return { min: 0, max: n };
  }
  const thousand = text.match(/(\d+|[一二两三四五六七八九十]+)\s*千\s*(元|块)?\s*(以内|以下|内)?/);
  if (thousand) {
    const group = thousand[1];
    let n = /^\d+$/.test(group) ? Number(group) * 1000 : cnToNumber(`${group}千`);
    const tail = text
      .slice((thousand.index ?? 0) + thousand[0].length)
      .match(/^([一二三四五六七八九])\s*(元|块)?/);
    if (n && tail) n += CN_NUM[tail[1]] * 100;
    if (n) return { min: 0, max: n };
  }
  const under = text.match(/(?:不超过|低于|预算|最多|控制在|价格?在)\s*(\d{2,5})\s*(元|块)?/);
  if (under) return { min: 0, max: Number(under[1]) };
  const suffix = text.match(/(\d{2,5})\s*(元|块)?\s*(以内|以下|内)/);
  if (suffix) return { min: 0, max: Number(suffix[1]) };
  const budget = text.match(/预算\s*(\d{2,5})/);
  if (budget) return { min: 0, max: Number(budget[1]) };
  return null;
};

const matchLexicon = (
  text: string,
  lexicon: Array<{ key?: CategoryKey; name?: string; tag?: string; terms: string[] }>,
): string[] => {
  const hits: string[] = [];
  lexicon.forEach((entry) => {
    if (entry.terms.some((term) => text.includes(term))) {
      hits.push((entry.key ?? entry.name ?? entry.tag)!);
    }
  });
  return [...new Set(hits)];
};

const detectIntent = (text: string): { intent: IntentName; signals: string[] } => {
  const signals: string[] = [];
  const has = (words: string[]) => words.some((word) => text.includes(word));

  if (has(["订单", "物流", "快递", "到哪", "发货了", "签收", "运单"])) {
    signals.push("订单/物流关键词");
    return { intent: "order_status", signals };
  }
  if (has(["退货", "换货", "退款", "运费", "包邮", "发票", "优惠券", "会员", "保修"])) {
    signals.push("售后政策关键词");
    return { intent: "policy", signals };
  }
  if (
    has([
      "加购",
      "加入购物袋",
      "下单",
      "买这个",
      "要这件",
      "加入购物车",
      "购物袋里",
      "购物车里",
      "购物袋有什么",
      "我的购物袋",
    ])
  ) {
    signals.push("购物动作关键词");
    return { intent: "cart", signals };
  }
  if (
    has([
      "尺码",
      "码数",
      "穿多大",
      "多少码",
      "选什么码",
      "穿什么码",
      "什么码",
      "哪个码",
      "身高",
      "体重",
      "多高",
      "多重",
      "偏大",
      "偏小",
      "合身",
      "尺码表",
    ]) ||
    /\d{2,3}\s*(cm|厘米)/i.test(text) ||
    /\d{2,3}\s*(kg|公斤)/i.test(text) ||
    /\b(xs|s|m|l|xl)\b.{0,8}(还是|或|哪个|选哪个|选什么|穿哪个)/i.test(text)
  ) {
    signals.push("尺码/身形关键词");
    return { intent: "size_advice", signals };
  }
  if (has(["对比", "区别", "哪个更好", "哪个好", "还是", "vs", "比较一下"])) {
    signals.push("对比关键词");
    return { intent: "compare", signals };
  }
  if (has(["面料", "成分", "材质", "洗", "保养", "起球", "保暖", "透气", "静电", "产地", "厚不厚", "会不会扎"])) {
    signals.push("商品属性关键词");
    return { intent: "product_qa", signals };
  }
  if (
    has([
      "搭配",
      "穿什么",
      "怎么穿",
      "整套",
      "造型",
      "look",
      "outfit",
      "一身",
      "配什么",
      "搭什么",
      "帮我搭",
      "给我搭",
      "穿搭",
    ]) ||
    /(一|两|三|四|五|几)套/.test(text)
  ) {
    signals.push("造型/搭配关键词");
    return { intent: "styling", signals };
  }
  if (has(["记住", "以后", "我的尺码是", "我平时", "我喜欢", "不要推荐"])) {
    signals.push("偏好更新关键词");
    return { intent: "profile_update", signals };
  }
  if (has(["你好", "在吗", "早上好", "晚上好", "hi", "hello", "嗨"])) {
    signals.push("问候语");
    return { intent: "greeting", signals };
  }
  if (has(["推荐", "有没有", "找", "想看", "适合", "有什么", "选", "帮我"])) {
    signals.push("找货/推荐关键词");
    return { intent: "find_product", signals };
  }
  if (has(["谢谢", "好看", "喜欢", "不错", "再见"])) {
    signals.push("寒暄关键词");
    return { intent: "smalltalk", signals };
  }
  return { intent: "find_product", signals: ["默认找货意图"] };
};

const PRODUCT_ALIAS_NOUNS = [
  "大衣",
  "风衣",
  "羊绒衫",
  "针织衫",
  "衬衫",
  "半裙",
  "连衣裙",
  "阔腿",
  "西装裤",
  "牛仔裤",
  "乐福鞋",
  "短靴",
  "托特包",
  "手袋",
  "开衫",
  "高领",
  "西装",
  "夹克",
  "羽绒服",
  "围巾",
];

const extractProductRefs = (text: string): string[] => {
  const refs = new Set<string>();
  PRODUCTS.forEach((product) => {
    if (text.includes(product.name)) refs.add(product.id);
    else if (text.includes(product.nameEn.toLowerCase())) refs.add(product.id);
    else if (product.slug && text.includes(product.slug)) refs.add(product.id);
    else {
      const head = product.name.slice(0, 2);
      const alias = PRODUCT_ALIAS_NOUNS.find(
        (noun) => product.name.includes(noun) && text.includes(noun),
      );
      if (head && text.includes(head) && alias) refs.add(product.id);
    }
  });
  return [...refs];
};

const extractSizes = (text: string): string[] => {
  const sizes = new Set<string>();
  const letter = text.match(/\b(xs|s|m|l|xl|xxl)\b\s*(码|号)?/i);
  if (letter) sizes.add(letter[1].toUpperCase());
  if (/均码/.test(text)) sizes.add("均码");
  const numeric = text.match(/(3[5-9]|4[0-4])\s*码/);
  if (numeric) sizes.add(numeric[1]);
  if (/m码/i.test(text)) sizes.add("M");
  return [...sizes];
};

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildKeywords = (text: string): string[] =>
  text
    .split(/[\s,，。;；!！?？、]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !/^(帮我|我想|想要|请问)/.test(t))
    .slice(0, 8);

export function understand(raw: string): IntentResult {
  const text = normalize(raw || "");
  const { intent, signals } = detectIntent(text);
  const categories = matchLexicon(text, CATEGORY_LEXICON).slice(0, 3) as CategoryKey[];
  const colors = matchLexicon(text, COLOR_LEXICON);
  const occasions = matchLexicon(text, OCCASION_LEXICON);
  const styles = matchLexicon(text, STYLE_LEXICON);
  const budget = parseBudget(text);
  const sizes = extractSizes(text);
  const productRefs = extractProductRefs(text);
  const warmth = /保暖|怕冷|冬天|降温|厚一点/.test(text)
    ? ("warm" as const)
    : /轻薄|透气|夏天|热|薄一点/.test(text)
      ? ("light" as const)
      : null;
  const formality = /正式|商务|会议|得体/.test(text)
    ? ("formal" as const)
    : /休闲|随意|舒服|日常/.test(text)
      ? ("casual" as const)
      : null;
  const gift = /礼物|送人|生日|送朋友|送礼/.test(text);
  const orderNo = text.match(/(zy\s?\d{6,12})/i)?.[1]?.replace(/\s/g, "").toUpperCase() ?? null;

  const rationale: string[] = [...signals];
  if (categories.length) rationale.push(`品类：${categories.join(" / ")}`);
  if (colors.length) rationale.push(`颜色：${colors.join(" / ")}`);
  if (occasions.length) rationale.push(`场景：${occasions.join(" / ")}`);
  if (styles.length) rationale.push(`风格：${styles.join(" / ")}`);
  if (sizes.length) rationale.push(`尺码：${sizes.join(" / ")}`);
  if (budget) rationale.push(`价格带：¥${budget.min}–${budget.max}`);
  if (warmth === "warm") rationale.push("偏好保暖");
  if (gift) rationale.push("送礼场景");
  if (productRefs.length)
    rationale.push(`商品指代：${productRefs.map((id) => PRODUCTS.find((p) => p.id === id)?.name).join("、")}`);

  let confidence = 0.58 + Math.min(0.3, rationale.length * 0.05);
  if (intent === "find_product" && (categories.length || colors.length)) confidence += 0.06;
  if (intent === "styling" && (occasions.length || styles.length)) confidence += 0.05;
  const sentiment = /不喜欢|太贵|不好|差|失望|退货/.test(text)
    ? "negative"
    : /喜欢|好看|谢谢|满意|不错/.test(text)
      ? "positive"
      : "neutral";

  const slots: IntentSlots = {
    categories,
    colors,
    sizes,
    occasions,
    styles,
    budget,
    keywords: buildKeywords(text),
    productRefs,
    warmth,
    formality,
    gift,
    orderNo,
  };

  return {
    intent,
    confidence: Math.min(0.98, confidence),
    slots,
    normalized: text,
    rationale,
    sentiment,
  };
}

export function slotsToConstraints(result: IntentResult): RecoConstraints {
  const { slots } = result;
  return {
    categories: slots.categories.length ? slots.categories : undefined,
    colors: slots.colors.length ? slots.colors : undefined,
    sizes: slots.sizes.length ? slots.sizes : undefined,
    occasions: slots.occasions.length ? slots.occasions : undefined,
    styleTags: slots.styles.length ? slots.styles : undefined,
    priceMin: slots.budget?.min,
    priceMax: slots.budget?.max,
    keywords: slots.keywords,
  };
}

export const INTENT_LABEL: Record<IntentName, string> = {
  styling: "造型搭配",
  find_product: "找货导购",
  size_advice: "尺码建议",
  compare: "商品对比",
  product_qa: "面料问答",
  policy: "服务政策",
  order_status: "订单查询",
  cart: "购物车操作",
  profile_update: "偏好记忆",
  greeting: "问候",
  smalltalk: "闲聊",
};
