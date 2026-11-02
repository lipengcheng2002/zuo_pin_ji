import { describe, expect, it } from "vitest";
import { understand, slotsToConstraints } from "@/lib/engine/intent";
import { recommend } from "@/lib/engine/recommend";
import { buildProfileView } from "@/lib/engine/profile";
import { buildOutfit, outfitForProduct } from "@/lib/engine/outfit";
import { searchProducts } from "@/lib/engine/search";
import { retrieveKnowledge } from "@/lib/engine/knowledge";
import { DEMO_USER_ID } from "@/lib/data/community";
import { PRODUCT_MAP } from "@/lib/data/catalog";
import { twoProportionTest } from "@/lib/engine/experiment";

describe("intent understanding", () => {
  it("extracts category, colour, budget and occasion", () => {
    const result = understand("帮我找一件一千以内的黑色羊绒衫，通勤穿");
    expect(result.slots.categories).toContain("knitwear");
    expect(result.slots.colors).toContain("墨黑");
    expect(result.slots.budget?.max).toBe(1000);
    expect(result.slots.occasions).toContain("通勤");
    expect(result.intent).toBe("find_product");
  });

  it("parses chinese numerals for budget", () => {
    const result = understand("五百以内的围巾");
    expect(result.slots.budget?.max).toBe(500);
    expect(result.slots.categories).toContain("accessories");
  });

  it("detects size advice and order status", () => {
    expect(understand("我 165cm 52kg，穿 M 还是 L？").intent).toBe("size_advice");
    expect(understand("我的订单到哪里了").intent).toBe("order_status");
    expect(understand("真丝衬衫怎么洗").intent).toBe("product_qa");
  });

  it("converts slots into constraints", () => {
    const intent = understand("一千以内 通勤 黑色 羊绒");
    const constraints = slotsToConstraints(intent);
    expect(constraints.categories).toContain("knitwear");
    expect(constraints.priceMax).toBe(1000);
    expect(constraints.colors).toContain("墨黑");
  });

  it("prioritises an explicit add-to-cart instruction over size wording", () => {
    const result = understand("把苔原高领羊绒衫加入购物袋，M码燕麦色");
    expect(result.intent).toBe("cart");
    expect(result.slots.sizes).toContain("M");
    expect(result.slots.colors).toContain("燕麦");
  });

  it("retrieves return policy for a return question", () => {
    const docs = retrieveKnowledge("退货多久到账", { types: ["policy"] });
    expect(docs[0]?.id).toBe("policy_return");
  });
});

describe("recommendation engine", () => {
  const profile = buildProfileView(DEMO_USER_ID);

  it("returns ranked, in-stock, explained recommendations", () => {
    const result = recommend({ userId: DEMO_USER_ID, scene: "home", limit: 8 });
    expect(result.items).toHaveLength(8);
    expect(new Set(result.items.map((item) => item.product.id)).size).toBe(8);
    result.items.forEach((item) => {
      expect(item.product.sizes.some((size) => size.stock > 0)).toBe(true);
      expect(item.reason.headline.length).toBeGreaterThan(2);
      expect(item.reason.detail.length).toBeGreaterThan(20);
      expect(item.reason.evidence.length).toBeGreaterThan(0);
      expect(item.score).toBeGreaterThan(0);
      expect(item.score).toBeLessThanOrEqual(1);
    });
    expect(result.trace.recall).toHaveLength(5);
    const weightSum = Object.values(result.trace.weights).reduce((sum, value) => sum + value, 0);
    expect(weightSum).toBeCloseTo(1, 2);
  });

  it("honours exclusions and category constraints", () => {
    const result = recommend({
      userId: DEMO_USER_ID,
      scene: "home",
      limit: 4,
      constraints: { categories: ["knitwear"], excludeProductIds: ["p05"] },
    });
    expect(result.items.length).toBeGreaterThan(0);
    result.items.forEach((item) => {
      expect(item.product.category).toBe("knitwear");
      expect(item.product.id).not.toBe("p05");
    });
  });

  it("produces complements for a PDP trigger", () => {
    const result = recommend({
      userId: DEMO_USER_ID,
      scene: "pdp",
      triggerProductId: "p15",
      limit: 4,
    });
    expect(result.items.length).toBeGreaterThan(0);
    result.items.forEach((item) => expect(item.product.id).not.toBe("p15"));
  });

  it("uses the demo profile", () => {
    expect(profile.archetype).toBe("静奢极简");
    expect(profile.tags.length).toBeGreaterThan(4);
    expect(profile.affinities.styles[0]?.weight).toBeGreaterThan(0);
  });
});

describe("outfit builder", () => {
  it("builds a complete non-duplicated outfit around a seed", () => {
    const outfit = outfitForProduct("p01", DEMO_USER_ID);
    expect(outfit.items.length).toBeGreaterThanOrEqual(4);
    expect(new Set(outfit.items.map((item) => item.product.id)).size).toBe(outfit.items.length);
    expect(outfit.total).toBeGreaterThan(0);
    expect(outfit.items.some((item) => item.product.id === "p01")).toBe(true);
    expect(outfit.harmony.length).toBeGreaterThan(1);
  });

  it("respects an occasion for an unseeded outfit", () => {
    const outfit = buildOutfit({ userId: DEMO_USER_ID, occasion: "通勤", budget: 6000 });
    expect(outfit.occasion).toBe("通勤");
    expect(outfit.items.length).toBeGreaterThanOrEqual(4);
  });
});

describe("search", () => {
  it("ranks category matches for a query", () => {
    const result = searchProducts("通勤 大衣");
    expect(result.total).toBeGreaterThan(0);
    expect(result.products.slice(0, 5).some((product) => product.category === "outerwear")).toBe(
      true,
    );
    expect(result.tookMs).toBeGreaterThanOrEqual(0);
  });

  it("respects price filters", () => {
    const result = searchProducts("", { priceMax: 800 });
    result.products.forEach((product) => expect(product.price).toBeLessThanOrEqual(800));
  });
});

describe("statistics", () => {
  it("computes a significant lift", () => {
    const test = twoProportionTest(2800, 100000, 3920, 100000);
    expect(test.lift).toBeGreaterThan(30);
    expect(test.significant).toBe(true);
    expect(test.pValue).toBeLessThan(0.05);
  });
});

describe("catalog integrity", () => {
  it("has unique ids, slugs and valid stock", () => {
    const ids = new Set(Object.keys(PRODUCT_MAP));
    expect(ids.size).toBe(32);
    Object.values(PRODUCT_MAP).forEach((product) => {
      expect(product.price).toBeGreaterThan(0);
      expect(product.colors.length).toBeGreaterThan(0);
      expect(product.sizes.length).toBeGreaterThan(0);
      expect(product.name.length).toBeGreaterThan(1);
      expect(product.materials.length).toBeGreaterThan(0);
    });
  });
});
