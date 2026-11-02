import { describe, expect, it } from "vitest";
import { PRODUCT_MAP } from "@/lib/data/catalog";
import type { Order, OrderStatus } from "@/lib/types";
import {
  availableFor,
  committedStock,
  withAvailability,
} from "@/lib/commerce/inventory";

const order = (status: OrderStatus, qty: number, size = "M"): Order => ({
  id: `ord_${status}`,
  orderNo: `ZY-${status}`,
  userId: "u_linzhixia",
  items: [
    {
      productId: "p01",
      name: "雾凇双面羊绒大衣",
      size,
      color: "燕麦",
      qty,
      unitPrice: 4280,
      art: "coat",
    },
  ],
  subtotal: 4280 * qty,
  discount: 0,
  shipping: 0,
  total: 4280 * qty,
  status,
  createdAt: new Date().toISOString(),
  paidAt: new Date().toISOString(),
  address: {
    id: "a",
    name: "林知夏",
    phone: "13800000000",
    province: "上海市",
    city: "上海",
    district: "静安区",
    detail: "南京西路 1 号",
    isDefault: true,
  },
  paymentMethod: "支付宝",
  channel: "官网",
  pointsEarned: 0,
});

describe("inventory commitments", () => {
  const product = PRODUCT_MAP["p01"];

  it("counts only open or completed orders", () => {
    const committed = committedStock([
      order("待发货", 2),
      order("已发货", 1),
      order("已完成", 1),
      order("已取消", 5),
      order("已退货", 4),
    ]);
    expect(committed.get("p01")?.get("M")).toBe(4);
  });

  it("subtracts commitments from base stock", () => {
    const committed = committedStock([order("待发货", 3)]);
    expect(availableFor(product, "M", committed)).toBe(9);
    const display = withAvailability(product, committed);
    expect(display.sizes.find((size) => size.label === "M")?.stock).toBe(9);
    expect(display.sizes.find((size) => size.label === "XS")?.stock).toBe(3);
  });

  it("never returns negative availability", () => {
    const committed = committedStock([order("已完成", 99)]);
    expect(availableFor(product, "M", committed)).toBe(0);
  });
});
