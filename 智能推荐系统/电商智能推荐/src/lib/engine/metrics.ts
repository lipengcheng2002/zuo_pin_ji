import { mulberry32 } from "@/lib/data/community";
import { PRODUCTS } from "@/lib/data/catalog";
import { experimentResults } from "@/lib/engine/experiment";

export type DailyMetric = {
  date: string;
  sessions: number;
  impressions: number;
  productViews: number;
  agentSessions: number;
  addToCarts: number;
  checkouts: number;
  orders: number;
  agentOrders: number;
  gmv: number;
  aov: number;
  cvr: number;
  ctr: number;
  nps: number;
  precision: number;
  roi: number;
  latencyP50: number;
  latencyP95: number;
  recsServed: number;
  returnRate: number;
};

const DAY = 86400000;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const fmtDate = (timestamp: number) => {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
};

let cache: DailyMetric[] | null = null;

export function metricSeries(days = 90): DailyMetric[] {
  if (cache && cache.length === days) return cache;
  const rnd = mulberry32(77319);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const series: DailyMetric[] = [];

  for (let i = 0; i < days; i += 1) {
    const dayIndex = days - 1 - i;
    const ts = now.getTime() - dayIndex * DAY;
    const progress = smoothstep(38, 82, i);
    const weekday = new Date(ts).getDay();
    const weekendBoost = weekday === 0 || weekday === 6 ? 0.88 : 1.02;
    const noise = 0.96 + rnd() * 0.08;
    const sessionBase = lerp(7800, 12400, i / days);
    const sessions = Math.round(sessionBase * weekendBoost * noise);
    const impressions = Math.round(sessions * (4.8 + rnd() * 0.8));
    const productViews = Math.round(sessions * (2.2 + rnd() * 0.4));
    const agentShare = lerp(0.12, 0.34, progress);
    const agentSessions = Math.round(sessions * agentShare * (0.94 + rnd() * 0.12));
    const cvr = lerp(0.028, 0.0392, progress) * (0.95 + rnd() * 0.1);
    const orders = Math.round(sessions * cvr);
    const aov = Math.round(lerp(748, 862, progress) * (0.97 + rnd() * 0.06));
    const gmv = orders * aov;
    const ctr = lerp(0.052, 0.062, progress) * (0.95 + rnd() * 0.1);
    const nps = Math.round(lerp(41, 65.6, progress) * (0.97 + rnd() * 0.06) * 10) / 10;
    const precision = Math.round(lerp(0.42, 0.756, progress) * 1000) / 1000;
    const roi = Math.round(lerp(2.1, 3.57, progress) * 100) / 100;
    const latencyP50 = Math.round(lerp(29, 41, progress) * (0.94 + rnd() * 0.12));
    const latencyP95 = Math.round(lerp(38, 62, progress) * (0.94 + rnd() * 0.12));
    const addToCarts = Math.round(orders / (0.42 + rnd() * 0.08));
    const checkouts = Math.round(orders / (0.72 + rnd() * 0.08));
    const agentOrders = Math.round(orders * lerp(0.22, 0.44, progress));
    const recsServed = Math.round(sessions * (3.4 + rnd() * 0.9));
    const returnRate = Math.round((lerp(0.094, 0.081, progress) + (rnd() - 0.5) * 0.006) * 1000) / 10;

    series.push({
      date: fmtDate(ts),
      sessions,
      impressions,
      productViews,
      agentSessions,
      addToCarts,
      checkouts,
      orders,
      agentOrders,
      gmv,
      aov,
      cvr: Number((cvr * 100).toFixed(2)),
      ctr: Number((ctr * 100).toFixed(2)),
      nps,
      precision,
      roi,
      latencyP50,
      latencyP95,
      recsServed,
      returnRate,
    });
  }
  cache = series;
  return series;
}

export type KpiSummary = {
  period: { from: string; to: string; days: number };
  gmv: number;
  orders: number;
  sessions: number;
  cvr: number;
  aov: number;
  ctr: number;
  agentSessions: number;
  agentShare: number;
  agentCvr: number;
  nps: number;
  precision: number;
  roi: number;
  latencyP95: number;
  returnRate: number;
  comparisons: {
    gmv: number;
    orders: number;
    sessions: number;
    cvr: number;
    aov: number;
    ctr: number;
    agentShare: number;
    nps: number;
    precision: number;
    roi: number;
    latencyP95: number;
    returnRate: number;
  };
};

