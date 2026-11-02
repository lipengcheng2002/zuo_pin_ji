# 管理端（Agent Control Plane）

> 目录：`src/app/admin`、`src/components/admin`、`src/app/api/agents`、`src/app/api/admin`
> 访问：`/admin`（登录后）；整体 `noindex`，不在用户端导航出现。

## 1. 定位

面向 Agent 开发者/平台运营的智能体控制面：

- 查看 Agent Registry 与状态；
- 创建草稿；
- 上架生成不可变版本；
- 下架立即阻断用户端/API 调用；
- 回滚到历史版本（生成新版本）；
- 创建/撤销调用 Key（只显示一次明文）；
- 查看版本历史、配置快照、Key 使用时间。

它是**管理端 UI + 管理 API**，不是电商订单/库存后台；订单履约走 `/api/ops/orders`。

## 2. 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Next.js 16 App Router（独立 `src/app/admin` 路由组） |
| UI | React 19 Client Components + Server Components + Tailwind CSS 4 |
| 认证 | `AGENT_ADMIN_TOKEN` → HMAC 签名 `zy_admin` HttpOnly Cookie（8h）；也接受 Bearer |
| 数据 | Store 层 `agents / agentVersions / agentApiKeys`（schema v8） |
| API | `/api/agents/*` 生命周期；`/api/admin/auth` 登录/退出 |
| Key | `zya_` 随机 Key，服务端只存 SHA-256；scope `invoke`；支持过期/撤销 |
| 部署 | 与用户端同一个 Next.js 进程；建议放在 VPN/内网/网关鉴权后 |

## 3. 页面

| 路由 | 功能 |
| --- | --- |
| `/admin/login` | 管理 Token 登录；未配置 Token 时显示禁用提示 |
| `/admin` | Agent 列表、状态统计、版本/渠道/更新时间 |
| `/admin/new` | 创建草稿（名称、slug、描述、渠道） |
| `/admin/agents/[id]` | 配置快照、上架/下架、回滚、版本历史、调用 Key |

## 4. 认证与安全

- 登录接口 `POST /api/admin/auth`，8 次/分钟/IP；Token 错误写 `admin.login_failed` 审计。
- 成功写入 HMAC 签名 Cookie，HttpOnly / SameSite=Lax / 生产 Secure / 8h；退出清除。
- 管理 API 同时接受：
  - 浏览器：`zy_admin` Cookie；
  - 平台/CLI：`Authorization: Bearer $AGENT_ADMIN_TOKEN`。
- `AGENT_ADMIN_TOKEN` 未配置时，所有管理接口返回 503。
- 管理端不提供用户端入口；`robots` 禁止收录。
- 生产必须把管理端放在内网/VPN 或网关鉴权后，不要和用户端同一公开路径直接暴露。
- 调用 Key 只在创建时返回一次，服务端只存哈希；审计只记录前缀。

## 5. 生命周期语义

| 动作 | 行为 |
| --- | --- |
| 创建 | `draft`，无版本，不可调用 |
| 上架 | 工作副本写入不可变 `AgentVersion`，`publishedVersion=currentVersion` |
| 下架 | `unpublished`，用户端 SSE 返回 503，API Key 调用返回 409 |
| 发布新版本 | 已上架时再次 publish，版本号 +1；历史版本只读 |
| 回滚 | 读取目标版本配置，发布为新版本；不修改历史 |
| Key 撤销 | 立即 401；已发出的请求不受影响 |

工作副本与已发布快照分离：管理端“保存/修改”不会自动改变线上版本，必须重新发布。

## 6. CLI 与 API

```bash
AGENT_ADMIN_TOKEN=... npm run agent:admin -- list
AGENT_ADMIN_TOKEN=... npm run agent:admin -- publish <agentId> --note "v2"
AGENT_ADMIN_TOKEN=... npm run agent:admin -- unpublish <agentId>
AGENT_ADMIN_TOKEN=... npm run agent:admin -- rollback <agentId> --version 1
AGENT_ADMIN_TOKEN=... npm run agent:admin -- key:create <agentId> --name web-prod
```

完整契约：[`agent-platform.md`](agent-platform.md)、[`agent-platform-openapi.yaml`](agent-platform-openapi.yaml)。

## 7. 边界

- 管理端只做 Agent 控制面，不是完整电商后台；订单发货/退款仍由 OMS `/api/ops/orders` 负责。
- 没有多操作员 RBAC/审批流；当前是单管理 Token。接入企业 SSO/RBAC 是后续工作。
- 版本配置中的 Prompt/模型是发布快照与平台契约，实际 Prompt 代码随镜像发布；版本号用于追溯。
- 数据仍为单实例文件/JSONB；多实例需数据库事务与共享会话。
