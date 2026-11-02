import type { BehaviorEvent, Cart, Order, UserProfile } from "@/lib/types";
import type { AgentLog, AgentToolName, ChatMessage } from "@/lib/agent/types";

export type AppSettings = {
  personalization: boolean;
  realtimeSignals: boolean;
  explanations: boolean;
  agentEnabled: boolean;
  guardrails: boolean;
  llmTemperature: number;
  maxToolsPerTurn: number;
  minIntentConfidence: number;
  trafficB: number;
  weightsPreset: "balanced" | "conversion" | "discovery";
  updatedAt: string;
  updatedBy: string;
};

export type AgentStatus = "draft" | "published" | "unpublished";
export type AgentChannel = "web" | "api" | "mini_program";

export type AgentRuntimeConfig = {
  promptVersion: string;
  provider: string;
  model: string;
  planner: boolean;
  temperature: number;
  maxToolsPerTurn: number;
  minIntentConfidence: number;
  tools: AgentToolName[];
};

export type AgentDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  owner: string;
  adapter: "stylist";
  status: AgentStatus;
  channels: AgentChannel[];
  config: AgentRuntimeConfig;
  currentVersion: number | null;
  publishedVersion: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type AgentVersion = {
  id: string;
  agentId: string;
  version: number;
  config: AgentRuntimeConfig;
  channels: AgentChannel[];
  note: string;
  createdAt: string;
  createdBy: string;
};

export type AgentApiKeyScope = "invoke";

export type AgentApiKey = {
  id: string;
  agentId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: AgentApiKeyScope[];
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type CustomerSource = "phone" | "wechat";

export type Customer = {
  id: string;
  userId: string;
  phone: string | null;
  wechatOpenId: string | null;
  nickname: string;
  avatarTone: string;
  source: CustomerSource;
  createdAt: string;
  lastLoginAt: string;
};

export type CustomerSession = {
  id: string;
  customerId: string;
  createdAt: string;
  expiresAt: string;
  ip: string;
  userAgent: string;
  revokedAt: string | null;
};

export type CustomerOtp = {
  phone: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
};

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditEvent = {
  id: string;
  ts: string;
  operatorId: string | null;
  operatorName: string;
  action: string;
  resource: string;
  detail: string;
  ip: string;
  userAgent: string;
  severity: AuditSeverity;
};

export type SessionRecord = {
  id: string;
  userId: string;
  messages: ChatMessage[];
  lastSlots: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AppState = {
  schemaVersion: number;
  createdAt: string;
  orders: Order[];
  carts: Record<string, Cart>;
  wishlists: Record<string, string[]>;
  profileOverrides: Record<string, Partial<UserProfile>>;
  events: BehaviorEvent[];
  sessions: Record<string, SessionRecord>;
  agentLogs: AgentLog[];
  agents: AgentDefinition[];
  agentVersions: AgentVersion[];
  agentApiKeys: AgentApiKey[];
  customers: Customer[];
  customerProfiles: Record<string, UserProfile>;
  customerSessions: Record<string, CustomerSession>;
  otps: Record<string, CustomerOtp>;
  auditLogs: AuditEvent[];
  idempotency: Record<string, { orderNo: string; createdAt: string }>;
  settings: AppSettings;
};

export const DEFAULT_SETTINGS: AppSettings = {
  personalization: true,
  realtimeSignals: true,
  explanations: true,
  agentEnabled: true,
  guardrails: true,
  llmTemperature: 0.4,
  maxToolsPerTurn: 4,
  minIntentConfidence: 0.45,
  trafficB: 100,
  weightsPreset: "balanced",
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
};
