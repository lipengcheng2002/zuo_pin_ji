import type { Product } from "@/lib/types";
import type {
  Evidence,
  Outfit,
  ProfileView,
  RecoTrace,
  Recommendation,
} from "@/lib/engine/types";
import type { IntentName, IntentSlots } from "@/lib/engine/intent";

export type AgentToolName =
  | "search_catalog"
  | "get_product"
  | "recommend"
  | "build_outfit"
  | "size_advisor"
  | "retrieve_knowledge"
  | "compare_products"
  | "get_cart"
  | "add_to_cart"
  | "get_orders"
  | "update_preference";

export type ToolCallRecord = {
  id: string;
  tool: AgentToolName;
  label: string;
  args: Record<string, unknown>;
  status: "ok" | "error" | "skipped";
  summary: string;
  latencyMs: number;
  productIds?: string[];
};

export type GuardrailCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: "info" | "warn" | "block";
};

export type GuardrailResult = {
  passed: boolean;
  checks: GuardrailCheck[];
  disclaimers: string[];
};

export type AgentProductCard = {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  price: number;
  compareAt: number | null;
  category: string;
  subcategory: string;
  art: Product["editorial"]["art"];
  palette: [string, string];
  accent: string;
  colorName: string;
  colorHex: string;
  colors: string[];
  sizes: Array<{ label: string; stock: number }>;
  rating: number;
  badge: string | null;
  reasonHeadline: string;
  reasonDetail: string;
  reasonConfidence: number;
  evidence: Evidence[];
  score: number;
};

export type AgentAction =
  | { type: "added_to_cart"; productId: string; name: string; size: string; color: string }
  | { type: "preference_updated"; tags: string[] }
  | { type: "handoff"; reason: string };

export type AgentTraceSnapshot = {
  requestId: string;
  intent: IntentName;
  intentLabel: string;
  confidence: number;
  slots: IntentSlots;
  plan: string[];
  tools: ToolCallRecord[];
  recall: RecoTrace | null;
  guardrails: GuardrailResult;
  mode: "llm" | "local";
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokens: number;
  variant: "A" | "B";
  profileTags: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: string;
  products?: AgentProductCard[];
  outfit?: Outfit | null;
  trace?: AgentTraceSnapshot | null;
  suggestions?: string[];
  action?: AgentAction | null;
  followUp?: string | null;
};

export type AgentTurnInput = {
  sessionId: string;
  userId: string;
  message: string;
  history?: ChatMessage[];
  requestId?: string;
};

export type AgentTurnResult = {
  message: ChatMessage;
  trace: AgentTraceSnapshot;
  recommendations: Recommendation[];
  profile: ProfileView;
  actions: AgentAction[];
};

export type ChatStreamEvent =
  | { type: "meta"; data: { requestId: string; variant: "A" | "B"; mode: "llm" | "local" } }
  | { type: "stage"; data: { stage: string; label: string; detail?: string } }
  | { type: "trace"; data: AgentTraceSnapshot }
  | { type: "delta"; data: { text: string } }
  | { type: "products"; data: { items: AgentProductCard[] } }
  | { type: "outfit"; data: { outfit: Outfit } }
  | { type: "action"; data: AgentAction }
  | { type: "suggestions"; data: { items: string[] } }
  | { type: "done"; data: { messageId: string; latencyMs: number; requestId?: string } }
  | { type: "error"; data: { message: string; code: string } };

export type AgentLog = {
  id: string;
  sessionId: string;
  userId: string;
  userMessage: string;
  answerPreview: string;
  intent: IntentName;
  intentLabel: string;
  confidence: number;
  mode: "llm" | "local";
  model: string;
  tools: AgentToolName[];
  toolCalls: number;
  guardrailsTriggered: string[];
  latencyMs: number;
  tokens: number;
  variant: "A" | "B";
  feedback: "up" | "down" | null;
  ts: string;
};
