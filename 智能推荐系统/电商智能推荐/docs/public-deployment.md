# 公开部署形态

> Render Blueprint、Docker/VPS 的公开部署拓扑、持久化边界与安全约束。

## 1. Render Blueprint

仓库根目录的 `render.yaml` 使用 Docker Runtime 构建 `电商智能推荐/Dockerfile`，健康检查为 `/api/health`，默认配置：

| 配置 | 值 | 说明 |
| --- | --- | --- |
| `plan` | `free` | 免费实例会休眠，冷启动较慢 |
| `DATA_DIR` | `/tmp/zhiyan-data` | 免费实例无持久磁盘，重启/休眠后业务数据重置 |
| `DEMO_AUTH` | `true` | 测试登录；生产改为真实微信/短信 |
| `AGENT_ENABLED` | `true` | 开放 Agent 对话 |
| `AGENT_SIMULATE_LATENCY` | `false` | 关闭人为延迟 |

公开环境默认不配置 `LLM_API_KEY`，使用本地确定性规划器，避免 Key 暴露与模型费用；不配置 `AGENT_ADMIN_TOKEN` / `OPS_TOKEN`，管理端与 Ops API 不开放。

需要持久化购物袋、订单与画像时，应使用付费实例和持久磁盘，将 `DATA_DIR` 改为挂载点（例如 `/data`）。

## 2. Docker / VPS

使用项目内 Dockerfile 构建镜像，容器暴露 3000 端口。部署侧需要：

- 持久卷挂载 `/data`，并设置 `DATA_DIR=/data`；
- 反向代理对 `/api/agent/chat` 关闭 `proxy_buffering`，保证 SSE 实时输出；
- `NEXT_PUBLIC_SITE_URL` 设置为公开 HTTPS 域名，微信 OAuth 回调域与之一致；
- 数据库引入 PostgreSQL 时设置 `DATABASE_URL`，多实例需要事务与共享会话；
- 公网只暴露用户端；管理端、OMS 与真实模型 Key 放在内网、VPN 或独立网关后。

## 3. 请求拓扑

```text
Internet
  → TLS / CDN / WAF
  → Nginx / Ingress（SSE 不缓冲）
  → Next.js Route Handlers
      → Agent Runtime
      → Recommendation Engine
      → Store（JSON 文件或 PostgreSQL）
  → /api/health /api/metrics /api/agent/capabilities（受信网络）
```

`/api/health` 用于存活/就绪探针，`/api/metrics` 输出 Prometheus 文本，`/api/agent/capabilities` 提供服务版本、工具、SSE 事件、限流与护栏元数据。

## 4. 公开环境验收

- `/api/health` 返回 `status: ok`，`checks.agent` 可见；
- `/api/agent/capabilities` 返回版本、工具与 SSE 事件；
- `/api/agent/chat` 在 Nginx/CDN 后仍能流式返回 `meta` 与 `done`；
- 未配置 `AGENT_ADMIN_TOKEN` 时 `/admin` 与 `/api/agents/*` 不可用；
- 公开环境不出现真实模型 Key、微信 Secret、管理 Token 或 Ops Token。

## 5. 安全约束

公开部署只应暴露用户端。管理端、订单履约与真实模型凭证属于受信环境；如果需要展示管理端，应使用临时环境与临时 Token，展示结束后撤销并从公网移除。
