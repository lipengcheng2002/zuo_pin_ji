import { getSettings, getStoreHealth } from "@/lib/store/db";
import { getEventStream } from "@/lib/store/db";
import { buildProfileView } from "@/lib/engine/profile";
import { recommend } from "@/lib/engine/recommend";
import { llmConfig } from "@/lib/agent/llm";
import { DEMO_USER_ID } from "@/lib/data/community";
import { NO_STORE } from "@/lib/security";
import { validateEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const VERSION = process.env.APP_VERSION ?? "1.1.0";

export async function GET() {
  const started = Date.now();
  const checks: Record<string, { status: "ok" | "degraded" | "down"; detail: string; latencyMs?: number }> = {};

  try {
    const storeStarted = Date.now();
    const health = await getStoreHealth();
    checks.storage = {
      status: "ok",
      detail: `${health.driver} · schema v${health.schemaVersion}`,
      latencyMs: Date.now() - storeStarted,
    };
  } catch (error) {
    checks.storage = {
      status: "down",
      detail: (error as Error).message,
    };
  }

  try {
    const engineStarted = Date.now();
    const events = await getEventStream();
    const profile = buildProfileView(DEMO_USER_ID, events);
    const result = recommend(
      { userId: DEMO_USER_ID, scene: "home", limit: 4 },
      { events, userProfile: profile },
    );
    checks.engine = {
      status: result.items.length > 0 ? "ok" : "degraded",
      detail: `${result.items.length} items · ${result.trace.recall.length} sources · ${result.trace.totalLatencyMs}ms`,
      latencyMs: Date.now() - engineStarted,
    };
  } catch (error) {
    checks.engine = {
      status: "down",
      detail: (error as Error).message,
    };
  }

  try {
    const settings = await getSettings();
    checks.agent = {
      status: settings.agentEnabled ? "ok" : "degraded",
      detail: settings.agentEnabled
        ? `enabled · max ${settings.maxToolsPerTurn} tools · min confidence ${settings.minIntentConfidence}`
        : "disabled by console settings",
    };
  } catch (error) {
    checks.agent = {
      status: "down",
      detail: (error as Error).message,
    };
  }

  const llm = llmConfig();
  checks.llm = {
    status: "ok",
    detail: llm.configured
      ? `${llm.providerLabel} · ${llm.model} (${llm.source === "env" ? "env" : "console"})`
      : llm.hasKey
        ? "LLM key stored but disabled; using local planner"
        : "local planner (no LLM key configured)",
  };

  const env = validateEnv();
  checks.config = {
    status: env.ok ? "ok" : "down",
    detail: env.errors.length
      ? env.errors.join("; ")
      : env.warnings.length
        ? `${env.warnings.length} warning(s) — demo defaults or local URLs`
        : "validated",
  };

  const status = Object.values(checks).some((check) => check.status === "down")
    ? "down"
    : Object.values(checks).some((check) => check.status === "degraded")
      ? "degraded"
      : "ok";

  return Response.json(
    {
      status,
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
      warnings: env.warnings,
      responseTimeMs: Date.now() - started,
    },
    { status: status === "down" ? 503 : 200, headers: NO_STORE },
  );
}
