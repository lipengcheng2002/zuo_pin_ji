import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "zhiyan-llm-"));
const original = {
  DATA_DIR: process.env.DATA_DIR,
  LLM_API_KEY: process.env.LLM_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  LLM_BASE_URL: process.env.LLM_BASE_URL,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_PLANNER: process.env.LLM_PLANNER,
  LLM_CONFIG_SECRET: process.env.LLM_CONFIG_SECRET,
};

process.env.DATA_DIR = dir;
delete process.env.LLM_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.LLM_BASE_URL;
delete process.env.LLM_MODEL;
delete process.env.LLM_PLANNER;
delete process.env.LLM_CONFIG_SECRET;

const mod = await import("./llm-settings");

beforeEach(() => {
  delete process.env.LLM_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_PLANNER;
  delete process.env.LLM_CONFIG_SECRET;
});

afterAll(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("llm provider helpers", () => {
  it("masks keys without exposing the middle", () => {
    expect(mod.maskKey("sk-1234567890abcd")).toBe("••••abcd");
    expect(mod.maskKey("short")).toBe("已保存");
  });

  it("validates gateway URLs and infers known providers", () => {
    expect(mod.isHttpUrl("https://api.deepseek.com/v1")).toBe(true);
    expect(mod.isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(mod.inferProvider("https://api.deepseek.com/v1")).toBe("deepseek");
    expect(mod.inferProvider("https://api.openai.com/v1")).toBe("openai");
    expect(mod.inferProvider("https://gateway.internal/v1")).toBe("custom");
  });
});

describe("console LLM credentials", () => {
  it("encrypts the key at rest and decrypts it for runtime use", async () => {
    const saved = await mod.saveLlmSettings({
      enabled: true,
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      plannerEnabled: false,
      apiKey: "sk-test-1234567890",
      updatedBy: "测试管理员",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.settings.configured).toBe(true);
    expect(saved.settings.hasKey).toBe(true);
    expect(saved.settings.keyHint).toBe("••••7890");

    const raw = readFileSync(path.join(dir, "llm-config.json"), "utf8");
    expect(raw).not.toContain("sk-test-1234567890");
    expect(raw).toContain("apiKeyEnc");

    const resolved = mod.resolveLlm();
    expect(resolved.apiKey).toBe("sk-test-1234567890");
    expect(resolved.settings.source).toBe("console");
  });

  it("rejects enabling without a key and does not return one", async () => {
    const rejected = await mod.saveLlmSettings({
      enabled: true,
      provider: "custom",
      baseUrl: "https://gateway.internal/v1",
      model: "model-a",
      plannerEnabled: false,
      clearKey: true,
      updatedBy: "测试管理员",
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toContain("API Key");

    const publicSettings = mod.resolveLlm().settings;
    expect(JSON.stringify(publicSettings)).not.toContain("sk-test");
  });

  it("lets environment variables override console configuration", async () => {
    process.env.OPENAI_API_KEY = "sk-env-1234567890";
    const settings = mod.resolveLlm().settings;
    expect(settings.envManaged).toBe(true);
    expect(settings.source).toBe("env");
    expect(settings.provider).toBe("openai");
    expect(settings.baseUrl).toBe("https://api.openai.com/v1");
    expect(settings.model).toBe("gpt-4o-mini");
    expect(settings.keyHint).toBe("环境变量");
  });
});
