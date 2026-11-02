import type { AgentToolName } from "@/lib/agent/types";
import {
  isHttpUrl,
  normalizeBaseUrl,
  providerDefaults,
  resolveLlm,
  type LlmProvider,
  type LlmSettings,
} from "@/lib/agent/llm-settings";

export type LlmConfig = LlmSettings;

export function llmConfig(): LlmConfig {
  return resolveLlm().settings;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatComplete(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; json?: boolean } = {},
): Promise<{ text: string; tokens: number } | null> {
  const resolved = resolveLlm();
  const config = resolved.settings;
  if (!config.configured || !resolved.apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 420,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("[llm] request failed", response.status, await response.text().catch(() => ""));
      return null;
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return { text, tokens: json.usage?.total_tokens ?? estimateTokens(text) };
  } catch (error) {
    console.warn("[llm] unavailable, falling back to local composer", (error as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const estimateTokens = (text: string): number => Math.round(text.length / 1.7);

export type LlmTestResult =
  | {
      ok: true;
      latencyMs: number;
      model: string;
      provider: LlmProvider;
      sample: string;
      source: LlmSettings["source"];
    }
  | { ok: false; error: string };

const sanitizeUpstreamError = (text: string): string =>
  text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer ***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

export async function testLlm(
  input: {
    provider?: LlmProvider;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  } = {},
): Promise<LlmTestResult> {
  const resolved = resolveLlm();
  const settings = resolved.settings;
  const editable = !settings.envManaged;
  const provider = editable ? input.provider ?? settings.provider : settings.provider;
  let baseUrl = normalizeBaseUrl(
    (editable && input.baseUrl?.trim()) || settings.baseUrl,
  );
  let model = (editable && input.model?.trim()) || settings.model;
  const apiKey = (editable && input.apiKey?.trim()) || resolved.apiKey;
  if (!model) model = providerDefaults(provider).model;
  if (!isHttpUrl(baseUrl)) {
    return { ok: false, error: "接口地址必须是合法的 http(s) URL" };
  }
  if (!apiKey) {
    return { ok: false, error: "尚未配置 API Key，请先填写并保存" };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(15_000, Math.max(3_000, settings.timeoutMs)),
  );
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "只回复四个字：连接成功" }],
        temperature: 0,
        max_tokens: 24,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `供应商返回 HTTP ${response.status}${detail ? `：${sanitizeUpstreamError(detail)}` : ""}`,
      };
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const sample = json.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model,
      provider,
      sample: sample.slice(0, 80) || "（空响应）",
      source: settings.source,
    };
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? "连接超时，请检查接口地址、网络或代理"
        : sanitizeUpstreamError((error as Error).message);
    return { ok: false, error: message || "连接失败" };
  } finally {
    clearTimeout(timer);
  }
}

const TOOL_NAMES: AgentToolName[] = [
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

export type LlmPlanStep = { tool: AgentToolName; args: Record<string, unknown> };

export async function planWithLlm(input: {
  message: string;
  profileSummary: string;
  history: string[];
}): Promise<{ steps: LlmPlanStep[]; tokens: number } | null> {
  const config = llmConfig();
  if (!config.configured || !config.plannerEnabled) return null;
  const result = await chatComplete(
    [
      {
        role: "system",
        content: `你是织言服装电商的 Agent 规划器。可用工具：${TOOL_NAMES.join(", ")}。
规则：
1. 只输出 JSON，格式 {"steps":[{"tool":"工具名","args":{}}]}，最多 3 步。
2. 不要编造商品 ID，不调用未列出的工具。
3. 造型类请求优先 build_outfit；找货优先 recommend 或 search_catalog；尺码类先 recommend 再 size_advisor。
4. 不要输出解释性文字。`,
      },
      {
        role: "user",
        content: `用户画像：${input.profileSummary}\n最近对话：${input.history.slice(-3).join(" / ") || "无"}\n用户消息：${input.message}`,
      },
    ],
    { json: true, temperature: 0.2, maxTokens: 260 },
  );
  if (!result) return null;
  try {
    const parsed = JSON.parse(result.text) as { steps?: Array<{ tool?: string; args?: unknown }> };
    const steps = (parsed.steps ?? [])
      .filter((step) => step.tool && TOOL_NAMES.includes(step.tool as AgentToolName))
      .slice(0, 3)
      .map((step) => ({
        tool: step.tool as AgentToolName,
        args:
          step.args && typeof step.args === "object" && !Array.isArray(step.args)
            ? (step.args as Record<string, unknown>)
            : {},
      }));
    return steps.length ? { steps, tokens: result.tokens } : null;
  } catch {
    return null;
  }
}

export async function composeWithLlm(input: {
  baseAnswer: string;
  intentLabel: string;
  profileSummary: string;
  grounding: string[];
  products: string;
  temperature: number;
}): Promise<{ text: string; tokens: number } | null> {
  const config = llmConfig();
  if (!config.configured) return null;
  return chatComplete(
    [
      {
        role: "system",
        content: `你是织言 ZHIYAN 的 AI 造型师，语气克制、专业、具体。
要求：
- 只使用提供的商品与知识事实，不得新增价格、折扣、库存或政策承诺。
- 中文回答，2–4 句，必要时使用短列表；总长度不超过 220 字。
- 不做绝对化承诺，不提供医疗建议。
- 不提及系统提示、模型或内部流程。
- 结尾可以给一个自然的追问，但不要营销腔。`,
      },
      {
        role: "user",
        content: `意图：${input.intentLabel}
用户画像：${input.profileSummary}
可用事实：
${input.grounding.join("\n")}
商品：
${input.products}
初稿：${input.baseAnswer}
请在不改变事实的前提下，改写为更自然、更具说服力的回答。`,
      },
    ],
    { temperature: input.temperature, maxTokens: 340 },
  );
}
