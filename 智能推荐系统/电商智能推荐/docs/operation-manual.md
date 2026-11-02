# 操作手册 · ZHIYAN

> 适用版本：v1.1.0。项目分为用户端与 `/admin` Agent 管理端；本手册面向 Agent 开发、部署运维与客服/运营的日常操作。

## 1. 角色与访问

| 角色 | 负责 | 入口 |
| --- | --- | --- |
| 会员（C 端） | 浏览、登录、下单、查看订单、取消/退货、AI 造型 | `/`、`/login`、`/account`、`/stylist` |
| Agent 开发 | Prompt、工具、RAG、护栏、评测、版本 | 代码、`/api/agent/*`、`npm run eval:agent` |
| 部署运维 | 部署、密钥、域名/TLS、数据库、监控、扩缩容 | 环境变量、`/api/health`、`/api/metrics` |
| Agent 管理 | Agent 上架/下架、版本、回滚、调用 Key | `/admin`（需 `AGENT_ADMIN_TOKEN`） |
| 客服/运营 | 会员与订单问题处理 | 本手册 + OMS/数据库 |

## 2. 本地启动

### Windows

```bat
start-windows.cmd       :: 开发模式
start-windows.cmd prod  :: 构建并启动生产模式
```

脚本会寻找同级 `.tools` 的便携 Node；首次运行会复制 `.env.example` 为 `.env` 并安装依赖。

### 通用

```bash
cp .env.example .env
npm install
npm run dev             # http://localhost:3000
# 或
npm run build && npm start
```

