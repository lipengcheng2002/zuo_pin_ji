import type {
  Address,
  BehaviorEvent,
  BehaviorType,
  Order,
  OrderItem,
  Product,
  StyleArchetype,
  UserProfile,
} from "@/lib/types";
import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";

/* Deterministic PRNG so the seeded demo is identical across deployments. */
export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261029);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

const ARCHETYPES: Array<{
  key: StyleArchetype;
  styles: string[];
  colors: string[];
  occasions: string[];
  budget: [number, number];
}> = [
  {
    key: "静奢极简",
    styles: ["静奢", "极简", "都市"],
    colors: ["燕麦", "炭灰", "雾白", "墨黑"],
    occasions: ["通勤", "晚宴", "周末"],
    budget: [1500, 4200],
  },
  {
    key: "都市通勤",
    styles: ["都市", "极简", "中性"],
    colors: ["墨黑", "炭灰", "驼色", "雾蓝"],
    occasions: ["通勤", "旅行", "周末"],
    budget: [900, 2600],
  },
  {
    key: "法式松弛",
    styles: ["法式", "浪漫", "复古"],
    colors: ["雾白", "酒红", "陶土", "砂金"],
    occasions: ["约会", "周末", "旅行"],
    budget: [800, 2200],
  },
  {
    key: "复古学院",
    styles: ["复古", "学院", "中性"],
    colors: ["驼色", "墨黑", "苔绿", "靛青"],
    occasions: ["周末", "通勤", "旅行"],
    budget: [600, 1800],
  },
  {
    key: "新中式",
    styles: ["新中式", "静奢", "极简"],
    colors: ["墨黑", "雾白", "陶土", "苔绿"],
    occasions: ["晚宴", "约会", "通勤"],
    budget: [1200, 3200],
  },
  {
    key: "机能户外",
    styles: ["机能", "中性", "都市"],
    colors: ["墨黑", "松针", "雾蓝", "烟灰"],
    occasions: ["户外", "旅行", "周末"],
    budget: [600, 1600],
  },
  {
    key: "浪漫柔美",
    styles: ["浪漫", "法式", "复古"],
    colors: ["雾白", "酒红", "砂金", "陶土"],
    occasions: ["约会", "晚宴", "周末"],
    budget: [800, 2400],
  },
];

const SURNAMES = [
  "林", "陈", "苏", "何", "沈", "周", "顾", "许", "江", "温",
  "叶", "程", "唐", "宋", "白", "黎", "夏", "方", "谢", "孟",
];
const GIVEN = [
  "知夏", "默", "岩", "一苇", "知微", "予安", "清和", "听澜", "晚", "以宁",
  "南", "野", "未央", "照", "青禾", "叙", "白露", "亭", "照野", "逢",
];

const CITIES = ["上海", "北京", "杭州", "深圳", "成都", "南京", "广州", "苏州"];
const FIT_PREFS = ["修身", "标准", "宽松", "直身"];

const sizeFor = (height: number, weight: number): string => {
  const bmi = weight / Math.pow(height / 100, 2);
  if (bmi < 17.5) return "XS";
  if (bmi < 20) return "S";
  if (bmi < 23.5) return "M";
  if (bmi < 27) return "L";
  return "XL";
};

const priceInBudget = (price: number, budget: { min: number; max: number }) =>
  price >= budget.min * 0.45 && price <= budget.max * 1.25;

