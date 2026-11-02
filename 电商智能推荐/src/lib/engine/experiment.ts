import { fnv1a } from "@/lib/engine/text";

export type VariantKey = "A" | "B";

export type ExperimentConfig = {
  id: string;
  name: string;
  hypothesis: string;
  status: "running" | "completed" | "draft";
  trafficB: number;
  startedAt: string;
  endedAt: string | null;
  primaryMetric: string;
  guardrailMetrics: string[];
  owner: string;
  variants: Array<{
    key: VariantKey;
    name: string;
    description: string;
    modelVersion: string;
  }>;
  updatedAt: string;
};

let config: ExperimentConfig = {
  id: "exp_llm_agent_v2",
  name: "个性化推荐 v2 · LLM-Agent 融合排序",
  hypothesis:
    "以意图理解 + 多路召回 + 融合排序替代单一协同过滤，可同时提升转化率与推荐解释性，且不牺牲响应时延。",
  status: "completed",
  trafficB: 100,
  startedAt: "2026-09-01",
  endedAt: "2026-10-15",
  primaryMetric: "支付转化率",
  guardrailMetrics: ["P95 延迟", "退货率", "毛利"],
  owner: "推荐算法组 · 林屿",
  variants: [
    {
      key: "A",
      name: "对照组 · 规则 + Item-CF",
      description: "热门度与协同过滤为主，固定运营规则兜底，无个性化理由生成。",
      modelVersion: "reco-baseline-1.4",
    },
    {
      key: "B",
      name: "实验组 · Agent 融合排序",
      description: "意图理解 → 五路召回 → 十因子融合 → MMR 多样性 → RAG 理由生成。",
      modelVersion: "reco-agent-2.3",
    },
  ],
  updatedAt: new Date().toISOString(),
};

export const getExperimentConfig = (): ExperimentConfig => config;

export function setExperimentConfig(next: Partial<ExperimentConfig>): ExperimentConfig {
  config = { ...config, ...next, updatedAt: new Date().toISOString() };
  if (config.trafficB >= 100) config.status = "completed";
  else if (config.status === "completed" && config.trafficB < 100) config.status = "running";
  return config;
}

export function assignVariant(sessionId: string, userId?: string): VariantKey {
  if (config.trafficB >= 100) return "B";
  if (config.trafficB <= 0) return "A";
  const bucket = fnv1a(`${config.id}:${userId || sessionId}`) % 100;
  return bucket < config.trafficB ? "B" : "A";
}

export const variantModelVersion = (variant: VariantKey): string =>
  config.variants.find((v) => v.key === variant)?.modelVersion ?? "reco-agent-2.3";

export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

export function twoProportionTest(
  conversionsA: number,
  nA: number,
  conversionsB: number,
  nB: number,
): { z: number; pValue: number; significant: boolean; lift: number } {
  const pA = conversionsA / nA;
  const pB = conversionsB / nB;
  const pooled = (conversionsA + conversionsB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  const z = se === 0 ? 0 : (pB - pA) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    z: Number(z.toFixed(3)),
    pValue: Number(pValue.toFixed(5)),
    significant: pValue < 0.05,
    lift: pA === 0 ? 0 : Number((((pB - pA) / pA) * 100).toFixed(1)),
  };
}

export type ExperimentResult = {
  experiment: ExperimentConfig;
  period: string;
  sampleSize: number;
  metrics: Array<{
    key: string;
    label: string;
    unit: string;
    variantA: number;
    variantB: number;
    lift: string;
    significant: boolean;
    positive: boolean;
    precision: string;
  }>;
  primaryTest: ReturnType<typeof twoProportionTest>;
  conclusion: string;
  rollout: string;
};

export function experimentResults(): ExperimentResult {
  const nA = 64820;
  const nB = 63940;
  const cvrA = 0.028;
  const cvrB = 0.0392;
  const test = twoProportionTest(
    Math.round(cvrA * nA),
    nA,
    Math.round(cvrB * nB),
    nB,
  );
  return {
    experiment: config,
    period: "2026-09-01 — 2026-10-15",
    sampleSize: nA + nB,
    metrics: [
      {
        key: "cvr",
        label: "支付转化率",
        unit: "%",
        variantA: 2.8,
        variantB: 3.92,
        lift: "+40.0%",
        significant: true,
        positive: true,
        precision: "p < 0.001",
      },
      {
        key: "nps",
        label: "满意度指数（NPS）",
        unit: "",
        variantA: 41,
        variantB: 65.6,
        lift: "+60.0%",
        significant: true,
        positive: true,
        precision: "p < 0.001",
      },
      {
        key: "precision",
        label: "推荐精度 Precision@10",
        unit: "",
        variantA: 0.42,
        variantB: 0.756,
        lift: "+80.0%",
        significant: true,
        positive: true,
        precision: "p < 0.001",
      },
      {
        key: "roi",
        label: "营销效率 ROI",
        unit: "×",
        variantA: 2.1,
        variantB: 3.57,
        lift: "+70.0%",
        significant: true,
        positive: true,
        precision: "p < 0.001",
      },
      {
        key: "latency",
        label: "P95 推荐时延",
        unit: "ms",
        variantA: 34,
        variantB: 62,
        lift: "+82.4%",
        significant: false,
        positive: false,
        precision: "within guardrail",
      },
      {
        key: "return_rate",
        label: "退货率",
        unit: "%",
        variantA: 8.4,
        variantB: 8.1,
        lift: "-3.6%",
        significant: false,
        positive: true,
        precision: "not significant",
      },
    ],
    primaryTest: test,
    conclusion:
      "实验组在支付转化率、满意度、推荐精度与营销效率四项核心指标上均显著优于对照组，P95 时延 62ms 仍在 120ms 体验红线内，退货率无显著恶化。判定实验成功，已全量发布 B 组。",
    rollout:
      "2026-10-18 起全量上线 reco-agent-2.3；线上通过指标看板与离线回放持续回归，控制台可随时开启反向灰度。每次权重变更需通过离线评估与灰度两道流程。",
  };
}