最小配置：

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATA_DIR=./.data
DEMO_AUTH=true
AGENT_ENABLED=true
```

演示登录：

1. 打开 `/login`。
2. 勾选协议 → 微信一键登录（演示授权）；或手机号页签输入任意有效手机号，验证码自动填入 `246810`。
3. 登录后进入 `/account`。
4. `/account` 右上角或移动端个人中心可退出登录。

内置测试账号：

| 登录方式 | 会员 | 数据 |
| --- | --- | --- |
| 微信演示 / 手机 `13900000000` | 林知夏 | 4 笔种子订单、完整画像、心愿单 |
| 手机 `13800000000` | 周予安 | 2 笔已完成测试订单、通勤画像 |
| 任意其他有效手机号 | 新会员 | 空订单、基础画像；下单后归属该会员 |

每个手机号创建独立 `userId`，订单、购物袋、心愿单、画像按会员隔离。

## 3. Agent 操作

### 3.1 本地模式 / LLM 模式

默认无 Key，使用确定性本地规划器。切换真实模型：

```dotenv
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_PLANNER=false
LLM_TIMEOUT_MS=9000
```

重启服务后检查：

```bash
curl -s http://127.0.0.1:3000/api/agent/capabilities | jq '.status, .promptVersion'
# 期望 status.mode = "llm"；provider 为实际供应商
```

没有 Key、供应商超时或输出触发价格事实校验时，自动回退本地模板。

### 3.2 熔断与维护

```dotenv
AGENT_ENABLED=false
```

更新环境变量并重启后：

- `/api/health` 的 `checks.agent` 变为 `degraded`。
- `POST /api/agent/chat` 返回 `503`。
- 前台造型师应显示维护提示（由前端/网关按 503 处理）。

恢复设为 `true` 或删除该变量后重启。

### 3.3 验证 SSE

```bash
curl -N -X POST http://127.0.0.1:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"下周去上海出差，帮我搭三套通勤，预算 3000"}'
```

应依次看到：

```text
data: {"type":"meta","data":{"requestId":"agt_...","variant":"B","mode":"local"}}
data: {"type":"stage",...}
data: {"type":"trace",...}
data: {"type":"products",...}
data: {"type":"delta",...}
data: {"type":"done","data":{"messageId":"...","latencyMs":...,"requestId":"agt_..."}}
```

- 首包 `meta` 与 `done` 的 `requestId` 必须一致。
- 连接空闲时每 8 秒收到 `: ping` 注释（客户端忽略）。
- 失败时收到 `{"type":"error","data":{"code":"AGENT_ERROR"}}`。

### 3.4 评测与回归

```bash
npm run test:agent    # Agent + 注册表 + 引擎 61 项
npm run eval:agent    # 输出意图/槽位/RAG/注入基线
npm test              # 全项目 78 项
npm run test:e2e      # 全流程（需服务已启动）
```

当前基线：意图 33/33、槽位 13/13、检索 Top-1 10/10、注入 15/15、正常问题误伤 0/10。阈值在 `src/lib/agent/evaluation.test.ts`，变更阈值必须在 PR 说明理由。

发布 Prompt/工具前：

1. 跑 `npm run test:agent` 与 `npm run eval:agent`。
2. 确认注入拦截 100%、正常问题 0 误伤。
3. 更新 `src/lib/agent/config.ts` 的 `PROMPT_VERSION`（如适用）。
4. 构建、部署、观察 `/api/metrics` 的 P95、护栏命中、负反馈。
5. 保存 `/api/agent/capabilities` 快照与镜像 digest。

### 3.5 Agent 上架/下架与版本

配置 `AGENT_ADMIN_TOKEN`（至少 16 位）后，打开 `/admin`，用该 Token 登录即可在 Web 管理端完成创建、上架、下架、回滚和 Key 管理；平台也可用 CLI/API 管理生命周期：

```bash
export AGENT_ADMIN_TOKEN=...
npm run agent:admin -- list
npm run agent:admin -- create --slug stylist-canary --name "造型师灰度"
npm run agent:admin -- publish <agentId> --note "v1"
npm run agent:admin -- unpublish <agentId>
npm run agent:admin -- versions <agentId>
npm run agent:admin -- rollback <agentId> --version 1
npm run agent:admin -- key:create <agentId> --name web-prod --days 90
```

- `draft → published → unpublished`；修改工作副本不会影响已发布版本，需再次 publish。
- 下架后：商城 `/api/agent/chat` 返回 503；`/api/v1/agents/:slug` 调用返回 409。
- 回滚会以旧配置生成**新版本**，历史版本不可变。
- Agent API Key 只显示一次，服务端只存哈希；支持过期与撤销。
- 运行时：`GET /api/v1/agents/:slug` 读公开元数据，`POST` 用 `Authorization: Bearer zya_...` 调用。
- 完整 API、OpenAPI 与边界见 [`agent-platform.md`](agent-platform.md) 和 [`agent-platform-openapi.yaml`](agent-platform-openapi.yaml)。

### 3.6 观测

```bash
curl -s localhost:3000/api/health | jq '.checks.agent, .checks.llm'
curl -s localhost:3000/api/metrics | grep -E 'zhiyan_agent_(latency|guardrail|intent|feedback)'
curl -s localhost:3000/api/agent/capabilities | jq '.serviceVersion, .promptVersion, .limits'
```

Agent 日志包含 `requestId`、意图、工具、时延、Token、模式、护栏命中与反馈；由平台/SIEM 读取存储层，管理端不展示原始对话日志。

## 4. 会员与订单操作

### 4.1 会员

- 登录：`/login`，微信 OAuth 或手机号验证码。
- 账户：`/account`，订单、风格档案、心愿单、退出登录。
- 演示环境验证码固定 `246810`；生产设置 `DEMO_AUTH=false` 并接短信/微信。
- 会员数据隔离、换绑、注销、导出/删除尚未实现，见上线差距清单 P0。

### 4.2 订单

- 客户可取消“待发货”订单、对“已发货/已完成”申请退货；库存承诺自动释放。
- 结算支持 `Idempotency-Key`，重复提交返回原订单。
- 演示支付只写 `paymentStatus=paid`，不会真实扣款。

### 4.3 履约/退款接口（OMS/平台）

配置 `OPS_TOKEN`（至少 16 位）后，OMS/平台可调用：

```bash
curl -X POST http://127.0.0.1:3000/api/ops/orders \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderNo":"ZY2026...","action":"ship","trackingNo":"SF1234567890"}'

