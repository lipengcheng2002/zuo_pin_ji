import type { AgentToolName } from "@/lib/agent/types";

export const AGENT_SERVICE_NAME = "zhiyan-stylist-agent";
export const AGENT_SERVICE_VERSION = process.env.AGENT_SERVICE_VERSION ?? "1.1.0";
export const AGENT_API_VERSION = "1.0";
export const PROMPT_VERSION = "stylist-sp-2026.10.3";

export const AGENT_LIMITS = {
  messageMaxChars: 600,
  rateLimitPerMinute: 24,
  maxToolsPerTurn: 4,
  absoluteMaxToolsPerTurn: 6,
  minIntentConfidence: 0.45,
  sessionMessages: 60,
  agentLogRetention: 500,
  inputMaxBytes: 1_000_000,
} as const;

export const SSE_EVENTS = [
  "meta",
  "stage",
  "trace",
  "products",
  "outfit",
  "delta",
  "suggestions",
  "action",
  "done",
  "error",
] as const;

export const AGENT_TOOL_NAMES: readonly AgentToolName[] = [
  "search_catalog",
  "get_product",
  "recommend",
  "build_outfit",
  "size_advisor",
  "retrieve_knowledge",
  "compare_products",
  "get_cart",
  "add_to_cart",
  "get_orders",
  "update_preference",
];

export const WRITE_TOOLS: ReadonlySet<AgentToolName> = new Set([
  "add_to_cart",
  "update_preference",
]);

export const AGENT_ERROR_CODES = {
  AGENT_ERROR: "AGENT_ERROR",
} as const;

export const AGENT_GUARDRAILS = [
  "prompt_injection",
  "pii_masking",
  "price_fact_check",
  "stock_fact_check",
  "policy_grounding",
  "size_disclaimer",
  "absolute_claim_filter",
] as const;
