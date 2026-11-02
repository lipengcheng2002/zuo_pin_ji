import { agentMeta } from "@/lib/agent/runtime";
import { TOOL_CATALOG } from "@/lib/agent/tools";
import {
  AGENT_API_VERSION,
  AGENT_GUARDRAILS,
  AGENT_LIMITS,
  AGENT_SERVICE_NAME,
  AGENT_SERVICE_VERSION,
  SSE_EVENTS,
  WRITE_TOOLS,
} from "@/lib/agent/config";
import { knowledgeCorpus } from "@/lib/engine/knowledge";
import { NO_STORE } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const meta = await agentMeta();
  const corpus = knowledgeCorpus();
  const docs = corpus.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.type] = (acc[doc.type] ?? 0) + 1;
    return acc;
  }, {});

  return Response.json(
    {
      service: AGENT_SERVICE_NAME,
      serviceVersion: AGENT_SERVICE_VERSION,
      apiVersion: AGENT_API_VERSION,
      promptVersion: meta.promptVersion,
      generatedAt: new Date().toISOString(),
      status: {
        enabled: meta.enabled,
        mode: meta.mode,
        provider: meta.provider,
        model: meta.model,
        planner: meta.planner,
      },
      transport: {
        type: "sse",
        contentType: "text/event-stream",
        events: SSE_EVENTS,
        heartbeatSeconds: 8,
      },
      auth: {
        sessionCookie: "zy_sid",
        required: false,
        note: "Anonymous sessions are created on first turn; member identity is separate.",
      },
      limits: {
        ...AGENT_LIMITS,
        maxToolsPerTurn: meta.maxToolsPerTurn,
        minIntentConfidence: meta.minIntentConfidence,
      },
      guardrails: AGENT_GUARDRAILS,
      tools: TOOL_CATALOG.map((tool) => ({
        ...tool,
        writes: WRITE_TOOLS.has(tool.name),
      })),
      knowledge: {
        total: corpus.length,
        byType: docs,
      },
    },
    { headers: NO_STORE },
  );
}
