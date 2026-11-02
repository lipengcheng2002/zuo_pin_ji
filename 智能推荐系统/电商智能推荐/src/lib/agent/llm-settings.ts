import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_LLM_SETTINGS,
  PROVIDER_DEFAULTS,
  type LlmProvider,
  type LlmSettings,
  type StoredLlmSettings,
} from "@/lib/agent/llm-shared";

export type {
  LlmProvider,
  LlmSettings,
  LlmSource,
  StoredLlmSettings,
} from "@/lib/agent/llm-shared";
export { LLM_PROVIDERS, PROVIDER_DEFAULTS } from "@/lib/agent/llm-shared";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const CIPHER_PREFIX = "v1";

let cachedKey: { material: string; key: Buffer } | null = null;

const dataDir = (): string => process.env.DATA_DIR ?? DATA_DIR;

export function providerDefaults(provider: LlmProvider) {
  return PROVIDER_DEFAULTS[provider];
}

export function inferProvider(baseUrl: string): LlmProvider {
  const host = baseUrl.toLowerCase();
  if (host.includes("deepseek")) return "deepseek";
  if (host.includes("openai.com")) return "openai";
  return "custom";
}

export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "已保存";
  return `••••${trimmed.slice(-4)}`;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function localEncryptionKey(create: boolean): Buffer | null {
  const secret = process.env.LLM_CONFIG_SECRET?.trim();
  if (secret) {
    if (cachedKey?.material !== `secret:${secret}`) {
      cachedKey = {
        material: `secret:${secret}`,
        key: scryptSync(secret, "zhiyan-llm-config-v1", 32),
      };
    }
    return cachedKey.key;
  }
  try {
    const file = path.join(dataDir(), ".llm-key");
    if (!existsSync(file)) {
      if (!create) return null;
      mkdirSync(dataDir(), { recursive: true });
      writeFileSync(file, randomBytes(32), { mode: 0o600 });
      try {
        chmodSync(file, 0o600);
      } catch {
        // Best effort on platforms without POSIX modes.
      }
    }
    const material = `file:${file}`;
    if (cachedKey?.material !== material) {
      cachedKey = { material, key: readFileSync(file) };
    }
    return cachedKey.key.length === 32 ? cachedKey.key : null;
  } catch {
    return null;
  }
}