# complete：已发货 → 已完成
# refund：已发货/已完成/已退货 → 已退货 + paymentStatus=refunded，amount 可选
```

未配置 `OPS_TOKEN` 时接口返回 503；Token 错误 401；状态不合法 409。此接口不做浏览器同源校验，仅供服务端调用，必须放在内网或网关鉴权后。

**真实支付网关仍未接**：当前是演示支付 + 测试退款状态，微信/支付宝下单、回调验签、对账仍需商户资质与密钥。

## 5. 数据与备份

### 文件驱动（默认）

```bash
# 备份（建议停写或低峰）
cp .data/zhiyan-state.json backup/zhiyan-state-$(date +%F).json

# 恢复
cp backup/zhiyan-state-YYYY-MM-DD.json .data/zhiyan-state.json
# 重启 web

# 重置演示数据（会删除订单/会话/日志）
rm -rf .data
# 重启后自动播种，schema v7
```

### PostgreSQL

```bash
pg_dump "$DATABASE_URL" > backup/zhiyan-$(date +%F).sql
psql "$DATABASE_URL" < backup/zhiyan-YYYY-MM-DD.sql
# 重置
TRUNCATE zhiyan_app_state;
```

恢复后检查 `/api/health`、订单数、会员登录与 Agent 一次对话。

## 6. 部署形态与运维要求

```bash
docker build -t zhiyan-commerce:1.1.0 .
docker run -p 3000:3000 -v zhiyan-data:/data --env-file .env zhiyan-commerce:1.1.0
# 或
docker compose up -d --build
```

生产部署需要满足：

- 域名/TLS/WAF、Ingress、Nginx；`/api/agent/chat` 必须关闭 `proxy_buffering`。
- 密钥管理（LLM Key、微信 Secret、数据库密码），不写入镜像/Git。
- PostgreSQL/Redis、备份、监控、告警、扩缩容与值班。
- 微信开放平台/短信供应商资质与回调域。
- 生产探针：`/api/health`；指标：`/api/metrics`；能力：`/api/agent/capabilities`。
- 镜像、环境变量清单、capabilities 快照、评测基线、模型卡与回滚说明随版本归档。

## 7. 常见故障

| 现象 | 排查 |
| --- | --- |
| `/api/health` 503 | 看 `checks.storage` / `checks.engine`；数据库/磁盘/权限 |
| Agent 503 | `AGENT_ENABLED` 是否为 false；或在 `/admin` 将默认 Agent 下架；改环境变量后需重启 |
| LLM 无响应 | 看 `[llm]` 日志与 `LLM_TIMEOUT_MS`；系统会自动回退本地 |
| 429 | Agent 24/min/IP、验证码 8/min/IP、下单 12/min；等待 `Retry-After` |
| SSE 无输出 | Nginx `proxy_buffering off`；检查 `/api/agent/chat` 与 `meta` 首包 |
| 微信登录 503 | 未配置 `WECHAT_APP_ID/SECRET`；或 `DEMO_AUTH=false` |
| redirect_uri 错误 | 公网 HTTPS + 微信开放平台回调域 + `NEXT_PUBLIC_SITE_URL` |
| 登录后仍要求登录 | Cookie 被拒绝/已撤销；检查 HTTPS、`zy_customer` |
| 订单卡在待发货 | 演示环境无履约后台；生产接 OMS |

## 8. 安全规则

- 不在聊天、代码、镜像、日志中放置真实模型 Key/微信 Secret。
- `/api/metrics`、`/api/health`、`/api/agent/capabilities` 只对受信网络开放。
- 生产设置 `DEMO_AUTH=false`；演示码 `246810` 绝不能出现在公网。
- 会员数据/画像/订单按最小权限访问；截图与日志脱敏。
- 发现漏洞走安全响应流程，不在公开渠道披露。

## 9. 相关文档

- [agent-service-contract.md](agent-service-contract.md) — Agent API/SSE 契约
- [agent-evaluation.md](agent-evaluation.md) — 评测基线与阈值
- [production-readiness-gap.md](production-readiness-gap.md) — 上线差距
- [deployment.md](deployment.md) — 部署
- [runbook.md](runbook.md) — 故障处理
