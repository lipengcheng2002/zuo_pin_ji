import { PRODUCTS } from "@/lib/data/catalog";
import { getDashboardCounts, listAgentLogs } from "@/lib/store/db";
import { getFeatureStore } from "@/lib/engine/features";
import { kpiSummary, metricSeries } from "@/lib/engine/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const kpi = kpiSummary(30);
  const series = metricSeries(90);
  const features = getFeatureStore();
  const counts = await getDashboardCounts();
  const agentLogs = await listAgentLogs(500);
  const latencies = agentLogs
    .map((log) => log.latencyMs)
    .sort((a, b) => a - b);
  const p95 =
    latencies.length > 0
      ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)]
      : 0;
  const guardrailHits = agentLogs.reduce(
    (sum, log) => sum + log.guardrailsTriggered.length,
    0,
  );
  const feedbackUp = agentLogs.filter((log) => log.feedback === "up").length;
  const feedbackDown = agentLogs.filter((log) => log.feedback === "down").length;
  const intentCounts = agentLogs.reduce<Record<string, number>>((acc, log) => {
    acc[log.intent] = (acc[log.intent] ?? 0) + 1;
    return acc;
  }, {});
  const lines: string[] = [
    "# HELP zhiyan_kpi_gmv_30d GMV over the last 30 days (CNY).",
    "# TYPE zhiyan_kpi_gmv_30d gauge",
    `zhiyan_kpi_gmv_30d ${kpi.gmv}`,
    "# HELP zhiyan_kpi_orders_30d Paid orders over the last 30 days.",
    "# TYPE zhiyan_kpi_orders_30d gauge",
    `zhiyan_kpi_orders_30d ${kpi.orders}`,
    "# HELP zhiyan_kpi_cvr_30d Conversion rate, percent.",
    "# TYPE zhiyan_kpi_cvr_30d gauge",
    `zhiyan_kpi_cvr_30d ${kpi.cvr}`,
    "# HELP zhiyan_kpi_aov_30d Average order value (CNY).",
    "# TYPE zhiyan_kpi_aov_30d gauge",
    `zhiyan_kpi_aov_30d ${kpi.aov}`,
    "# HELP zhiyan_kpi_nps_30d Satisfaction index (NPS).",
    "# TYPE zhiyan_kpi_nps_30d gauge",
    `zhiyan_kpi_nps_30d ${kpi.nps}`,
    "# HELP zhiyan_kpi_precision_at_10 Recommendation precision at 10.",
    "# TYPE zhiyan_kpi_precision_at_10 gauge",
    `zhiyan_kpi_precision_at_10 ${kpi.precision}`,
    "# HELP zhiyan_kpi_roi_30d Marketing efficiency ROI.",
    "# TYPE zhiyan_kpi_roi_30d gauge",
    `zhiyan_kpi_roi_30d ${kpi.roi}`,
    "# HELP zhiyan_reco_latency_p95_ms Recommendation p95 latency in milliseconds.",
    "# TYPE zhiyan_reco_latency_p95_ms gauge",
    `zhiyan_reco_latency_p95_ms ${kpi.latencyP95}`,
    "# HELP zhiyan_agent_sessions_30d AI stylist sessions over the last 30 days.",
    "# TYPE zhiyan_agent_sessions_30d gauge",
    `zhiyan_agent_sessions_30d ${kpi.agentSessions}`,
    "# HELP zhiyan_catalog_products Catalog size.",
    "# TYPE zhiyan_catalog_products gauge",
    `zhiyan_catalog_products ${PRODUCTS.length}`,
    "# HELP zhiyan_feature_coverage Share of SKUs with interaction data.",
    "# TYPE zhiyan_feature_coverage gauge",
    `zhiyan_feature_coverage ${features.summary.coverage.toFixed(4)}`,
    "# HELP zhiyan_agent_logs_total Logged agent turns.",
    "# TYPE zhiyan_agent_logs_total counter",
    `zhiyan_agent_logs_total ${counts.agentLogs}`,
    "# HELP zhiyan_agent_latency_p95_ms Agent turn p95 latency from the retained log window.",
    "# TYPE zhiyan_agent_latency_p95_ms gauge",
    `zhiyan_agent_latency_p95_ms ${p95}`,
    "# HELP zhiyan_agent_guardrail_hits_total Guardrail findings across retained agent turns.",
    "# TYPE zhiyan_agent_guardrail_hits_total counter",
    `zhiyan_agent_guardrail_hits_total ${guardrailHits}`,
    "# HELP zhiyan_agent_feedback_up_total Positive agent feedback.",
    "# TYPE zhiyan_agent_feedback_up_total counter",
    `zhiyan_agent_feedback_up_total ${feedbackUp}`,
    "# HELP zhiyan_agent_feedback_down_total Negative agent feedback.",
    "# TYPE zhiyan_agent_feedback_down_total counter",
    `zhiyan_agent_feedback_down_total ${feedbackDown}`,
    "# HELP zhiyan_agent_intent_total Agent turns by predicted intent.",
    "# TYPE zhiyan_agent_intent_total counter",
    ...Object.entries(intentCounts).map(
      ([intent, count]) => `zhiyan_agent_intent_total{intent="${intent}"} ${count}`,
    ),
    "# HELP zhiyan_orders_total Orders persisted.",
    "# TYPE zhiyan_orders_total counter",
    `zhiyan_orders_total ${counts.orders}`,
    "# HELP zhiyan_runtime_events_total Runtime behavior events.",
    "# TYPE zhiyan_runtime_events_total counter",
    `zhiyan_runtime_events_total ${counts.runtimeEvents}`,
    "# HELP zhiyan_process_uptime_seconds Process uptime.",
    "# TYPE zhiyan_process_uptime_seconds gauge",
    `zhiyan_process_uptime_seconds ${Math.round(process.uptime())}`,
    "# HELP zhiyan_series_sessions_daily_last Last daily sessions sample.",
    "# TYPE zhiyan_series_sessions_daily_last gauge",
    `zhiyan_series_sessions_daily_last ${series[series.length - 1]?.sessions ?? 0}`,
  ];

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
