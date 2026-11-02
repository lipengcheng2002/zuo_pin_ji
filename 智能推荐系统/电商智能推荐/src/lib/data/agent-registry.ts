import { AGENT_TOOL_NAMES, PROMPT_VERSION } from "@/lib/agent/config";
import type { AgentDefinition, AgentVersion } from "@/lib/store/types";

export const DEFAULT_AGENT_ID = "agent_stylist";
export const DEFAULT_AGENT_SLUG = "zhiyan-stylist";
export const DEFAULT_AGENT_VERSION = 1;

const now = new Date().toISOString();

export const defaultAgent = (): AgentDefinition => ({
  id: DEFAULT_AGENT_ID,
  slug: DEFAULT_AGENT_SLUG,
  name: "织言 AI 造型师",
  description: "面向服装电商的个性化搭配、尺码、政策与购物助手。",
  owner: "agent-team",
  adapter: "stylist",
  status: "published",
  channels: ["web", "api"],
  config: {
    promptVersion: PROMPT_VERSION,
    provider: "ZHIYAN Local",
    model: "zhiyan-local-planner-v2",
    planner: false,
    temperature: 0.4,
    maxToolsPerTurn: 4,
    minIntentConfidence: 0.45,
    tools: [...AGENT_TOOL_NAMES],
  },
  currentVersion: DEFAULT_AGENT_VERSION,
  publishedVersion: DEFAULT_AGENT_VERSION,
  createdAt: now,
  updatedAt: now,
  createdBy: "system",
  updatedBy: "system",
});

export const defaultAgentVersion = (): AgentVersion => {
  const agent = defaultAgent();
  return {
    id: `${DEFAULT_AGENT_ID}_v${DEFAULT_AGENT_VERSION}`,
    agentId: DEFAULT_AGENT_ID,
    version: DEFAULT_AGENT_VERSION,
    config: agent.config,
    channels: agent.channels,
    note: "首个已发布版本",
    createdAt: now,
    createdBy: "system",
  };
};

export const seedAgents = (): AgentDefinition[] => [defaultAgent()];
export const seedAgentVersions = (): AgentVersion[] => [defaultAgentVersion()];
