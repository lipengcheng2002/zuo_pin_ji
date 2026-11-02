# Agent Service Contract

本契约面向部署运维、前端和业务系统，描述智能体服务的稳定接口。实现以代码与 `/api/agent/capabilities` 为准；本文是接口与版本说明。

## 1. 版本

| 字段 | 当前值 | 说明 |
| --- | --- | --- |
| `service` | `zhiyan-stylist-agent` | 服务标识 |
| `apiVersion` | `1.0` | 对外接口/事件契约版本 |
| `serviceVersion` | `1.1.0`（可由 `AGENT_SERVICE_VERSION` 覆盖） | 发布版本 |
| `promptVersion` | `stylist-sp-2026.10.3` | Prompt/工具策略版本 |

## 2. 端点

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/agent/chat` | 匿名会话 Cookie `zy_sid`（首次自动创建） | SSE 对话 |
| GET | `/api/agent/capabilities` | 无 | 能力发现，平台探针/网关可读 |
| GET | `/api/v1/agents/:slug` | 无 | 已上架 Agent 的公开元数据 |
| POST | `/api/v1/agents/:slug` | `zya_` Key | JSON 调用已上架 Agent |
| GET | `/api/agent/history` | `zy_sid` | 当前会话消息 |
| DELETE | `/api/agent/history` | `zy_sid` | 清空当前会话 |
| POST | `/api/agent/feedback` | `zy_sid` | 消息赞/踩 |
| GET | `/api/health` | 无 | 进程与 `checks.agent` / `checks.llm` |
| GET | `/api/metrics` | 无（建议网关限制） | Prometheus 文本 |

## 3. 对话请求

```http
POST /api/agent/chat
Content-Type: application/json

{"message":"下周去上海出差，帮我搭三套通勤，预算 3000。"}
```

约束：

- `message` 1–600 字符；超出返回 `400`。
- 同 IP 24 次/分钟；超出返回 `429`（带 `Retry-After`）。
- 平台设置 `AGENT_ENABLED=false` 时返回 `503`。
- 默认 Agent `zhiyan-stylist` 在 Registry 中被下架时，`/api/agent/chat` 返回 `503`。
- 响应为 `text/event-stream`，Nginx 必须关闭 `proxy_buffering`，并保留 `X-Accel-Buffering: no`。

## 4. SSE 事件

每条事件格式为 `data: <JSON>\n\n`，`type` 区分：

| 事件 | data | 说明 |
| --- | --- | --- |
| `meta` | `{requestId,variant,mode}` | 首个事件，便于日志/追踪关联 |
| `stage` | `{stage,label}` | 理解/召回/排序/理由阶段 |
| `trace` | `AgentTraceSnapshot` | 意图、槽位、工具、召回、护栏、模式、Prompt 版本、时延、Token |
| `products` | `{items}` | 商品卡（含理由与证据） |
| `outfit` | `{outfit}` | 整套搭配 |
| `delta` | `{text}` | 增量文本 |
| `suggestions` | `{items}` | 追问建议 |
| `action` | `{type,...}` | 加购/偏好更新等动作 |
| `done` | `{messageId,latencyMs,requestId}` | 成功结束 |
| `error` | `{message,code}` | 失败结束；`code=AGENT_ERROR` |

客户端必须同时处理 `done` 与 `error`；不要依赖 HTTP 状态表达流内错误。连接空闲时服务端每 8 秒发送 `: ping` SSE 注释，客户端应忽略注释行。

## 5. 能力发现

`GET /api/agent/capabilities` 返回：

```json
{
  "service": "zhiyan-stylist-agent",
  "serviceVersion": "1.1.0",
  "apiVersion": "1.0",
  "promptVersion": "stylist-sp-2026.10.3",
  "status": {
    "enabled": true,
    "mode": "local",
    "provider": "ZHIYAN Local",
    "model": "zhiyan-local-planner-v2",
    "planner": "rule"
  },
  "transport": {"type": "sse", "events": ["stage", "trace", "done", "error"]},
  "limits": {
    "messageMaxChars": 600,
    "rateLimitPerMinute": 24,
    "maxToolsPerTurn": 4,
    "absoluteMaxToolsPerTurn": 6,
    "minIntentConfidence": 0.45
  },
  "guardrails": ["prompt_injection", "pii_masking", "price_fact_check", "..."],
  "tools": [{"name": "recommend", "label": "个性化召回", "risk": "low", "writes": false}],
  "knowledge": {"total": 138, "byType": {"policy": 10, "product": 32, "review": 96}}
}
```

平台可用它做启动自检、发布比对和工具白名单同步；**不要**在公开网关缓存该响应（服务端已返回 `no-store`）。

## 6. 健康与指标

健康检查 `checks.agent`：

- `ok`：Agent 开关开启。
- `degraded`：`AGENT_ENABLED=false`（维护模式）。
- `down`：读取设置失败。

关键 Prometheus 指标：

- `zhiyan_agent_logs_total`
- `zhiyan_agent_latency_p95_ms`
- `zhiyan_agent_guardrail_hits_total`
- `zhiyan_agent_feedback_up_total` / `zhiyan_agent_feedback_down_total`
- `zhiyan_agent_intent_total{intent="styling"}`

## 7. 降级与超时

| 场景 | 行为 |
| --- | --- |
| 无 LLM Key | 本地规划器 + 模板回答，功能完整 |
| LLM 超时/5xx/输出触发事实校验 | 回退本地初稿，trace 标记 `local` |
| 工具异常 | 记录 `status:error`，继续其余工具 |
| 注入/越权 | 阻止工具，返回固定拒答 |
| 多轮会话超限 | 保留最近 60 条，历史压缩 |

上游模型超时默认 9s（`LLM_TIMEOUT_MS`，范围 2–30s）；SSE 首包应在 2s 内出现 `stage`。

## 8. 数据与安全

- 发送给模型的只有必要画像摘要、商品事实与知识片段；不发送完整行为明细。
- 日志写入前掩码手机号、身份证、邮箱；不记录 API Key、完整 Prompt 或系统消息。
- 工具调用经过白名单、参数清洗和用户明确意图校验。
- 价格/库存/政策/尺码免责由护栏二次校验。
- 会话 Cookie `zy_sid` 为 HttpOnly；会员身份 `zy_customer` 另行管理。

## 9. 兼容策略

- 新增 SSE 事件或字段：保持 `apiVersion` 不变，客户端必须忽略未知字段。
- 删除/重命名事件、改变错误码语义：升 `apiVersion`，保留旧版本至少一个发布周期。
- `promptVersion` 变化不改变传输契约，但必须附带评测报告。
