import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  DATA_DIR: z.string().min(1).optional(),
  DATABASE_URL: z.string().optional(),
  PGSSL: z.enum(["true", "false"]).optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_PLANNER: z.enum(["true", "false"]).optional(),
  LLM_TIMEOUT_MS: z.string().regex(/^\d+$/).optional(),
  LLM_CONFIG_SECRET: z.string().min(16).optional(),
  DEMO_AUTH: z.enum(["true", "false"]).optional(),
  DEMO_OTP_CODE: z.string().regex(/^\d{6}$/).optional(),
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().min(16).optional(),
  WECHAT_OAUTH_SCOPE: z.enum(["snsapi_userinfo", "snsapi_base"]).optional(),
  AGENT_SERVICE_VERSION: z.string().optional(),
  AGENT_SIMULATE_LATENCY: z.enum(["true", "false"]).optional(),
  AGENT_ENABLED: z.enum(["true", "false"]).optional(),
  OPS_TOKEN: z.string().min(16).optional(),
  AGENT_ADMIN_TOKEN: z.string().min(16).optional(),
});

export type EnvReport = {
  ok: boolean;
  warnings: string[];
  errors: string[];
  values: z.infer<typeof schema>;
};

export function validateEnv(): EnvReport {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    return {
      ok: false,
      warnings: [],
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "env"}: ${issue.message}`,
      ),
      values: {} as z.infer<typeof schema>,
    };
  }
  const env = parsed.data;
  const warnings: string[] = [];
  const errors: string[] = [];

  if (env.DATABASE_URL && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    errors.push("DATABASE_URL must use the postgres:// or postgresql:// scheme");
  }
  if (env.NODE_ENV === "production") {
    if (!env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_SITE_URL.includes("localhost")) {
      warnings.push("NEXT_PUBLIC_SITE_URL is not a production domain; canonical/OG URLs will be local.");
    }
    if (!env.DATABASE_URL) {
      warnings.push(
        "File storage is single-writer; use DATABASE_URL for multi-instance deployments.",
      );
    }
    if (env.DEMO_AUTH !== "false") {
      warnings.push(
        "DEMO_AUTH is enabled: WeChat login is simulated and phone OTP falls back to the demo code. Disable it and connect real providers before public traffic.",
      );
    }
    if (env.WECHAT_APP_ID && !env.WECHAT_APP_SECRET) {
      warnings.push("WECHAT_APP_ID is set without WECHAT_APP_SECRET; WeChat OAuth is disabled.");
    }
    if (env.WECHAT_APP_ID && env.WECHAT_APP_SECRET && (!env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_SITE_URL.includes("localhost"))) {
      warnings.push(
        "WeChat OAuth callback must be a public HTTPS URL registered in WeChat Open Platform; the current site URL is local.",
      );
    }
  }
  return { ok: errors.length === 0, warnings, errors, values: env };
}