const pctDelta = (current: number, previous: number) =>
  previous === 0 ? 0 : Number((((current - previous) / previous) * 100).toFixed(1));

const avg = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);

const summarize = (rows: DailyMetric[]): Omit<KpiSummary, "period" | "comparisons"> => {
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  const sessions = rows.reduce((s, r) => s + r.sessions, 0);
  const gmv = rows.reduce((s, r) => s + r.gmv, 0);
  return {
    gmv,
    orders,
    sessions,
    cvr: Number(((orders / Math.max(1, sessions)) * 100).toFixed(2)),
    aov: Math.round(gmv / Math.max(1, orders)),
    ctr: Number(avg(rows.map((r) => r.ctr)).toFixed(2)),
    agentSessions: rows.reduce((s, r) => s + r.agentSessions, 0),
    agentShare: Number(
      ((rows.reduce((s, r) => s + r.agentSessions, 0) / Math.max(1, sessions)) * 100).toFixed(1),
    ),
    agentCvr: Number(
      ((rows.reduce((s, r) => s + r.agentOrders, 0) /
        Math.max(1, rows.reduce((s, r) => s + r.agentSessions, 0))) *
        100).toFixed(2),
    ),
    nps: Number(avg(rows.map((r) => r.nps)).toFixed(1)),
    precision: Number(avg(rows.map((r) => r.precision)).toFixed(3)),
    roi: Number(avg(rows.map((r) => r.roi)).toFixed(2)),
    latencyP95: Math.round(avg(rows.map((r) => r.latencyP95))),
    returnRate: Number(avg(rows.map((r) => r.returnRate)).toFixed(1)),
  };
};

export function kpiSummary(days = 30): KpiSummary {
  const series = metricSeries(90);
  const current = series.slice(-days);
  const previous = series.slice(-(days * 2), -days);
  const cur = summarize(current);
  const prev = summarize(previous);
  return {
    period: {
      from: current[0].date,
      to: current[current.length - 1].date,
      days,
    },
    ...cur,
    comparisons: {
      gmv: pctDelta(cur.gmv, prev.gmv),
      orders: pctDelta(cur.orders, prev.orders),
      sessions: pctDelta(cur.sessions, prev.sessions),
      cvr: pctDelta(cur.cvr, prev.cvr),
      aov: pctDelta(cur.aov, prev.aov),
      ctr: pctDelta(cur.ctr, prev.ctr),
      agentShare: pctDelta(cur.agentShare, prev.agentShare),
      nps: pctDelta(cur.nps, prev.nps),
      precision: pctDelta(cur.precision, prev.precision),
      roi: pctDelta(cur.roi, prev.roi),
      latencyP95: pctDelta(cur.latencyP95, prev.latencyP95),
      returnRate: pctDelta(cur.returnRate, prev.returnRate),
    },
  };
}

export function funnelData() {
  const kpi = kpiSummary(30);
  const impressions = Math.round(kpi.sessions * 5.2);
  const productViews = Math.round(kpi.sessions * 2.4);
  const adds = Math.round(kpi.orders / 0.45);
  const checkoutStarted = Math.round(kpi.orders / 0.74);
  return [
    { key: "impressions", label: "推荐曝光", value: impressions, rate: 100 },
    { key: "views", label: "商品访问", value: productViews, rate: Number(((productViews / impressions) * 100).toFixed(1)) },
    { key: "adds", label: "加入购物袋", value: adds, rate: Number(((adds / productViews) * 100).toFixed(1)) },
    { key: "checkout", label: "发起结算", value: checkoutStarted, rate: Number(((checkoutStarted / adds) * 100).toFixed(1)) },
    { key: "paid", label: "支付成功", value: kpi.orders, rate: Number(((kpi.orders / checkoutStarted) * 100).toFixed(1)) },
  ];
}

