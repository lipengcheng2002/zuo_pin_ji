"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartView } from "@/lib/commerce/pricing";
import { useToast } from "@/components/providers/Toast";

type CartContextValue = {
  cart: CartView | null;
  loading: boolean;
  pending: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  add: (input: {
    productId: string;
    size: string;
    color: string;
    qty?: number;
    productName?: string;
  }) => Promise<boolean>;
  updateQty: (index: number, qty: number) => Promise<void>;
  remove: (index: number) => Promise<void>;
  applyCoupon: (code: string) => Promise<{ ok: boolean; message: string }>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const { push } = useToast();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/cart", { cache: "no-store" });
      if (!response.ok) throw new Error("cart fetch failed");
      const data = (await response.json()) as { cart: CartView };
      setCart(data.cart);
    } catch {
      // Keep the last known cart; the UI will fall back to an empty state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(
    async (body: Record<string, unknown>) => {
      setPending(true);
      try {
        const response = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { cart?: CartView; error?: string };
        if (!response.ok) throw new Error(data.error ?? "操作失败");
        if (data.cart) setCart(data.cart);
        return data;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const add = useCallback<CartContextValue["add"]>(
    async (input) => {
      try {
        const data = await mutate({
          action: "add",
          productId: input.productId,
          size: input.size,
          color: input.color,
          qty: input.qty ?? 1,
        });
        if (data.cart) {
          push("已加入购物袋", {
            tone: "success",
            detail: `${input.productName ?? "商品"} · ${input.color} / ${input.size}`,
          });
          setOpen(true);
        }
        return true;
      } catch (error) {
        push((error as Error).message || "加入购物袋失败", { tone: "error" });
        return false;
      }
    },
    [mutate, push],
  );

  const updateQty = useCallback(
    async (index: number, qty: number) => {
      try {
        await mutate({ action: "update", index, qty });
      } catch (error) {
        push((error as Error).message, { tone: "error" });
      }
    },
    [mutate, push],
  );

  const remove = useCallback(
    async (index: number) => {
      try {
        await mutate({ action: "remove", index });
        push("已从购物袋移除");
      } catch (error) {
        push((error as Error).message, { tone: "error" });
      }
    },
    [mutate, push],
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      try {
        const data = (await mutate({ action: "coupon", code })) as { cart?: CartView };
        const error = data.cart?.summary.couponError;
        if (error) {
          push(error, { tone: "error" });
          return { ok: false, message: error };
        }
        push("优惠券已应用", { tone: "success" });
        return { ok: true, message: "优惠券已应用" };
      } catch (error) {
        push((error as Error).message, { tone: "error" });
        return { ok: false, message: (error as Error).message };
      }
    },
    [mutate, push],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      loading,
      pending,
      open,
      setOpen,
      refresh,
      add,
      updateQty,
      remove,
      applyCoupon,
    }),
    [cart, loading, pending, open, refresh, add, updateQty, remove, applyCoupon],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
