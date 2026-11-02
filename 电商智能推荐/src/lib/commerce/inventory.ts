import { PRODUCTS, PRODUCT_MAP } from "@/lib/data/catalog";
import { getStore } from "@/lib/store/db";
import type { Order, Product } from "@/lib/types";

/** Units already promised to orders that have not been cancelled or returned. */
const COMMITTED_STATUSES = new Set(["待发货", "已发货", "已完成"]);

export type CommittedStock = Map<string, Map<string, number>>;

export function committedStock(orders: Order[]): CommittedStock {
  const committed: CommittedStock = new Map();
  for (const order of orders) {
    if (!COMMITTED_STATUSES.has(order.status)) continue;
    for (const item of order.items) {
      if (!committed.has(item.productId)) committed.set(item.productId, new Map());
      const sizes = committed.get(item.productId)!;
      sizes.set(item.size, (sizes.get(item.size) ?? 0) + item.qty);
    }
  }
  return committed;
}

export function availableFor(
  product: Product,
  size: string,
  committed: CommittedStock,
): number {
  const base = product.sizes.find((option) => option.label === size)?.stock ?? 0;
  const promised = committed.get(product.id)?.get(size) ?? 0;
  return Math.max(0, base - promised);
}

export function withAvailability(product: Product, committed: CommittedStock): Product {
  return {
    ...product,
    sizes: product.sizes.map((size) => ({
      ...size,
      stock: Math.max(0, size.stock - (committed.get(product.id)?.get(size.label) ?? 0)),
    })),
  };
}

export function availabilitySnapshot(committed: CommittedStock): Array<{
  product: Product;
  availableSizes: Array<{ label: string; stock: number; committed: number }>;
  totalAvailable: number;
  totalCommitted: number;
}> {
  return PRODUCTS.map((product) => {
    const availableSizes = product.sizes.map((size) => {
      const promised = committed.get(product.id)?.get(size.label) ?? 0;
      return {
        label: size.label,
        stock: Math.max(0, size.stock - promised),
        committed: promised,
      };
    });
    return {
      product,
      availableSizes,
      totalAvailable: availableSizes.reduce((sum, size) => sum + size.stock, 0),
      totalCommitted: availableSizes.reduce((sum, size) => sum + size.committed, 0),
    };
  });
}

export async function getCommittedStock(): Promise<CommittedStock> {
  const state = await getStore();
  return committedStock(state.orders);
}

export function baseStock(productId: string, size: string): number {
  return PRODUCT_MAP[productId]?.sizes.find((entry) => entry.label === size)?.stock ?? 0;
}
