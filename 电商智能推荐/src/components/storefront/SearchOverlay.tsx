"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { ProductArt } from "@/components/product/ProductArt";
import { Icon } from "@/components/ui/Icon";
import { useDialog } from "@/lib/hooks/useDialog";
import { money } from "@/lib/utils/format";

const RECENT = ["通勤大衣", "羊绒高领", "真丝衬衫", "约会连衣裙"];

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialog<HTMLDivElement>(open, onClose);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("search failed");
        const data = (await response.json()) as { products: Product[] };
        setResults(data.products.slice(0, 5));
        setSearched(true);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  const submit = () => {
    if (!query.trim()) return;
    onClose();
    router.push(`/shop?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="fixed inset-0 z-[90]">
      <button
        aria-label="关闭搜索"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="搜索商品"
        className="relative mx-auto mt-0 max-h-[100dvh] w-full overflow-y-auto border-b border-line bg-ivory px-5 pb-12 pt-6 shadow-2xl sm:px-10 lg:mt-20 lg:max-w-3xl lg:border lg:px-12"
      >
        <div className="flex items-center gap-4 border-b border-ink pb-4">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="搜索单品、面料、场景，或直接描述你要的造型"
            className="h-10 flex-1 bg-transparent text-[15px] tracking-wide placeholder:text-muted-light focus:outline-none"
            aria-label="搜索关键词"
          />
          <button
            onClick={onClose}
            className="p-2 text-muted transition hover:text-ink"
            aria-label="关闭"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {!query ? (
          <div className="pt-8">
            <p className="eyebrow">最近搜索 / Recent</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {RECENT.map((item) => (
                <button
                  key={item}
                  onClick={() => setQuery(item)}
                  className="chip hover:border-ink hover:bg-paper"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-10 border-t border-line pt-6">
              <p className="eyebrow">AI 搜索提示</p>
              <p className="mt-3 max-w-lg text-[13px] leading-7 text-muted">
                尝试输入「下周去上海出差，想要一件不显臃肿的保暖外套」或「165 穿 M 还是 L」，
                系统会识别场景、预算、尺码与颜色，而不只是匹配关键词。
              </p>
            </div>
          </div>
        ) : (
          <div className="pt-6">
            <div className="flex items-center justify-between">
              <p className="eyebrow">{loading ? "正在检索…" : `匹配结果 ${results.length}`}</p>
              {searched ? (
                <button onClick={submit} className="text-[11px] tracking-wide text-clay hover:underline">
                  查看全部结果 →
                </button>
              ) : null}
            </div>
            <div className="mt-3 divide-y divide-line">
              {results.map((product) => (
                <Link
                  key={product.id}
                  href={`/product/${product.slug}`}
                  onClick={onClose}
                  className="group flex items-center gap-4 py-4"
                >
                  <div
                    className="h-20 w-16 shrink-0 overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${product.editorial.palette[0]}, ${product.editorial.palette[1]})`,
                    }}
                  >
                    <ProductArt
                      art={product.editorial.art}
                      color={product.colors[0].hex}
                      accent={product.editorial.accent}
                      className="transition duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted">
                      {product.subcategory} · {product.colors[0].name}
                    </p>
                    <p className="mt-1 truncate text-[14px]">{product.name}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {product.styleTags.slice(0, 2).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-[13px]">{money(product.price)}</p>
                    {product.compareAt ? (
                      <p className="num text-[10px] text-muted line-through">{money(product.compareAt)}</p>
                    ) : null}
                  </div>
                </Link>
              ))}
              {!loading && searched && results.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-muted">
                  没有找到直接匹配的单品。试试更宽泛的描述，或让 AI 造型师帮你找。
                </p>
              ) : null}
            </div>
            <Link
              href={`/stylist?prompt=${encodeURIComponent(query)}`}
              onClick={onClose}
              className="mt-5 flex items-center justify-between border border-line-strong bg-paper px-4 py-4 transition hover:border-ink"
            >
              <span className="flex items-center gap-3 text-[12px]">
                <Icon name="sparkle" size={16} className="text-clay" />
                让 AI 造型师理解这句需求
              </span>
              <Icon name="arrow-up-right" size={15} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