export function encryptApiKey(plain: string): string | null {
  const key = localEncryptionKey(true);
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CIPHER_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptApiKey(payload: string): string | null {
  try {
    const [version, iv, tag, encrypted] = payload.split(".");
    if (version !== CIPHER_PREFIX || !iv || !tag || !encrypted) return null;
    const key = localEncryptionKey(false);
    if (!key) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function sanitizeStored(raw: unknown): StoredLlmSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LLM_SETTINGS };
  const input = raw as Partial<StoredLlmSettings>;
  const provider: LlmProvider =
    input.provider === "openai" || input.provider === "custom"
      ? input.provider
      : "deepseek";
  const defaults = providerDefaults(provider);
  return {
    version: 1,
    enabled: Boolean(input.enabled),
    provider,
    baseUrl:
      typeof input.baseUrl === "string" && input.baseUrl.trim()
        ? normalizeBaseUrl(input.baseUrl)
        : defaults.baseUrl,
    model:
      typeof input.model === "string" && input.model.trim()
        ? input.model.trim()
        : defaults.model,
    plannerEnabled: Boolean(input.plannerEnabled),
    apiKeyEnc: typeof input.apiKeyEnc === "string" ? input.apiKeyEnc : null,
    apiKeyHint: typeof input.apiKeyHint === "string" ? input.apiKeyHint : null,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    updatedBy: typeof input.updatedBy === "string" ? input.updatedBy : null,
  };
}

export function readStoredLlmSettings(): StoredLlmSettings {
  try {
    const raw = readFileSync(path.join(dataDir(), "llm-config.json"), "utf8");
    return sanitizeStored(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
}

export async function writeStoredLlmSettings(
  settings: StoredLlmSettings,
): Promise<void> {
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "llm-config.json");
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  try {
    await fs.chmod(file, 0o600);
  } catch {
    // Best effort on Windows.
  }
}

function envKey(): string {
  return (
    process.env.LLM_API_KEY?.trim() ||
    process.env.DEEPSEEK_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}

function envProvider(): LlmProvider {
  const baseUrl = process.env.LLM_BASE_URL?.trim() ?? "";
  if (baseUrl) return inferProvider(baseUrl);
  if (process.env.DEEPSEEK_API_KEY?.trim()) return "deepseek";
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  return "custom";
}

function envDefaults(provider: LlmProvider) {
  if (provider === "custom") {
    return { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" };
  }
  return providerDefaults(provider);
}

function providerLabel(provider: LlmProvider): string {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "openai") return "OpenAI";
  return "OpenAI-compatible";
}

export type ResolvedLlm = {
  settings: LlmSettings;
  apiKey: string;
};

/**
 * Environment variables take precedence over the console store so operators can
 * lock the model gateway without depending on mutable application state.
 */
export function resolveLlm(): ResolvedLlm {
  const key = envKey();
  if (key) {
    const provider = envProvider();
    const defaults = envDefaults(provider);
    const baseUrl = normalizeBaseUrl(
      process.env.LLM_BASE_URL?.trim() || defaults.baseUrl,
    );
    const model = process.env.LLM_MODEL?.trim() || defaults.model;
    return {
      apiKey: key,
      settings: {
        configured: true,
        enabled: true,
        envManaged: true,
        source: "env",
        provider,
        providerLabel: providerLabel(provider),
        baseUrl,
        model,
        timeoutMs: timeoutMs(),
        plannerEnabled: process.env.LLM_PLANNER === "true",
        hasKey: true,
        keyHint: "环境变量",
        updatedAt: null,
        updatedBy: "environment",
        warning: null,
      },
    };
  }

  const stored = readStoredLlmSettings();
  const decrypted = stored.apiKeyEnc ? decryptApiKey(stored.apiKeyEnc) : null;
  const warning =
    stored.apiKeyEnc && !decrypted
      ? "已保存的 API Key 无法解密；请重新填写（可能更换了 LLM_CONFIG_SECRET 或密钥文件）。"
      : null;
  return {
    apiKey: decrypted ?? "",
    settings: {
      configured: Boolean(decrypted) && stored.enabled,
      enabled: stored.enabled,
      envManaged: false,
      source: decrypted ? "console" : "none",
      provider: stored.provider,
      providerLabel: providerLabel(stored.provider),
      baseUrl: stored.baseUrl,
      model: stored.model,
      timeoutMs: timeoutMs(),
      plannerEnabled: stored.plannerEnabled,
      hasKey: Boolean(decrypted),
      keyHint: stored.apiKeyHint,
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
      warning,
    },
  };
}

export function timeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS ?? 9000);
  if (!Number.isFinite(raw)) return 9000;
  return Math.min(30_000, Math.max(2_000, Math.round(raw)));
}

export type SaveLlmInput = {
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  plannerEnabled: boolean;
  apiKey?: string;
  clearKey?: boolean;
  updatedBy: string;
};

export async function saveLlmSettings(
  input: SaveLlmInput,
): Promise<{ ok: true; settings: LlmSettings } | { ok: false; error: string }> {
  const current = readStoredLlmSettings();
  let apiKeyEnc = current.apiKeyEnc;
  let apiKeyHint = current.apiKeyHint;

  if (input.clearKey) {
    apiKeyEnc = null;
    apiKeyHint = null;
  }
  const provided = input.apiKey?.trim();
  if (provided) {
    if (provided.length < 8) {
      return { ok: false, error: "API Key 长度不足，请检查是否粘贴完整" };
    }
    const encrypted = encryptApiKey(provided);
    if (!encrypted) {
      return { ok: false, error: "无法加密 API Key，请检查数据目录写入权限" };
    }
    apiKeyEnc = encrypted;
    apiKeyHint = maskKey(provided);
  }
  if (input.enabled && !apiKeyEnc) {
    return { ok: false, error: "启用 LLM 前请填写 API Key" };
  }

  const next: StoredLlmSettings = {
    version: 1,
    enabled: input.enabled,
    provider: input.provider,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model.trim(),
    plannerEnabled: input.plannerEnabled,
    apiKeyEnc,
    apiKeyHint,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
  };
  await writeStoredLlmSettings(next);
  return { ok: true, settings: resolveLlm().settings };
}
