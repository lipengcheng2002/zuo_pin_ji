import { describe, expect, it } from "vitest";
import { generateAgentApiKey, hashAgentApiKey } from "@/lib/agents/admin";
import {
  createAgentKeySchema,
  createAgentSchema,
  rollbackAgentSchema,
} from "@/lib/agents/validation";

describe("agent registry validation", () => {
  it("accepts a valid draft with a runtime config", () => {
    const parsed = createAgentSchema.safeParse({
      slug: "stylist-canary",
      name: "造型师灰度",
      channels: ["api"],
      config: {
        promptVersion: "stylist-sp-2026.10.3",
        provider: "ZHIYAN Local",
        model: "zhiyan-local-planner-v2",
        planner: false,
        temperature: 0.4,
        maxToolsPerTurn: 4,
        minIntentConfidence: 0.45,
        tools: ["recommend", "build_outfit"],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsafe slugs and unknown tools", () => {
    expect(createAgentSchema.safeParse({ slug: "Bad Slug", name: "x" }).success).toBe(false);
    const unknownTool = createAgentSchema.safeParse({
      slug: "valid-slug",
      name: "valid",
      config: {
        promptVersion: "v1",
        provider: "p",
        model: "m",
        planner: false,
        temperature: 0.4,
        maxToolsPerTurn: 4,
        minIntentConfidence: 0.45,
        tools: ["shell_exec"],
      },
    });
    expect(unknownTool.success).toBe(false);
  });

  it("constrains rollback versions and key scopes", () => {
    expect(rollbackAgentSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(rollbackAgentSchema.safeParse({ version: 2 }).success).toBe(true);
    expect(createAgentKeySchema.safeParse({ scopes: ["admin"] }).success).toBe(false);
    expect(createAgentKeySchema.safeParse({ scopes: ["invoke"] }).success).toBe(true);
  });

  it("generates one-time keys whose stored hash cannot reveal the token", () => {
    const generated = generateAgentApiKey();
    expect(generated.token.startsWith("zya_")).toBe(true);
    expect(generated.prefix).toHaveLength(12);
    expect(generated.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.hash).not.toContain(generated.token);
    expect(hashAgentApiKey(generated.token)).toBe(generated.hash);
    expect(hashAgentApiKey(`${generated.token}x`)).not.toBe(generated.hash);
  });
});
