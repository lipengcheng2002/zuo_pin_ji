# Security Policy

## Scope

This repository contains a complete commerce and Agent implementation built with synthetic products, users, orders and metrics. It is not a turnkey production commerce system.

Before a real deployment, read:

- [`电商智能推荐/docs/security.md`](电商智能推荐/docs/security.md)
- [`电商智能推荐/docs/production-readiness-gap.md`](电商智能推荐/docs/production-readiness-gap.md)
- [`电商智能推荐/docs/agent-service-contract.md`](电商智能推荐/docs/agent-service-contract.md)

## Reporting

Please do not open a public issue containing:

- API keys, tokens, cookies or customer data;
- exploitable details that could affect a deployed instance.

Send a private report to the repository owner with the affected version, reproduction steps and impact. Do not include real secrets in the report.

## Secrets

- Never commit `.env`, `.data/`, `.llm-key`, `llm-config.json`, model API keys, `AGENT_ADMIN_TOKEN` or `OPS_TOKEN`.
- Use environment variables or a secret manager.
- If a key is exposed, rotate it immediately; this project cannot revoke third-party model keys for you.

## Public deployment

For a public environment, keep management tokens unset so `/api/agents/*` and `/api/ops/*` are disabled. Use the local deterministic planner if a real model key should not be exposed.
