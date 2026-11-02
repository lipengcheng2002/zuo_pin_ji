#!/usr/bin/env node
import { readFileSync } from "node:fs";

const BASE = (process.env.AGENT_BASE_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/+$/,
  "",
);
const TOKEN = process.env.AGENT_ADMIN_TOKEN ?? "";

const args = process.argv.slice(2);
const command = args.shift();
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  } else {
    positional.push(arg);
  }
}

const configFile = flags.config ? JSON.parse(readFileSync(flags.config, "utf8")) : undefined;

const request = async (method, path, body) => {
  if (!TOKEN) {
    console.error("AGENT_ADMIN_TOKEN is required");
    process.exit(2);
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    console.error(`HTTP ${response.status}`, JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
};

const channels = flags.channels
  ? String(flags.channels)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  : undefined;

const main = async () => {
  switch (command) {
    case "list":
      console.log(JSON.stringify(await request("GET", "/api/agents"), null, 2));
      break;
    case "get":
      console.log(
        JSON.stringify(await request("GET", `/api/agents/${positional[0]}`), null, 2),
      );
      break;
    case "create": {
      if (!flags.slug || !flags.name) throw new Error("create requires --slug and --name");
      console.log(
        JSON.stringify(
          await request("POST", "/api/agents", {
            slug: flags.slug,
            name: flags.name,
            description: flags.description ?? "",
            owner: flags.owner,
            channels,
            config: configFile,
          }),
          null,
          2,
        ),
      );
      break;
    }
    case "update": {
      console.log(
        JSON.stringify(
          await request("PATCH", `/api/agents/${positional[0]}`, {
            name: flags.name,
            description: flags.description,
            owner: flags.owner,
            channels,
            config: configFile,
          }),
          null,
          2,
        ),
      );
      break;
    }
    case "publish":
      console.log(
        JSON.stringify(
          await request("POST", `/api/agents/${positional[0]}/publish`, {
            note: flags.note ?? "",
          }),
          null,
          2,
        ),
      );
      break;
    case "unpublish":
      console.log(
        JSON.stringify(
          await request("POST", `/api/agents/${positional[0]}/unpublish`),
          null,
          2,
        ),
      );
      break;
    case "versions":
      console.log(
        JSON.stringify(
          await request("GET", `/api/agents/${positional[0]}/versions`),
          null,
          2,
        ),
      );
      break;
    case "rollback":
      console.log(
        JSON.stringify(
          await request("POST", `/api/agents/${positional[0]}/rollback`, {
            version: Number(flags.version),
          }),
          null,
          2,
        ),
      );
      break;
    case "key:list":
      console.log(
        JSON.stringify(
          await request("GET", `/api/agents/${positional[0]}/keys`),
          null,
          2,
        ),
      );
      break;
    case "key:create":
      console.log(
        JSON.stringify(
          await request("POST", `/api/agents/${positional[0]}/keys`, {
            name: flags.name ?? "default",
            scopes: ["invoke"],
            expiresInDays: flags.days ? Number(flags.days) : undefined,
          }),
          null,
          2,
        ),
      );
      break;
    case "key:revoke":
      console.log(
        JSON.stringify(
          await request("DELETE", `/api/agents/${positional[0]}/keys/${positional[1]}`),
          null,
          2,
        ),
      );
      break;
    default:
      console.log(`Usage:
  AGENT_ADMIN_TOKEN=... node scripts/agent-admin.mjs list
  ... get <agentId>
  ... create --slug zhiyan-stylist-v2 --name "..." [--config config.json] [--channels web,api]
  ... update <agentId> [--config config.json] [--name ...]
  ... publish <agentId> [--note "..."]
  ... unpublish <agentId>
  ... versions <agentId>
  ... rollback <agentId> --version <n>
  ... key:create <agentId> --name "web-prod" [--days 90]
  ... key:list <agentId>
  ... key:revoke <agentId> <keyId>`);
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
