export type LlmProvider = "deepseek" | "openai" | "custom";
export type LlmSource = "env" | "console" | "none";

export type LlmSettings = {
  configured: boolean;
  enabled: boolean;
  envManaged: boolean;
  source: LlmSource;
  provider: LlmProvider;
  providerLabel: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  plannerEnabled: boolean;
  hasKey: boolean;
  keyHint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  warning: string | null;
};

export type StoredLlmSettings = {
  version: 1;
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  plannerEnabled: boolean;
  apiKeyEnc: string | null;
  apiKeyHint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const LLM_PROVIDERS: Array<{ id: LlmProvider; label: string; note: string }> = [
  { id: "deepseek", label: "DeepSeek", note: "OpenAI 兼容 · 推荐" },
  { id: "openai", label: "OpenAI", note: "官方 Chat Completions" },
  { id: "custom", label: "自定义", note: "任意 OpenAI 兼容网关" },
];

export const PROVIDER_DEFAULTS: Record<
  LlmProvider,
  { baseUrl: string; model: string }
> = {
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  custom: { baseUrl: "https://api.example.com/v1", model: "model-name" },
};

export const DEFAULT_LLM_SETTINGS: StoredLlmSettings = {
  version: 1,
  enabled: false,
  provider: "deepseek",
  baseUrl: PROVIDER_DEFAULTS.deepseek.baseUrl,
  model: PROVIDER_DEFAULTS.deepseek.model,
  plannerEnabled: false,
  apiKeyEnc: null,
  apiKeyHint: null,
  updatedAt: null,
  updatedBy: null,
};
