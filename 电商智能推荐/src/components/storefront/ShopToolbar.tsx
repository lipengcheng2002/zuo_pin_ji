"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useDialog } from "@/lib/hooks/useDialog";
import { cn } from "@/lib/utils/format";

export type ShopFacets = {
  categories: Array<{ key: string; label: string; count: number }>;
  colors: Array<{ name: string; hex: string; count: number }>;
  sizes: string[];
  occasions: Array<{ name: string; count: number }>;
  styles: Array<{ name: string; count: number }>;
  priceBands: Array<{ key: string; label: string; min: number; max: number }>;
  total: number;
};

const SORT_OPTIONS = [
  { value: "relevance", label: "推荐排序" },
  { value: "newest", label: "最新上架" },
  { value: "popular", label: "销量优先" },
  { value: "price_asc", label: "价格从低到高" },
  { value: "price_desc", label: "价格从高到低" },
];

const FILTER_KEYS = ["category", "color", "size", "min", "max", "occasion", "style"] as const;

export function ShopToolbar({ facets }: { facets: ShopFacets }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const panelRef = useDialog<HTMLElement>(open, () => setOpen(false));

  const readList = (key: string) =>
    (searchParams.get(key) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [priceBand, setPriceBand] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string[]> = {};
    FILTER_KEYS.forEach((key) => {
      next[key] = readList(key);
    });
    setDraft(next);
    const min = searchParams.get("min");
    const max = searchParams.get("max");
    const band = facets.priceBands.find(
      (item) => String(item.min) === min && String(item.max) === max,
    );
    setPriceBand(band?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, facets.priceBands]);

  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; value: string; label: string }> = [];
    readList("category").forEach((value) => {
      const facet = facets.categories.find((c) => c.key === value);
      if (facet) chips.push({ key: "category", value, label: facet.label });
    });
    readList("color").forEach((value) => chips.push({ key: "color", value, label: value }));
    readList("size").forEach((value) => chips.push({ key: "size", value, label: `${value} 码` }));
    const min = searchParams.get("min");
    const max = searchParams.get("max");
    if (min || max) {
      const band = facets.priceBands.find(
        (item) => String(item.min) === min && String(item.max) === max,
      );
      chips.push({ key: "price", value: "price", label: band?.label ?? `¥${min ?? 0}–${max ?? "∞"}` });
    }
    readList("occasion").forEach((value) => chips.push({ key: "occasion", value, label: value }));
    readList("style").forEach((value) => chips.push({ key: "style", value, label: value }));
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, facets]);

  const activeCount = activeFilters.length;

  const updateParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    startTransition(() => {
      router.push(`/shop?${params.toString()}`, { scroll: false });
    });
  };

  const toggleValue = (key: string, value: string) => {
    setDraft((current) => {
      const list = new Set(current[key] ?? []);
      if (list.has(value)) list.delete(value);
      else list.add(value);
      return { ...current, [key]: [...list] };
    });
  };

  const apply = () => {
    updateParams((params) => {
      FILTER_KEYS.forEach((key) => {
        if (key === "min" || key === "max") return;
        const values = draft[key] ?? [];
        if (values.length) params.set(key, values.join(","));
        else params.delete(key);
      });
      const band = facets.priceBands.find((item) => item.key === priceBand);
      if (band) {
        params.set("min", String(band.min));
        params.set("max", String(band.max));
      } else {
        params.delete("min");
        params.delete("max");
      }
    });
    setOpen(false);
  };

  const reset = () => {
    setDraft({});
    setPriceBand(null);
    updateParams((params) => {
      FILTER_KEYS.forEach((key) => params.delete(key));
    });
  };

  const removeChip = (key: string, value: string) => {
    if (key === "price") {
      updateParams((params) => {
        params.delete("min");
        params.delete("max");
      });
      return;
    }
    updateParams((params) => {
      const current = (params.get(key) ?? "").split(",").filter((v) => v && v !== value);
      if (current.length) params.set(key, current.join(","));
      else params.delete(key);
    });
  };

  const setCategory = (key: string | null) => {
    updateParams((params) => {
      if (key) params.set("category", key);
      else params.delete("category");
    });
  };

  const activeCategory = searchParams.get("category") ?? "";

  return (
    <>
      <div className="sticky top-[72px] z-30 border-y border-line bg-ivory/95 backdrop-blur-md md:top-20">
        <div className="container-x flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setCategory(null)}
              className={cn(
                "shrink-0 px-3 py-1.5 text-[11px] tracking-[0.08em] transition",
                !activeCategory ? "text-clay" : "text-muted hover:text-ink",
              )}
            >
              全部
            </button>
            {facets.categories.map((category) => (
              <button
                key={category.key}
                onClick={() => setCategory(category.key)}
                className={cn(
                  "shrink-0 px-3 py-1.5 text-[11px] tracking-[0.08em] transition",
                  activeCategory === category.key ? "text-clay" : "text-muted hover:text-ink",
                )}
              >
                {category.label}
                <span className="num ml-1 text-[8px] text-muted-light">{category.count}</span>
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="num hidden text-[10px] text-muted sm:inline">{facets.total} 件</span>
            <button
              onClick={() => setOpen(true)}
              className="flex h-9 items-center gap-1.5 border border-line-strong px-3 text-[10.5px] tracking-wide transition hover:border-ink"
            >
              <Icon name="sliders" size={13} />
              筛选
              {activeCount ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[8px] text-white">
                  {activeCount}
                </span>
              ) : null}
            </button>
            <div className="relative">
              <select
                aria-label="排序方式"
                value={searchParams.get("sort") ?? "relevance"}
                onChange={(event) =>
                  updateParams((params) => {
                    if (event.target.value === "relevance") params.delete("sort");
                    else params.set("sort", event.target.value);
                  })
                }
                className="h-9 appearance-none border border-line-strong bg-transparent pl-3 pr-7 text-[10.5px] focus:border-ink focus:outline-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron-down"
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
              />
            </div>
          </div>
        </div>
        {activeCount ? (
          <div className="container-x flex flex-wrap items-center gap-2 border-t border-line/70 py-2.5">
            {activeFilters.map((chip) => (
              <button
                key={`${chip.key}-${chip.value}`}
                onClick={() => removeChip(chip.key, chip.value)}
                className="flex h-6 items-center gap-1 border border-line-strong bg-paper px-2 text-[9.5px] text-ink-soft transition hover:border-ink"
              >
                {chip.label}
                <Icon name="close" size={10} />
              </button>
            ))}
            <button
              onClick={reset}
              className="ml-1 text-[9.5px] text-muted underline underline-offset-4 hover:text-clay"
            >
              清除全部
            </button>
            {pending ? <span className="text-[9px] text-muted">正在筛选…</span> : null}
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[95]">
          <button
            aria-label="关闭筛选"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
          />
          <aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="筛选"
            className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col bg-ivory shadow-2xl animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-5">
              <div>
                <p className="eyebrow">Filters</p>
                <h2 className="mt-1 text-[17px]">筛选与排序</h2>
              </div>
              <button onClick={() => setOpen(false)} aria-label="关闭" className="p-2 text-muted hover:text-ink">
                <Icon name="close" size={19} />
              </button>
            </div>
            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              <section>
                <p className="label">品类</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {facets.categories.map((category) => {
                    const selected = (draft.category ?? []).includes(category.key);
                    return (
                      <button
                        key={category.key}
                        onClick={() => toggleValue("category", category.key)}
                        className={cn(
                          "flex h-9 items-center justify-between border px-3 text-[11px] transition",
                          selected
                            ? "border-ink bg-ink text-ivory"
                            : "border-line-strong hover:border-ink",
                        )}
                      >
                        {category.label}
                        <span className={cn("num text-[8.5px]", selected ? "text-ivory/50" : "text-muted")}>
                          {category.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <p className="label">颜色</p>
                <div className="flex flex-wrap gap-2">
                  {facets.colors.map((color) => {
                    const selected = (draft.color ?? []).includes(color.name);
                    return (
                      <button
                        key={color.name}
                        onClick={() => toggleValue("color", color.name)}
                        className={cn(
                          "flex h-8 items-center gap-2 border px-2.5 text-[10.5px] transition",
                          selected ? "border-ink" : "border-line-strong hover:border-ink",
                        )}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full border border-ink/15"
                          style={{ background: color.hex }}
                        />
                        {color.name}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <p className="label">尺码</p>
                <div className="flex flex-wrap gap-1.5">
                  {facets.sizes.map((size) => {
                    const selected = (draft.size ?? []).includes(size);
                    return (
                      <button
                        key={size}
                        onClick={() => toggleValue("size", size)}
                        className={cn(
                          "h-9 min-w-11 border px-2 text-[10.5px] transition",
                          selected ? "border-ink bg-ink text-ivory" : "border-line-strong hover:border-ink",
                        )}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <p className="label">价格</p>
                <div className="space-y-1.5">
                  {facets.priceBands.map((band) => (
                    <button
                      key={band.key}
                      onClick={() => setPriceBand(priceBand === band.key ? null : band.key)}
                      className={cn(
                        "flex h-9 w-full items-center justify-between border px-3 text-[11px] transition",
                        priceBand === band.key
                          ? "border-ink bg-paper"
                          : "border-transparent hover:border-line-strong",
                      )}
                    >
                      {band.label}
                      <span
                        className={cn(
                          "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                          priceBand === band.key ? "border-ink bg-ink" : "border-line-strong",
                        )}
                      >
                        {priceBand === band.key ? <span className="h-1 w-1 rounded-full bg-ivory" /> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="label">场景</p>
                <div className="flex flex-wrap gap-1.5">
                  {facets.occasions.map((occasion) => {
                    const selected = (draft.occasion ?? []).includes(occasion.name);
                    return (
                      <button
                        key={occasion.name}
                        onClick={() => toggleValue("occasion", occasion.name)}
                        className={cn(
                          "h-8 border px-3 text-[10.5px] transition",
                          selected ? "border-ink bg-ink text-ivory" : "border-line-strong hover:border-ink",
                        )}
                      >
                        {occasion.name}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <p className="label">风格</p>
                <div className="flex flex-wrap gap-1.5">
                  {facets.styles.map((style) => {
                    const selected = (draft.style ?? []).includes(style.name);
                    return (
                      <button
                        key={style.name}
                        onClick={() => toggleValue("style", style.name)}
                        className={cn(
                          "h-8 border px-3 text-[10.5px] transition",
                          selected ? "border-ink bg-ink text-ivory" : "border-line-strong hover:border-ink",
                        )}
                      >
                        {style.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
            <div className="border-t border-line bg-paper px-6 py-4">
              <div className="flex gap-2">
                <button onClick={reset} className="btn btn-ghost flex-1">
                  重置
                </button>
                <button onClick={apply} className="btn btn-primary flex-[1.6]">
                  应用筛选
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
