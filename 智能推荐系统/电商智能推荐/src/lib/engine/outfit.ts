import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import { BEHAVIORS, DEMO_USER_ID } from "@/lib/data/community";
import type { BehaviorEvent, Product } from "@/lib/types";
import type { Outfit, OutfitSlot, ProfileView, RecoScene } from "@/lib/engine/types";
import { buildProfileView, productAffinity } from "@/lib/engine/profile";
import { getComplementScore, getItemFeature } from "@/lib/engine/features";
import { clamp, colorHarmony } from "@/lib/engine/text";

const SLOT_LABEL: Record<OutfitSlot, string> = {
  outer: "外套",
  top: "上装",
  bottom: "下装",
  dress: "连衣裙",
  shoes: "鞋履",
  bag: "包袋",
  accessory: "配饰",
};

const roleToSlot = (role: Product["role"]): OutfitSlot =>
  role === "outer"
    ? "outer"
    : role === "top"
      ? "top"
      : role === "bottom"
        ? "bottom"
        : role === "dress"
          ? "dress"
          : role === "shoes"
            ? "shoes"
            : role === "bag"
              ? "bag"
              : "accessory";

const scoreCandidate = (input: {
  product: Product;
  profile: ProfileView;
  anchor?: Product;
  occasion: string;
  coreColor?: string;
  budgetLeft: number;
  usedRoles: Set<string>;
}): number => {
  const { product, profile, anchor, occasion, coreColor, budgetLeft, usedRoles } = input;
  if (usedRoles.has(product.role) && product.role !== "accessory") return -1;
  if (product.price > budgetLeft) return -1;
  if (!product.sizes.some((s) => s.stock > 0)) return -1;
  const affinity = productAffinity(profile, product);
  const occasionFit = occasion ? (product.occasions.includes(occasion) ? 1 : 0.35) : 0.6;
  const complement = anchor ? getComplementScore(anchor.id, product.id) : 0.5;
  const color = coreColor ? colorHarmony(coreColor, product.colors[0].hex) : 0.7;
  const formality = anchor
    ? 1 - Math.abs(anchor.features.formality - product.features.formality) / 4
    : 0.7;
  const pop = getItemFeature(product.id)?.popularity ?? 0.5;
  const budgetRatio = product.price / Math.max(1, budgetLeft);
  const budgetFit = clamp(1 - budgetRatio) * 0.05;
  const overspendPenalty = Math.max(0, budgetRatio - 0.3) * 0.55;
  return clamp(
    affinity * 0.3 +
      occasionFit * 0.2 +
      complement * 0.2 +
      color * 0.12 +
      formality * 0.1 +
      pop * 0.05 +
      budgetFit -
      overspendPenalty,
  );
};

