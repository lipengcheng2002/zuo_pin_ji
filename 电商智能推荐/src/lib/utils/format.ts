import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const money = (value: number): string =>
  `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;

export const moneyDecimal = (value: number): string =>
  `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const percent = (value: number, digits = 1): string =>
  `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;

export const compact = (value: number): string =>
  new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );

export const dateLabel = (iso: string): string => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\//g, ".");
};

export const dateTimeLabel = (iso: string): string => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return dateLabel(iso);
};

export const stockLabel = (stock: number): string =>
  stock <= 0 ? "暂时缺货" : stock <= 4 ? `仅剩 ${stock} 件` : "现货";

export const scoreLabel = (score: number): string => `${Math.round(score * 100)}%`;

export const categoryLabelMap: Record<string, string> = {
  outerwear: "外套",
  knitwear: "针织",
  shirting: "衬衫",
  dresses: "连衣裙",
  trousers: "裤装",
  skirts: "半裙",
  shoes: "鞋履",
  bags: "包袋",
  accessories: "配饰",
};

export const initials = (name: string): string => name.slice(0, 1);

export const truncate = (text: string, length: number): string =>
  text.length <= length ? text : `${text.slice(0, length)}…`;
