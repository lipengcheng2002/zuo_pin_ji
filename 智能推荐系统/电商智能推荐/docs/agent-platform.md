# 企业级智能体后端（Agent Registry / Lifecycle）

> 目标：把“一个智能体”升级为可登记、可上架、可下架、可版本化、可发 Key、可审计的 Agent 后端。当前 Runtime 仍复用织言造型师适配器，但控制面（Registry）已经独立。

## 1. 生命周期

```text
draft ──publish──▶ published (v1)
  ▲                    │
  │                 unpublish
  │                    ▼
  └──── update ───── unpublished
                       │
                    publish ▶ v2
                       │
                   rollback(v1) ▶ v3（以 v1 配置发布为新版本）
```

- **draft**：可编辑工作副本，不可被运行时调用。
- **published**：运行时可见；`publishedVersion` 指向不可变快照。
- **unpublished**：已下架；运行时拒绝新会话/调用，历史版本保留。
- **发布**：把当前工作副本写入不可变 `AgentVersion`，`publishedVersion=currentVersion`，状态变为 published。
- **回滚**：读取目标版本，以该配置创建**新版本**并发布，不修改历史版本。
- **工作副本 vs 已发布快照**：PATCH 修改工作副本不会影响已发布版本，直到再次 publish。

## 2. 管理端认证

| 凭证 | 用途 | 配置 |
| --- | --- | --- |
| `AGENT_ADMIN_TOKEN` | 创建/更新/上架/下架/回滚/Key 管理 | 环境变量，至少 16 位；未配置时返回 503 |
| `OPS_TOKEN` | 订单履约/退款（另一套接口） | 环境变量 |
| Agent API Key `zya_…` | 外部系统调用已上架 Agent | 通过管理端创建，只在创建时显示一次 |

- 管理端使用 `Authorization: Bearer $AGENT_ADMIN_TOKEN`。
- API Key 服务端只保存 SHA-256，列表只显示前缀；支持过期与撤销。
- 所有管理动作写入审计（`agent.created/updated/published/unpublished/rollback/key_created/key_revoked`）。
- 管理接口不应暴露到公网；放在内网/VPN 或网关鉴权后。

## 3. 管理 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/agents` | 列表；`?status=published` 过滤；返回计数 |
| POST | `/api/agents` | 创建草稿；slug/name/channels/config |
| GET | `/api/agents/:id` | 详情 + 版本列表 |
| PATCH | `/api/agents/:id` | 更新工作副本（名称/描述/owner/channels/config） |
| POST | `/api/agents/:id/publish` | 上架；`{note}`；生成新版本 |
| POST | `/api/agents/:id/unpublish` | 下架；运行时立即拒绝新调用 |
| POST | `/api/agents/:id/rollback` | `{version}`；以旧配置发布新版本 |
| GET | `/api/agents/:id/versions` | 不可变版本历史 |
| GET | `/api/agents/:id/keys` | Key 列表（无明文/哈希） |
| POST | `/api/agents/:id/keys` | 创建 Key；`{name, scopes:["invoke"], expiresInDays?}`；返回一次性 token |
| DELETE | `/api/agents/:id/keys/:keyId` | 撤销 Key |

### 创建示例

```bash
curl -X POST http://127.0.0.1:3000/api/agents \
  -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug":"stylist-canary","name":"造型师灰度","description":"canary","channels":["api"]}'
```

### 上架/下架

```bash
curl -X POST http://127.0.0.1:3000/api/agents/$AGENT_ID/publish \
  -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"note":"v1"}'

curl -X POST http://127.0.0.1:3000/api/agents/$AGENT_ID/unpublish \
  -H "Authorization: Bearer $AGENT_ADMIN_TOKEN"
```

### 回滚

```bash
curl -X POST http://127.0.0.1:3000/api/agents/$AGENT_ID/rollback \
  -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"version":1}'
```

## 4. 运行时接口

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/agents/:slug` | 无 | 已上架 Agent 的公开元数据（版本、Prompt、工具、渠道） |
| POST | `/api/v1/agents/:slug` | `zya_…` Key | JSON 调用，返回 message + trace + conversationId |
| POST | `/api/agent/chat` | `zy_sid` 会话 | 商城前台 SSE 对话；默认 Agent 下架时返回 503 |

JSON 调用示例：

```bash
curl -X POST http://127.0.0.1:3000/api/v1/agents/zhiyan-stylist \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"通勤三套搭配","conversationId":"conv_demo_0001"}'
```

- Key 必须包含 `invoke` scope，且 Key 的 `agentId` 与 slug 匹配。
- Agent 必须是 `published`；下架后返回 409。
- 限流：每 Key 20 次/分钟。
- 当前外部调用使用演示会员上下文；生产应由业务后端传入可信 `memberRef`（需签名/网关注入），不能由公网调用方自报。

## 5. CLI

```bash
export AGENT_ADMIN_TOKEN=...
npm run agent:admin -- list
npm run agent:admin -- create --slug stylist-canary --name "造型师灰度"
npm run agent:admin -- publish <agentId> --note "v1"
npm run agent:admin -- unpublish <agentId>
npm run agent:admin -- versions <agentId>
npm run agent:admin -- rollback <agentId> --version 1
npm run agent:admin -- key:create <agentId> --name web-prod --days 90
npm run agent:admin -- key:list <agentId>
npm run agent:admin -- key:revoke <agentId> <keyId>
```

## 6. 数据与审计

- `agents`：Agent 定义/工作副本/状态/版本指针。
- `agentVersions`：不可变配置快照（Prompt、模型标签、工具白名单、渠道、发布备注）。
- `agentApiKeys`：Key 哈希、前缀、scope、过期、撤销、最近使用时间。
- 审计：创建、更新、上架、下架、回滚、Key 创建/撤销；不记录明文 Key。
- 状态持久化在 `AppState`（schema v8），文件或 PostgreSQL JSONB 均可。

## 7. 当前边界

- Runtime 只有 `stylist` 适配器；注册其他 Agent 目前是元数据管理，尚不能执行不同实现。
- 版本配置中的 Prompt/模型是发布快照与平台契约；实际 Prompt 代码仍需随镜像发布，版本号用于追溯。
- 外部 JSON 调用使用演示会员上下文；生产需要可信会员上下文传递。
- 多租户隔离、配额计费、Key 级别审计导出尚未实现。
- 管理 API 是控制面；`/admin` 提供独立 Web UI，CLI/自动化仍可直接调用 API。管理端不进入用户端导航，生产建议放在内网/VPN 后。
