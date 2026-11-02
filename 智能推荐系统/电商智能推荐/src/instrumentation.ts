export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv } = await import("@/lib/env");
  const report = validateEnv();
  if (!report.ok) {
    for (const error of report.errors) console.error(`[env] ${error}`);
  }
  for (const warning of report.warnings) console.warn(`[env] ${warning}`);
  console.info(
    `[boot] zhiyan storage=${process.env.DATABASE_URL ? "postgres" : "file"} llm=${process.env.LLM_API_KEY ? "configured" : "local"}`,
  );
}
