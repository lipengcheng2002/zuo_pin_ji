import { z } from "zod";
import { AGENT_TOOL_NAMES } from "@/lib/agent/config";

const toolEnum = z.enum(
  AGENT_TOOL_NAMES as unknown as [string, ...string[]],
);

const channelEnum = z.enum(["web", "api", "mini_program"]);

export const agentConfigSchema = z.object({
  promptVersion: z.string().min(1).max(80),
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  planner: z.boolean(),
  temperature: z.number().min(0).max(1),
  maxToolsPerTurn: z.number().int().min(1).max(6),
  minIntentConfidence: z.number().min(0).max(0.95),
  tools: z.array(toolEnum).min(1).max(AGENT_TOOL_NAMES.length),
});

export const agentSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{2,48}$/, "slug 只能包含小写字母、数字和连字符");

export const createAgentSchema = z.object({
  slug: agentSlugSchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  owner: z.string().trim().max(80).optional(),
  channels: z.array(channelEnum).min(1).max(3).default(["web", "api"]),
  config: agentConfigSchema.optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  owner: z.string().trim().max(80).optional(),
  channels: z.array(channelEnum).min(1).max(3).optional(),
  config: agentConfigSchema.optional(),
});

export const publishAgentSchema = z.object({
  note: z.string().trim().max(200).optional(),
});

export const rollbackAgentSchema = z.object({
  version: z.number().int().min(1),
});

export const createAgentKeySchema = z.object({
  name: z.string().trim().min(1).max(60).default("default"),
  scopes: z.array(z.enum(["invoke"])).min(1).max(1).default(["invoke"]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
