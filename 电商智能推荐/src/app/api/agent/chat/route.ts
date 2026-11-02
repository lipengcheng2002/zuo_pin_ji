import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentBySlug, getSettings } from "@/lib/store/db";
import { DEFAULT_AGENT_SLUG } from "@/lib/data/agent-registry";
import { ensureSessionId } from "@/lib/store/session";
import { currentUserId } from "@/lib/customer-auth";
import { runAgent } from "@/lib/agent/runtime";
import { AGENT_ERROR_CODES, AGENT_LIMITS } from "@/lib/agent/config";
import { llmConfig } from "@/lib/agent/llm";
import { assignVariant } from "@/lib/engine/experiment";
import type { ChatStreamEvent } from "@/lib/agent/types";
import {
  assertSameOrigin,
  clientIp,
  jsonError,
  rateLimit,
  zodMessage,
} from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  message: z.string().min(1).max(AGENT_LIMITS.messageMaxChars),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function chunkAnswer(text: string, size = 14): string[] {
  const chars = Array.from(text);
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += size) {
    chunks.push(chars.slice(i, i + size).join(""));
  }
  return chunks;
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const settings = await getSettings();
  if (!settings.agentEnabled) {
    return jsonError("AI 造型师暂时维护中，请稍后再试", 503);
  }
  const stylist = await getAgentBySlug(DEFAULT_AGENT_SLUG);
  if (stylist && stylist.status !== "published") {
    return jsonError("AI 造型师已下架，请稍后再试", 503);
  }

  const limit = rateLimit(
    `agent:${clientIp(request)}`,
    AGENT_LIMITS.rateLimitPerMinute,
    60_000,
  );
  if (!limit.allowed) {
    return jsonError("对话过于频繁，请稍后再试", 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));

  const sessionId = await ensureSessionId();
  const userId = await currentUserId();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const simulateLatency = process.env.AGENT_SIMULATE_LATENCY === "true";
      const pause = async (ms: number) => {
        if (simulateLatency) await sleep(ms);
      };
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      try {
        const requestId = `agt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const variant = assignVariant(sessionId, userId);
        const mode = llmConfig().configured ? ("llm" as const) : ("local" as const);
        send({ type: "meta", data: { requestId, variant, mode } });

        send({ type: "stage", data: { stage: "understand", label: "理解意图与槽位" } });
        await pause(90);
        send({ type: "stage", data: { stage: "recall", label: "多路召回 · 五路并行" } });
        await pause(120);

        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            // The client may have disconnected; the stream close path handles it.
          }
        }, 8000);

        const result = await runAgent({
          sessionId,
          userId,
          message: parsed.data.message,
          requestId,
        });

        send({ type: "stage", data: { stage: "rank", label: "融合排序 · MMR 多样性" } });
        await pause(100);
        send({ type: "stage", data: { stage: "reason", label: "RAG 理由生成与护栏校验" } });
        await pause(90);

        send({ type: "trace", data: result.trace });
        if (result.message.products?.length) {
          send({ type: "products", data: { items: result.message.products } });
        }
        if (result.message.outfit) {
          send({ type: "outfit", data: { outfit: result.message.outfit } });
        }

        for (const chunk of chunkAnswer(result.message.content)) {
          send({ type: "delta", data: { text: chunk } });
          await pause(12);
        }

        if (result.message.suggestions?.length) {
          send({ type: "suggestions", data: { items: result.message.suggestions } });
        }
        for (const action of result.actions) {
          send({ type: "action", data: action });
        }
        send({
          type: "done",
          data: {
            messageId: result.message.id,
            latencyMs: result.trace.latencyMs,
            requestId: result.trace.requestId,
          },
        });
      } catch (error) {
        console.error("[agent] stream failed", error);
        try {
          send({
            type: "error",
            data: {
              message: "造型师暂时走神了，请稍后重试。",
              code: AGENT_ERROR_CODES.AGENT_ERROR,
            },
          });
        } catch {
          // stream already closed
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