const pick = (
  role: Product["role"],
  ctx: {
    profile: ProfileView;
    anchor?: Product;
    occasion: string;
    coreColor?: string;
    budgetLeft: number;
    usedRoles: Set<string>;
    excludeIds: Set<string>;
    styleTags?: string[];
  },
): Product | undefined => {
  const options = PRODUCTS.filter((p) => p.role === role && !ctx.excludeIds.has(p.id)).filter(
    (p) =>
      !ctx.styleTags?.length || p.styleTags.some((tag) => ctx.styleTags!.includes(tag)),
  );
  const pool = options.length ? options : PRODUCTS.filter((p) => p.role === role);
  const scored = pool
    .map((product) => ({
      product,
      score: scoreCandidate({
        product,
        profile: ctx.profile,
        anchor: ctx.anchor,
        occasion: ctx.occasion,
        coreColor: ctx.coreColor,
        budgetLeft: ctx.budgetLeft,
        usedRoles: ctx.usedRoles,
      }),
    }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.product;
};

const reasonFor = (slot: OutfitSlot, product: Product, anchor?: Product, occasion?: string): string => {
  if (anchor && anchor.id !== product.id) {
    const score = getComplementScore(anchor.id, product.id);
    if (score > 0.6) {
      return `与「${anchor.name}」的${product.colors[0].name}色温、正式度匹配（${(score * 100).toFixed(0)}%）`;
    }
  }
  if (occasion && product.occasions.includes(occasion)) {
    return `${product.fit}，适合${occasion}场合，${product.materials[0].name}材质保持体感`;
  }
  return `${SLOT_LABEL[slot]}中的稳定选择：${product.styleTags[0] ?? "极简"}风格，${product.fit}`;
};

export function buildOutfit(input: {
  userId?: string;
  occasion?: string;
  budget?: number;
  seedProductId?: string;
  scene?: RecoScene;
  events?: BehaviorEvent[];
  titleHint?: string;
}): Outfit {
  const userId = input.userId ?? DEMO_USER_ID;
  const profile = buildProfileView(userId, input.events ?? BEHAVIORS);
  const occasion =
    input.occasion ??
    profile.affinities.occasions[0]?.tag ??
    "通勤";
  const seed = input.seedProductId ? PRODUCT_MAP[input.seedProductId] : undefined;
  const budget = input.budget ?? Math.round(profile.priceBand.max * 2.4);
  const usedRoles = new Set<string>();
  const excludeIds = new Set<string>();
  const items: Outfit["items"] = [];

  if (seed) {
    usedRoles.add(seed.role);
    excludeIds.add(seed.id);
  }

  const addItem = (slot: OutfitSlot, product?: Product) => {
    if (!product) return;
    if (items.some((item) => item.product.id === product.id)) return;
    items.push({
      slot,
      product,
      reason: reasonFor(slot, product, seed, occasion),
    });
    usedRoles.add(product.role);
    excludeIds.add(product.id);
  };

  let coreColor: string | undefined;

  if (seed && (seed.role === "dress" || seed.role === "top" || seed.role === "bottom")) {
    addItem(roleToSlot(seed.role), seed);
    coreColor = seed.colors[0].hex;
  } else if (seed) {
    addItem(roleToSlot(seed.role), seed);
    coreColor = seed.colors[0].hex;
  } else {
    const wantsDress = occasion === "约会" || occasion === "晚宴" || profile.behavior.purchases % 2 === 0;
    if (wantsDress) {
      const dress = pick("dress", {
        profile,
        occasion,
        budgetLeft: budget,
        usedRoles,
        excludeIds,
        styleTags: profile.affinities.styles.map((s) => s.tag),
      });
      addItem("dress", dress);
      coreColor = dress?.colors[0].hex;
    } else {
      const top = pick("top", {
        profile,
        occasion,
        budgetLeft: budget,
        usedRoles,
        excludeIds,
        styleTags: profile.affinities.styles.map((s) => s.tag),
      });
      addItem("top", top);
      coreColor = top?.colors[0].hex;
      const bottom = pick("bottom", {
        profile,
        occasion,
        coreColor,
        budgetLeft: budget - (top?.price ?? 0),
        usedRoles,
        excludeIds,
      });
      addItem("bottom", bottom);
    }
  }

  const spent = () => items.reduce((sum, item) => sum + item.product.price, 0);
  const needsBottom = !items.some((item) => item.slot === "dress" || item.slot === "bottom");
  const needsTop = !items.some((item) => item.slot === "dress" || item.slot === "top");

  if (needsTop) {
    const top = pick("top", {
      profile,
      occasion,
      coreColor,
      budgetLeft: budget - spent(),
      usedRoles,
      excludeIds,
    });
    addItem("top", top);
  }
  if (needsBottom) {
    const bottom = pick("bottom", {
      profile,
      occasion,
      coreColor,
      budgetLeft: budget - spent(),
      usedRoles,
      excludeIds,
    });
    addItem("bottom", bottom);
  }
  if (!items.some((item) => item.slot === "shoes")) {
    const shoes = pick("shoes", {
      profile,
      occasion,
      coreColor,
      budgetLeft: budget - spent(),
      usedRoles,
      excludeIds,
    });
    addItem("shoes", shoes);
  }
  if (!items.some((item) => item.slot === "outer")) {
    const outer = pick("outer", {
      profile,
      occasion,
      anchor: seed,
      coreColor,
      budgetLeft: budget - spent(),
      usedRoles,
      excludeIds,
    });
    addItem("outer", outer);
  }
  if (!items.some((item) => item.slot === "bag")) {
    const bag = pick("bag", {
      profile,
      occasion,
      coreColor,
      budgetLeft: budget - spent(),
      usedRoles,
      excludeIds,
    });
    addItem("bag", bag);
  }
  if (items.length < 6) {
    const accessory = pick("accessory", {
      profile,
      occasion,
      coreColor,
      budgetLeft: budget - spent(),
      usedRoles,
      excludeIds,
    });
    addItem("accessory", accessory);
  }

  const total = items.reduce((sum, item) => sum + item.product.price, 0);
  const formalityRange = items.map((i) => i.product.features.formality);
  const formalitySpread = Math.max(...formalityRange) - Math.min(...formalityRange);
  const colors = items.map((i) => i.product.colors[0].hex);
  const colorSpread =
    colors.slice(1).reduce((sum, c) => sum + (1 - colorHarmony(colors[0], c)), 0) /
    Math.max(1, colors.length - 1);

  const harmony = [
    formalitySpread <= 2 ? "正式度一致" : "正式度有层次",
    colorSpread < 0.2 ? "色彩同温" : "有克制的对比",
    items.some((i) => i.product.materials[0]?.name.includes("羊绒")) &&
    items.some((i) => i.product.materials[0]?.name.includes("皮"))
      ? "软硬材质平衡"
      : "材质统一",
    total <= budget ? "预算内" : "略超预算",
  ];

  const titleMap: Record<string, string> = {
    通勤: "城市通勤 · 层次叠穿",
    约会: "低饱和约会 · 柔光层叠",
    晚宴: "夜色晚宴 · 一件式焦点",
    周末: "周末松弛 · 轻结构",
    旅行: "旅行胶囊 · 可折叠",
    户外: "轻户外 · 功能叠穿",
    居家: "居家留白 · 触感优先",
  };

  const presentSlots = new Set(items.map((item) => item.slot));
  const noteParts = ["已按你的常穿尺码与色彩偏好配比"];
  if (presentSlots.has("outer") && presentSlots.has("shoes")) {
    noteParts.push("外套与鞋履的正式度已对齐");
  } else {
    if (!presentSlots.has("outer")) noteParts.push("当前预算下省略了外套，可在降温时追加一件轻量外层");
    if (!presentSlots.has("shoes")) noteParts.push("鞋履建议从你的常穿款中搭配，或追加预算补一双");
  }
  if (presentSlots.has("bag")) noteParts.push("包袋作为视觉锚点");
  noteParts.push("整套可直接加入购物袋，或只保留其中两件");
  const notes = `${noteParts.join("；")}。`;

  return {
    id: `outfit_${Date.now().toString(36)}`,
    title: input.titleHint ?? titleMap[occasion] ?? "今日造型提案",
    occasion,
    items,
    total,
    harmony,
    notes,
    scene: input.scene ?? "stylist",
  };
}

export function outfitForProduct(productId: string, userId = DEMO_USER_ID): Outfit {
  const product = PRODUCT_MAP[productId];
  if (!product) return buildOutfit({ userId });
  return buildOutfit({
    userId,
    seedProductId: productId,
    occasion: product.occasions[0],
    budget: Math.round(product.price * 4),
    titleHint: `围绕「${product.name}」的搭配`,
  });
}

export const outfitSlotLabel = (slot: OutfitSlot): string => SLOT_LABEL[slot];

export function outfitText(outfit: Outfit): string {
  return [
    `${outfit.title}（${outfit.occasion}）`,
    ...outfit.items.map(
      (item) => `· ${SLOT_LABEL[item.slot]}：${item.product.name} ¥${item.product.price} — ${item.reason}`,
    ),
    `合计 ¥${outfit.total}`,
    `搭配逻辑：${outfit.harmony.join(" / ")}`,
  ].join("\n");
}

export const outfitCoverage = () =>
  PRODUCTS.filter((p) => p.role === "dress").length + PRODUCTS.filter((p) => p.role === "top").length;
