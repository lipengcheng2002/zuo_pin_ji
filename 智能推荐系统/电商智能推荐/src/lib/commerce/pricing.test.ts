import { describe, expect, it } from "vitest";
import type { Cart } from "@/lib/types";
import { addLine, priceCart, updateLineQty, findCoupon } from "@/lib/commerce/pricing";
import { PRODUCT_MAP } from "@/lib/data/catalog";

const baseCart = (): Cart => ({
  sessionId: "test-session",
  userId: "u_linzhixia",
  lines: [],
  couponCode: null,
  updatedAt: new Date().toISOString(),
});

describe("cart pricing", () => {
  it("applies percentage coupons with a cap and free shipping", () => {
    const cart = addLine(baseCart(), {
      productId: "p01",
      size: "S",
      color: "燕麦",
      qty: 1,
    });
    const view = priceCart({ ...cart, couponCode: "NEW15" });
    expect(view.lines).toHaveLength(1);
    expect(view.summary.subtotal).toBe(4280);
    expect(view.summary.discount).toBe(300); // capped at ¥300
    expect(view.summary.shipping).toBe(0);
    expect(view.summary.total).toBe(3980);
    expect(view.summary.points).toBe(398);
    expect(view.summary.freeShippingUnlocked).toBe(true);
  });

  it("reports a coupon minimum-spend error", () => {
    const cart = addLine(baseCart(), {
      productId: "p32",
      size: "M",
      color: "烟灰",
      qty: 1,
    });
    const view = priceCart({ ...cart, couponCode: "ZHIYAN10" });
    expect(view.summary.couponError).toContain("满");
    expect(view.summary.discount).toBe(0);
    expect(view.summary.shipping).toBe(20);
    expect(view.summary.total).toBe(500);
  });

  it("merges duplicate lines and caps at stock", () => {
    let cart = addLine(baseCart(), { productId: "p09", size: "M", color: "雾白", qty: 2 });
    cart = addLine(cart, { productId: "p09", size: "M", color: "雾白", qty: 2 });
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].qty).toBe(4);

    const product = PRODUCT_MAP["p09"];
    const stock = product.sizes.find((size) => size.label === "M")?.stock ?? 0;
    cart = updateLineQty(cart, 0, 99);
    expect(cart.lines[0].qty).toBe(Math.min(9, stock));
  });

  it("marks over-stock lines as invalid", () => {
    const cart = addLine(baseCart(), {
      productId: "p13",
      size: "L",
      color: "酒红",
      qty: 9,
    });
    const view = priceCart(cart);
    expect(view.lines[0].valid).toBe(false);
    expect(view.lines[0].issue).toContain("库存");
    expect(view.summary.subtotal).toBe(0);
  });

  it("resolves coupons case-insensitively", () => {
    expect(findCoupon("new15")?.code).toBe("NEW15");
    expect(findCoupon("nope")).toBeNull();
  });
});
