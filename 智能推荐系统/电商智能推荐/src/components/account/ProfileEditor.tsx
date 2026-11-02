"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@/lib/types";
import { COLORS, OCCASIONS, STYLE_TAGS } from "@/lib/data/catalog";
import { useToast } from "@/components/providers/Toast";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/format";

const ARCHETYPES = [
  "静奢极简",
  "都市通勤",
  "法式松弛",
  "复古学院",
  "新中式",
  "机能户外",
  "浪漫柔美",
] as const;

export function ProfileEditor({ user }: { user: UserProfile }) {
  const router = useRouter();
  const { push } = useToast();
  const [styles, setStyles] = useState<string[]>(user.styleKeywords);
  const [colors, setColors] = useState<string[]>(user.favoriteColors);
  const [occasions, setOccasions] = useState<string[]>(user.occasions);
  const [height, setHeight] = useState(user.height);
  const [weight, setWeight] = useState(user.weight);
  const [sizes, setSizes] = useState(user.sizes);
  const [fit, setFit] = useState(user.preferredFit);
  const [archetype, setArchetype] = useState(user.archetype);
  const [budget, setBudget] = useState(user.budget);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleKeywords: styles,
          favoriteColors: colors,
          occasions,
          height,
          weight,
          sizes,
          preferredFit: fit,
          archetype,
          budget,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      push("画像偏好已更新", { tone: "success", detail: "下一次推荐会立即生效。" });
      router.refresh();
    } catch (error) {
      push((error as Error).message, { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-line bg-paper p-5 md:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Style Profile</p>
          <h3 className="mt-1.5 text-[18px]">编辑你的风格坐标</h3>
          <p className="mt-1 text-[10.5px] leading-5 text-muted">
            偏好会写入画像，影响后续召回、排序与理由生成。
          </p>
        </div>
        <span className="chip chip-clay h-6 text-[8.5px]">实时生效</span>
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <p className="label">风格类型</p>
          <div className="flex flex-wrap gap-1.5">
            {ARCHETYPES.map((item) => (
              <button
                key={item}
                onClick={() => setArchetype(item)}
                className={cn(
                  "h-8 border px-3 text-[10.5px] transition",
                  archetype === item ? "border-ink bg-ink text-ivory" : "border-line-strong hover:border-ink",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">风格关键词（最多 6 个）</p>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_TAGS.map((tag) => {
              const selected = styles.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => {
                    if (!selected && styles.length >= 6) return;
                    toggle(styles, setStyles, tag);
                  }}
                  className={cn(
                    "h-8 border px-3 text-[10.5px] transition",
                    selected ? "border-ink bg-ink text-ivory" : "border-line-strong hover:border-ink",
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="label">常用颜色</p>
          <div className="flex flex-wrap gap-2">
            {Object.values(COLORS).map((color) => {
              const selected = colors.includes(color.name);
              return (
                <button
                  key={color.code}
                  onClick={() => toggle(colors, setColors, color.name)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 border px-2 text-[10px] transition",
                    selected ? "border-ink bg-paper" : "border-line-strong hover:border-ink",
                  )}
                >
                  <span className="h-3 w-3 rounded-full border border-ink/10" style={{ background: color.hex }} />
                  {color.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="label">高频场景</p>
          <div className="flex flex-wrap gap-1.5">
            {OCCASIONS.map((occasion) => {
              const selected = occasions.includes(occasion);
              return (
                <button
                  key={occasion}
                  onClick={() => toggle(occasions, setOccasions, occasion)}
                  className={cn(
                    "h-8 border px-3 text-[10.5px] transition",
                    selected ? "border-ink bg-ink text-ivory" : "border-line-strong hover:border-ink",
                  )}
                >
                  {occasion}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="height">身高（cm）</label>
            <input
              id="height"
              type="number"
              min={140}
              max={210}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="weight">体重（kg）</label>
            <input
              id="weight"
              type="number"
              min={35}
              max={150}
              value={weight}
              onChange={(event) => setWeight(Number(event.target.value))}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="top-size">上衣尺码</label>
            <select
              id="top-size"
              value={sizes.top}
              onChange={(event) => setSizes({ ...sizes, top: event.target.value })}
              className="field"
            >
              {["XS", "S", "M", "L", "XL"].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bottom-size">下装尺码</label>
            <select
              id="bottom-size"
              value={sizes.bottom}
              onChange={(event) => setSizes({ ...sizes, bottom: event.target.value })}
              className="field"
            >
              {["XS", "S", "M", "L", "XL"].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="shoe-size">鞋履尺码</label>
            <select
              id="shoe-size"
              value={sizes.shoes}
              onChange={(event) => setSizes({ ...sizes, shoes: event.target.value })}
              className="field"
            >
              {["35", "36", "37", "38", "39", "40"].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fit">偏好版型</label>
            <select
              id="fit"
              value={fit}
              onChange={(event) => setFit(event.target.value)}
              className="field"
            >
              {["修身", "标准", "宽松", "直身"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="budget-min">预算下限</label>
            <input
              id="budget-min"
              type="number"
              value={budget.min}
              onChange={(event) => setBudget({ ...budget, min: Number(event.target.value) })}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="budget-max">预算上限</label>
            <input
              id="budget-max"
              type="number"
              value={budget.max}
              onChange={(event) => setBudget({ ...budget, max: Number(event.target.value) })}
              className="field"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
          <p className="flex items-center gap-1.5 text-[9.5px] text-muted">
            <Icon name="shield" size={12} />
            数据仅用于个性化推荐
          </p>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? "保存中…" : "保存偏好"}
          </button>
        </div>
      </div>
    </div>
  );
}
