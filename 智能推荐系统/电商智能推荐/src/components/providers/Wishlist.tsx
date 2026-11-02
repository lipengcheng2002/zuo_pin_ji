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
import { useToast } from "@/components/providers/Toast";

type WishlistContextValue = {
  items: string[];
  loading: boolean;
  saved: (productId: string) => boolean;
  toggle: (productId: string, name?: string) => Promise<void>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { push } = useToast();

  useEffect(() => {
    let active = true;
    fetch("/api/wishlist", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { items?: string[] } | null) => {
        if (active && data?.items) setItems(data.items);
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const saved = useCallback((productId: string) => items.includes(productId), [items]);

  const toggle = useCallback(
    async (productId: string, name?: string) => {
      const wasSaved = items.includes(productId);
      setItems((current) =>
        wasSaved ? current.filter((id) => id !== productId) : [...current, productId],
      );
      try {
        const response = await fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });
        if (!response.ok) throw new Error("请稍后重试");
        const data = (await response.json()) as { items: string[]; wishlisted: boolean };
        setItems(data.items);
        push(data.wishlisted ? "已加入心愿单" : "已移出心愿单", {
          detail: name,
          tone: data.wishlisted ? "success" : "default",
        });
      } catch (error) {
        setItems((current) =>
          wasSaved ? [...current, productId] : current.filter((id) => id !== productId),
        );
        push((error as Error).message, { tone: "error" });
      }
    },
    [items, push],
  );

  const value = useMemo(
    () => ({ items, loading, saved, toggle }),
    [items, loading, saved, toggle],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used inside WishlistProvider");
  return context;
}
