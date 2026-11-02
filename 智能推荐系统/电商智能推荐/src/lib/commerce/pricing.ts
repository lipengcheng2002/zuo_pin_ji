import { PRODUCT_MAP } from "@/lib/data/catalog";
import type { Cart, Coupon, Product } from "@/lib/types";

export const COUPONS: Array<Coupon & { maxDiscount?: number }> = [
  {
    code: "NEW15",
    label: "新客首单 85 折",
    type: "percent",
    value: 15,
    minSpend: 0,
    maxDiscount: 300,
    description: "新客首单可用，最高减 ¥300，不可与其他优惠叠加。",
  },
  {
    code: "ZHIYAN10",
    label: "全场 9 折",
    type: "percent",
    value: 10,
    minSpend: 800,
    maxDiscount: 300,
    description: "满 ¥800 可用，最高减 ¥300。",
  },
  {
    code: "FREESHIP",
    label: "免运费",
    type: "shipping",
    value: 20,
    minSpend: 0,
    description: "免除标准配送费 ¥20。",
  },
];

export const FREE_SHIPPING_THRESHOLD = 599;
export const STANDARD_SHIPPING = 20;

export type PricedLine = {
  productId: string;
  product: Product;
  size: string;
  color: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  stock: number;
  valid: boolean;
  issue: string | null;
};

export type CartView = {
  sessionId: string;
  lines: PricedLine[];
  itemCount: number;
  summary: {
    subtotal: number;
    discount: number;
    shipping: number;
    total: number;
    savings: number;
    points: number;
    freeShippingRemaining: number;
    freeShippingUnlocked: boolean;
    itemCount: number;
    couponCode: string | null;
    couponLabel: string | null;
    couponError: string | null;
  };
};

const round = (value: number) => Math.round(value * 100) / 100;

export function findCoupon(code: string | null | undefined) {
  if (!code) return null;
  return COUPONS.find((c) => c.code.toUpperCase() === code.toUpperCase()) ?? null;
}

export function priceCart(cart: Cart, overrideCoupon?: string | null): CartView {
  const lines: PricedLine[] = cart.lines
    .map((line) => {
      const product = PRODUCT_MAP[line.productId];
      if (!product) return null;
      const sizeOption = product.sizes.find((s) => s.label === line.size);
      const stock = sizeOption?.stock ?? 0;
      const qty = Math.max(1, Math.min(line.qty, 9));
      const valid = stock > 0 && qty <= stock;
      return {
        productId: product.id,
        product,
        size: line.size,
        color: line.color,
        qty,
        unitPrice: product.price,
        lineTotal: product.price * qty,
        stock,
        valid,
        issue: stock === 0 ? "该尺码暂时缺货" : qty > stock ? `库存仅剩 ${stock} 件` : null,
      } satisfies PricedLine;
    })
    .filter((line): line is PricedLine => Boolean(line));

  const validLines = lines.filter((line) => line.valid);
  const subtotal = round(validLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const couponCode = overrideCoupon !== undefined ? overrideCoupon : cart.couponCode;
  const coupon = findCoupon(couponCode);
  let couponError: string | null = null;
  let discount = 0;
  let shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
  let label: string | null = null;

  if (coupon) {
    if (subtotal < coupon.minSpend) {
      couponError = `该优惠券需满 ¥${coupon.minSpend} 使用`;
    } else {
      label = coupon.label;
      if (coupon.type === "percent") {
        discount = round(Math.min((subtotal * coupon.value) / 100, coupon.maxDiscount ?? Infinity));
      } else if (coupon.type === "fixed") {
        discount = Math.min(coupon.value, subtotal);
      } else {
        shipping = 0;
        discount = 0;
      }
    }
  }

  const total = round(Math.max(0, subtotal - discount) + (subtotal > 0 ? shipping : 0));
  const freeShippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - (subtotal - discount));

  return {
    sessionId: cart.sessionId,
    lines,
    itemCount: validLines.reduce((sum, line) => sum + line.qty, 0),
    summary: {
      subtotal,
      discount,
      shipping: subtotal > 0 ? shipping : 0,
      total,
      savings:
        round(discount) +
        validLines.reduce(
          (sum, line) =>
            sum + (line.product.compareAt ? (line.product.compareAt - line.product.price) * line.qty : 0),
          0,
        ),
      points: Math.floor(total / 10),
      freeShippingRemaining,
      freeShippingUnlocked: subtotal - discount >= FREE_SHIPPING_THRESHOLD,
      itemCount: validLines.reduce((sum, line) => sum + line.qty, 0),
      couponCode: coupon?.code ?? null,
      couponLabel: label,
      couponError,
    },
  };
}

export const emptyCart = (sessionId: string): Cart => ({
  sessionId,
  userId: null,
  lines: [],
  couponCode: null,
  updatedAt: new Date().toISOString(),
});

export function addLine(
  cart: Cart,
  line: { productId: string; size: string; color: string; qty?: number },
): Cart {
  const product = PRODUCT_MAP[line.productId];
  if (!product) return cart;
  const existing = cart.lines.find(
    (l) => l.productId === line.productId && l.size === line.size && l.color === line.color,
  );
  if (existing) {
    const stock = product.sizes.find((s) => s.label === line.size)?.stock ?? 0;
    existing.qty = Math.min(9, stock, existing.qty + (line.qty ?? 1));
  } else {
    cart.lines.push({
      productId: line.productId,
      size: line.size,
      color: line.color,
      qty: line.qty ?? 1,
      addedAt: new Date().toISOString(),
    });
  }
  return { ...cart, updatedAt: new Date().toISOString() };
}

export function updateLineQty(cart: Cart, index: number, qty: number): Cart {
  const line = cart.lines[index];
  if (!line) return cart;
  const product = PRODUCT_MAP[line.productId];
  const stock = product?.sizes.find((s) => s.label === line.size)?.stock ?? 0;
  if (qty <= 0) {
    cart.lines.splice(index, 1);
  } else {
    line.qty = Math.min(9, stock, qty);
  }
  return { ...cart, updatedAt: new Date().toISOString() };
}

export function removeLine(cart: Cart, index: number): Cart {
  cart.lines.splice(index, 1);
  return { ...cart, updatedAt: new Date().toISOString() };
}