export const RECALL_CONTRIBUTION = [
  { source: "向量召回", key: "vector", share: 38, ctrLift: 24.6, color: "#2F3A33" },
  { source: "协同过滤", key: "collaborative", share: 24, ctrLift: 18.2, color: "#6E756F" },
  { source: "规则约束", key: "rule", share: 17, ctrLift: 9.4, color: "#A8482B" },
  { source: "热度趋势", key: "trending", share: 13, ctrLift: 6.8, color: "#B9A88F" },
  { source: "编辑精选", key: "editorial", share: 8, ctrLift: 3.1, color: "#C9C2B4" },
];

export const LATENCY_BUCKETS = [
  { bucket: "< 30ms", share: 8 },
  { bucket: "30–50ms", share: 34 },
  { bucket: "50–70ms", share: 39 },
  { bucket: "70–100ms", share: 14 },
  { bucket: "100–150ms", share: 4 },
  { bucket: "> 150ms", share: 1 },
];

export function categoryPerformance() {
  const totalSold = PRODUCTS.reduce((sum, p) => sum + p.sold30d, 0);
  const groups = new Map<string, { sold: number; gmv: number; items: number; rating: number }>();
  PRODUCTS.forEach((p) => {
    const entry = groups.get(p.category) ?? { sold: 0, gmv: 0, items: 0, rating: 0 };
    entry.sold += p.sold30d;
    entry.gmv += p.sold30d * p.price;
    entry.items += 1;
    entry.rating += p.rating;
    groups.set(p.category, entry);
  });
  const labels: Record<string, string> = {
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
  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      label: labels[key] ?? key,
      gmv: value.gmv,
      sold: value.sold,
      share: Number(((value.sold / totalSold) * 100).toFixed(1)),
      rating: Number((value.rating / value.items).toFixed(2)),
      items: value.items,
    }))
    .sort((a, b) => b.gmv - a.gmv);
}

export const CHANNEL_MIX = [
  { channel: "官网自然流量", share: 34, gmvShare: 32 },
  { channel: "AI 造型师", share: 28, gmvShare: 36 },
  { channel: "小程序", share: 22, gmvShare: 19 },
  { channel: "搜索广告", share: 10, gmvShare: 8 },
  { channel: "订阅邮件", share: 6, gmvShare: 5 },
];

export const TOP_QUERIES = [
  { query: "通勤 大衣", count: 4820, cvr: 4.8, trend: 12.4 },
  { query: "羊绒 高领", count: 4210, cvr: 5.6, trend: 18.2 },
  { query: "真丝衬衫", count: 3180, cvr: 3.9, trend: 6.7 },
  { query: "约会 连衣裙", count: 2960, cvr: 6.2, trend: 22.5 },
  { query: "阔腿裤 显高", count: 2410, cvr: 4.1, trend: -3.2 },
  { query: "秋冬 通勤套装", count: 2180, cvr: 5.1, trend: 9.8 },
  { query: "礼物 围巾", count: 1620, cvr: 6.8, trend: 31.4 },
  { query: "黑色 短靴", count: 1540, cvr: 5.4, trend: 4.2 },
];

export function weeklyHeatmap() {
  const series = metricSeries(28);
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return days.map((label, weekday) => {
    const rows = series.filter((r) => {
      const d = new Date(`${r.date}T12:00:00`).getDay();
      const normalized = d === 0 ? 6 : d - 1;
      return normalized === weekday;
    });
    return {
      label,
      values: rows.map((r) => ({
        date: r.date,
        cvr: r.cvr,
        value: Number(((r.orders / r.sessions) * 1000).toFixed(1)),
      })),
    };
  });
}

export function retentionCohorts() {
  const rnd = mulberry32(5511);
  return Array.from({ length: 6 }, (_, row) => ({
    cohort: `2026-0${7 + row}-W${row + 1}`,
    size: 2400 + Math.round(rnd() * 1600),
    retention: Array.from({ length: 6 - row }, (_, col) =>
      col === 0 ? 100 : Math.max(12, Math.round(100 * Math.pow(0.52 - row * 0.02, col) + rnd() * 4)),
    ),
  }));
}

export function experimentSummary() {
  return experimentResults();
}

export function formatCompact(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)} 亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString("zh-CN");
}

export function formatMoney(value: number): string {
  if (value >= 10000) {
    return `¥${(value / 10000).toLocaleString("zh-CN", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} 万`;
  }
  return `¥${value.toLocaleString("zh-CN")}`;
}