const productsFor = (user: UserProfile): Product[] => {
  const scored = PRODUCTS.map((product) => {
    let score = 1;
    product.styleTags.forEach((tag) => {
      if (user.styleKeywords.includes(tag)) score += 2.4;
    });
    product.occasions.forEach((occasion) => {
      if (user.occasions.includes(occasion)) score += 1.1;
    });
    product.colors.forEach((color) => {
      if (user.favoriteColors.includes(color.name)) score += 1.6;
      if (user.avoidColors.includes(color.name)) score -= 3;
    });
    if (priceInBudget(product.price, user.budget)) score += 1.4;
    if (user.sizes.top === "M" && product.category === "knitwear") score += 0.3;
    return { product, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, between(18, 26))
    .map((s) => s.product);
};

const DEMO_USER: UserProfile = {
  id: "u_linzhixia",
  name: "林知夏",
  avatarInitials: "林",
  city: "上海",
  age: 28,
  gender: "女",
  height: 165,
  weight: 52,
  bodyType: "沙漏型",
  sizes: { top: "M", bottom: "M", shoes: "37" },
  archetype: "静奢极简",
  styleKeywords: ["静奢", "极简", "法式"],
  favoriteColors: ["燕麦", "炭灰", "雾白"],
  avoidColors: ["银灰"],
  occasions: ["通勤", "约会", "周末", "晚宴"],
  budget: { min: 800, max: 3200 },
  preferredFit: "直身",
  memberTier: "白金",
  points: 2860,
  joinedAt: "2024-03-18",
  tags: ["高价值", "复购客", "静奢偏好", "通勤场景", "羊绒敏感友好"],
  lifetimeValue: 12860,
  ordersCount: 7,
  lastActiveAt: new Date().toISOString(),
  isDemo: true,
};

const buildUsers = (): UserProfile[] => {
  const users: UserProfile[] = [DEMO_USER];
  for (let i = 0; i < 159; i += 1) {
    const archetype = ARCHETYPES[i % ARCHETYPES.length];
    const height = between(156, 178);
    const weight = between(45, 76);
    const budgetJitter = 0.85 + rnd() * 0.4;
    const budget = {
      min: Math.round((archetype.budget[0] * budgetJitter) / 10) * 10,
      max: Math.round((archetype.budget[1] * budgetJitter) / 10) * 10,
    };
    const favoriteColors = archetype.colors.slice(0, between(2, 4));
    users.push({
      id: `u_guest_${String(i + 1).padStart(3, "0")}`,
      name: `${SURNAMES[i % SURNAMES.length]}${GIVEN[(i * 7 + 3) % GIVEN.length]}`,
      avatarInitials: SURNAMES[i % SURNAMES.length],
      city: CITIES[i % CITIES.length],
      age: between(22, 42),
      gender: i % 11 === 0 ? "男" : i % 17 === 0 ? "不限" : "女",
      height,
      weight,
      bodyType: pick(["沙漏型", "梨形", "H 型", "苹果型"]),
      sizes: {
        top: sizeFor(height, weight),
        bottom: sizeFor(height, weight),
        shoes: String(between(35, 40)),
      },
      archetype: archetype.key,
      styleKeywords: archetype.styles,
      favoriteColors,
      avoidColors: rnd() > 0.75 ? [pick(archetype.colors)] : [],
      occasions: archetype.occasions,
      budget,
      preferredFit: pick(FIT_PREFS),
      memberTier: pick(["黑金", "白金", "银卡", "新客"]) as UserProfile["memberTier"],
      points: between(0, 8600),
      joinedAt: `202${between(3, 6)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`,
      tags: [],
      lifetimeValue: between(600, 28000),
      ordersCount: between(1, 18),
      lastActiveAt: new Date(Date.now() - between(0, 22) * 86400000).toISOString(),
    });
  }
  return users;
};

export const USERS: UserProfile[] = buildUsers();

export const USER_MAP: Record<string, UserProfile> = Object.fromEntries(
  USERS.map((u) => [u.id, u]),
);

export const DEMO_USER_ID = DEMO_USER.id;

const EVENT_WEIGHT: Record<BehaviorType, number> = {
  view: 1,
  click: 2,
  wishlist: 3.5,
  add_to_cart: 5,
  purchase: 8,
  search: 1.2,
  chat: 1.5,
};

const SEARCH_QUERIES = [
  "通勤 大衣",
  "羊绒 高领",
  "真丝衬衫",
  "周末 约会 裙",
  "阔腿裤 显高",
  "秋冬 通勤 套装",
  "礼物 围巾",
  "黑色 短靴",
];

const buildBehaviors = (): BehaviorEvent[] => {
  const events: BehaviorEvent[] = [];
  const now = Date.now();
  let seq = 0;
  const push = (
    userId: string,
    type: BehaviorType,
    productId: string | undefined,
    daysAgo: number,
    scene: string,
    sessionId: string,
    query?: string,
  ) => {
    const ts = new Date(now - daysAgo * 86400000 - (seq % 24) * 3600000).toISOString();
    events.push({
      id: `ev_${String(seq++).padStart(6, "0")}`,
      userId,
      type,
      productId,
      query,
      scene,
      ts,
      weight: EVENT_WEIGHT[type],
      sessionId,
    });
  };

  // Rich, intentional history for the demo persona.
  const demoSeed: Array<[BehaviorType, string | undefined, number, string]> = [
    ["view", "p01", 2, "home"],
    ["view", "p05", 2, "home"],
    ["click", "p05", 2, "home"],
    ["view", "p08", 3, "search"],
    ["search", undefined, 3, "search"],
    ["wishlist", "p03", 5, "pdp"],
    ["view", "p15", 6, "reco"],
    ["click", "p15", 6, "reco"],
    ["add_to_cart", "p15", 6, "pdp"],
    ["purchase", "p15", 6, "cart"],
    ["view", "p26", 8, "reco"],
    ["wishlist", "p26", 8, "pdp"],
    ["view", "p21", 12, "search"],
    ["click", "p21", 12, "search"],
    ["add_to_cart", "p21", 12, "pdp"],
    ["purchase", "p21", 12, "cart"],
    ["view", "p11", 16, "stylist"],
    ["click", "p11", 16, "stylist"],
    ["view", "p18", 20, "reco"],
    ["wishlist", "p18", 20, "pdp"],
    ["view", "p24", 27, "home"],
    ["click", "p24", 27, "home"],
    ["purchase", "p24", 27, "cart"],
    ["chat", undefined, 1, "stylist"],
    ["view", "p29", 1, "reco"],
    ["click", "p29", 1, "reco"],
    ["view", "p06", 1, "pdp"],
  ];
  demoSeed.forEach(([type, productId, daysAgo, scene], i) => {
    const sessionId = `s_demo_${Math.floor(i / 4)}`;
    push(
      DEMO_USER.id,
      type,
      productId,
      daysAgo,
      scene,
      sessionId,
      type === "search" ? "秋冬通勤大衣" : undefined,
    );
  });

  USERS.slice(1).forEach((user, index) => {
    const catalog = productsFor(user);
    const sessions = between(3, 6);
    for (let s = 0; s < sessions; s += 1) {
      const sessionId = `s_${user.id}_${s}`;
      const daysAgo = 1 + s * 3 + (index % 4) + between(0, 2);
      const scene = pick(["home", "search", "reco", "pdp", "stylist", "cart"]);
      if (scene === "search") {
        push(user.id, "search", undefined, daysAgo, scene, sessionId, pick(SEARCH_QUERIES));
      }
      const length = between(3, 6);
      for (let e = 0; e < length; e += 1) {
        const product = catalog[Math.floor(rnd() * Math.min(catalog.length, 8 + s * 3))];
        if (!product) continue;
        const roll = rnd();
        let type: BehaviorType = "view";
        if (roll > 0.94) type = "purchase";
        else if (roll > 0.78) type = "add_to_cart";
        else if (roll > 0.62) type = "wishlist";
        else if (roll > 0.42) type = "click";
        push(user.id, type, product.id, daysAgo, scene, sessionId);
      }
    }
  });

  return events.sort((a, b) => (a.ts < b.ts ? 1 : -1));
};

export const BEHAVIORS: BehaviorEvent[] = buildBehaviors();

const ADDRESSES = [
  "静安区南京西路 1266 号 8 栋 1201",
  "朝阳区建国路 88 号 SOHO 现代城 3 号楼 1806",
  "西湖区文三路 478 号华星时代广场 A 座 902",
  "南山区科苑南路 2666 号中国华润大厦 15 层",
  "锦江区红星路三段 1 号 IFS 国际金融中心 2 座 2804",
  "鼓楼区中山北路 1 号绿地紫峰大厦 19 层",
  "天河区珠江东路 6 号周大福金融中心 32 层",
  "工业园区苏州大道东 265 号圆融时代广场 12 层",
];

const addressFor = (user: UserProfile, index: number): Address => ({
  id: `addr_${user.id}_${index}`,
  name: user.name,
  phone: "138****" + String(1000 + (index * 137) % 9000),
  province: user.city === "北京" ? "北京市" : user.city === "上海" ? "上海市" : "浙江省",
  city: user.city,
  district: user.city === "上海" ? "静安区" : "中心城区",
  detail: ADDRESSES[index % ADDRESSES.length],
  isDefault: index === 0,
});

const toOrderItem = (product: Product, size: string, color: string): OrderItem => ({
  productId: product.id,
  name: product.name,
  size,
  color,
  qty: 1,
  unitPrice: product.price,
  art: product.editorial.art,
});

const buildOrders = (): Order[] => {
  const orders: Order[] = [];
  let seq = 1000;
  const makeOrder = (user: UserProfile, daysAgo: number, productIds: string[]) => {
    const items = productIds
      .map((id) => PRODUCT_MAP[id])
      .filter((p): p is Product => Boolean(p))
      .map((p) =>
        toOrderItem(
          p,
          p.sizes[Math.min(1, p.sizes.length - 1)].label,
          p.colors[0].name,
        ),
      );
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const discount = subtotal >= 2000 ? 200 : 0;
    const shipping = subtotal - discount >= 599 ? 0 : 20;
    const total = subtotal - discount + shipping;
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
    seq += 1;
    orders.push({
      id: `ord_${seq}`,
      orderNo: `ZY${new Date(createdAt).getFullYear()}${String(seq).padStart(6, "0")}`,
      userId: user.id,
      items,
      subtotal,
      discount,
      shipping,
      total,
      status: daysAgo > 5 ? "已完成" : daysAgo > 2 ? "已发货" : "待发货",
      createdAt,
      paidAt: createdAt,
      address: addressFor(user, seq % 4),
      paymentMethod: "支付宝",
      channel: pick(["官网", "AI 造型师", "小程序"]) as Order["channel"],
      trackingNo: daysAgo > 1 ? `SF${140000000 + seq * 97}` : undefined,
      pointsEarned: Math.round(total / 10),
    });
  };

  makeOrder(DEMO_USER, 6, ["p15", "p32"]);
  makeOrder(DEMO_USER, 12, ["p21"]);
  makeOrder(DEMO_USER, 27, ["p24"]);
  makeOrder(DEMO_USER, 46, ["p05", "p26"]);

  USERS.slice(1).forEach((user, index) => {
    if (index % 3 !== 0) return;
    const catalog = productsFor(user);
    const count = between(1, 3);
    const ids = Array.from(
      new Set(
        Array.from({ length: count }, () => catalog[Math.floor(rnd() * catalog.length)]?.id),
      ),
    ).filter(Boolean) as string[];
    makeOrder(user, between(1, 78), ids);
  });

  return orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
};

export const ORDERS: Order[] = buildOrders();

export const demoAddress = addressFor(DEMO_USER, 0);

export const avgOrderValue = (orders: Order[] = ORDERS) =>
  Math.round(orders.reduce((s, o) => s + o.total, 0) / Math.max(1, orders.length));
