# 部署手册 · ZHIYAN

## 1. 部署形态

| 形态 | 适用 | 数据 |
| --- | --- | --- |
| `npm run build && npm start` | 单机/内网验证 | `.data/` 文件 |
| Docker 单容器 | 演示/小流量 | `/data` 持久卷 |
| Docker Compose | 团队演示、灰度 | 卷或 PostgreSQL |
| Compose + Nginx | 有域名/HTTPS 的对外演示 | 同上 |
| Compose + PostgreSQL | 需要数据库运维规范 | JSONB 单表 |

Node.js 要求 ≥ 20.9；Docker 镜像基于 Node 22 Alpine。

## 2. 环境变量

复制 `.env.example` 为 `.env`，至少修改：

```dotenv
NEXT_PUBLIC_SITE_URL=https://shop.example.com
LLM_API_KEY=<模型网关密钥>
DEMO_AUTH=false
```

其余：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DATA_DIR` | `./.data`（Docker 为 `/data`） | 文件存储目录 |
| `DATABASE_URL` | 空 | 设置后使用 PostgreSQL JSONB |
| `PGSSL` | `false` | 云数据库需要 TLS 时设为 `true` |
| `DEMO_AUTH` | `true` | 演示登录：模拟微信授权并回显手机验证码；上线前设为 `false` 并接入真实供应商 |
| `DEMO_OTP_CODE` | `246810` | 演示验证码（6 位）；仅 `DEMO_AUTH=true` 生效 |
| `WECHAT_APP_ID` | 空 | 微信开放平台网站应用 AppID；配置后启用真实 OAuth |
| `WECHAT_APP_SECRET` | 空 | 微信开放平台 AppSecret；只放服务端 |
| `WECHAT_OAUTH_SCOPE` | `snsapi_userinfo` | `snsapi_userinfo` 可获取昵称；`snsapi_base` 为静默授权 |
| `LLM_API_KEY` | 空 | OpenAI-compatible Key；为空时使用本地规划器 |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | 兼容接口地址；仅在使用环境变量 Key 时生效 |
| `LLM_MODEL` | `deepseek-chat` | 模型名；同上 |
| `LLM_PLANNER` | `false` | 是否让 LLM 规划工具 |
| `LLM_TIMEOUT_MS` | `9000` | LLM 超时（2–30 秒），失败自动回退 |
| `AGENT_ENABLED` | `true` | Agent 总开关；设为 `false` 可熔断对话 |
| `OPS_TOKEN` | 空 | OMS 履约/退款接口 Bearer Token；为空时 `/api/ops/orders` 关闭 |
| `AGENT_ADMIN_TOKEN` | 空 | Agent 注册表管理 Token；为空时 `/api/agents/*` 关闭 |
| `APP_VERSION` | `1.1.0` | 健康检查展示 |
| `WEB_PORT` | `3000` | Compose 宿主端口 |
| `EDGE_PORT` | `8080` | Nginx 宿主端口 |

`NEXT_PUBLIC_SITE_URL` 会进入 metadata / sitemap / OG，需要在**构建时**传入；Compose 的 build args 已读取该变量。

模型 Key 只通过环境变量/密钥管理服务下发；`/admin` 管理端不写模型 Key。多实例部署时各节点使用同一组 `LLM_*` 变量；`AGENT_ENABLED=false` 可作为平台熔断开关。管理端建议放在 VPN/内网或网关鉴权后。

会员登录的生产接线：在微信开放平台创建**网站应用**，把 `https://<你的域名>/api/auth/wechat/callback` 加入授权回调域，设置 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 与 `NEXT_PUBLIC_SITE_URL`（必须是公网 HTTPS）。手机验证码接入阿里云/腾讯云等供应商，替换 `/api/auth/customer/code` 的回显逻辑，并把 `DEMO_AUTH=false`。演示数据默认所有登录映射到同一个演示会员档案，接入真实会员体系时需把 `userId` 绑定到客户记录。

微信 OAuth 的 `state` 使用 `WECHAT_APP_SECRET` 做 HMAC 签名并写入 10 分钟 HttpOnly Cookie；回调会校验 state 与签名后再换取 `openid`。OAuth 失败会回到 `/login?wechat=failed`，不会把错误密钥写入日志。

## 3. 本地/单机

```bash
npm ci
npm run typecheck
npm test
npm run build
NODE_ENV=production npm start
```

健康检查：

```bash
curl -s http://127.0.0.1:3000/api/health | jq
curl -s http://127.0.0.1:3000/api/metrics | head
```

## 4. Docker

```bash
cp .env.example .env
# 修改 .env
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

默认使用文件存储：

- 卷：`zhiyan-data` → `/data`
- 状态文件：`/data/zhiyan-state.json`
- 删除卷会清空订单/购物袋/会话/运行时事件，并重新播种演示数据

镜像构建参数：

```bash
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -t zhiyan-commerce:1.1.0 .
```

国内网络可使用 `NPM_REGISTRY` 指向镜像源；默认使用官方 registry。

## 5. PostgreSQL

```dotenv
DATABASE_URL=postgresql://zhiyan:zhiyan-dev-password@postgres:5432/zhiyan
PGSSL=false
```

```bash
docker compose --profile postgres up -d --build
```

- 首次启动自动建表 `zhiyan_app_state` 并写入种子数据
- 表结构为单文档 JSONB，适合单写实例
- 备份：见第 8 节
- 多副本前请拆分核心表（见 `docs/architecture.md`）

## 6. Nginx（SSE + 静态缓存 + 限流）

```bash
docker compose --profile edge up -d --build
# http://localhost:8080
```

`nginx/nginx.conf` 已包含：

- `/api/agent/chat`：`proxy_buffering off`、300s 超时、独立限流
- `/api/*`：不缓存、限流
- `/_next/static/*`：一年 immutable 缓存
- gzip、安全响应头、`server_tokens off`
- WebSocket Upgrade 头（便于后续扩展）

### HTTPS

在 Nginx 前使用云负载均衡/Ingress，或在本文件加入 443 server 与证书：

```nginx
server {
  listen 443 ssl http2;
  ssl_certificate     /etc/nginx/certs/fullchain.pem;
  ssl_certificate_key /etc/nginx/certs/privkey.pem;
  # 复用 / 的 location 配置
}
```

配置 HSTS 后不要再回退到 HTTP。

## 7. 扩容与性能

单实例默认配置针对演示与中小流量。扩容顺序：

1. Nginx / Ingress 层启用连接复用与超时
2. 会话/限流迁移 Redis（当前进程内）
3. PostgreSQL 拆表（购物袋、订单、会话、事件、日志）
4. 事件流进入队列；画像异步更新
5. 向量检索切换 ANN（pgvector/Milvus/FAISS）
6. 静态资源上 CDN；SSE 走直连或支持流式的网关

容量参考（单 2 vCPU / 2 GB）：

- 页面请求：主要开销为 RSC 渲染 + 画像计算，32 SKU 下 P95 < 120ms
- Agent：本地模式单轮 20–80ms；LLM 模式取决于供应商
- 推荐 API：本地实测 10–30ms（32 SKU，精确 cosine）

## 8. 备份与恢复

### 文件驱动

```bash
docker run --rm -v zhiyan-data:/data -v "$PWD/backups:/backup" alpine \
  tar czf /backup/zhiyan-$(date +%F-%H%M).tar.gz -C /data .
```

恢复：停止 web → 解压到卷 → 启动。

### PostgreSQL

```bash
docker compose exec -T postgres pg_dump -U zhiyan -Fc zhiyan > zhiyan.dump
docker compose exec -T postgres pg_restore -U zhiyan -d zhiyan --clean < zhiyan.dump
```

建议每日备份，保留 14 天；升级前做一次即时快照。

## 9. 升级与回滚

```bash
# 升级
docker compose build web
docker compose up -d web

# 回滚到上一个镜像标签
docker compose down
docker tag zhiyan-commerce:previous zhiyan-commerce:1.1.0
docker compose up -d
```

- 无数据库迁移的版本可直接回滚
- 修改数据结构的版本必须提供向前/向后兼容逻辑
- `/api/health`、`/api/metrics`、`/api/agent/capabilities` 应接入监控告警

## 10. 上线检查清单

- [ ] 模型 Key 放入密钥管理服务，完成轮换演练
- [ ] `NEXT_PUBLIC_SITE_URL` 为真实域名并已重建镜像
- [ ] HTTPS 证书与 HSTS
- [ ] 数据卷/数据库备份任务
- [ ] 健康检查与指标采集
- [ ] Agent 与订单接口限流在网关层再次兜底
- [ ] LLM Key（如启用）与成本告警
- [ ] 隐私政策、退换政策、ICP 备案（如在中国大陆）
- [ ] 日志脱敏检查
- [ ] 健康/指标/能力接口限制在 VPC、VPN 或网关鉴权后

## 11. 静态域名与缓存

- `NEXT_PUBLIC_SITE_URL` 影响 sitemap 与 metadata；更换域名需要重新构建
- 页面为动态渲染（`force-dynamic`），避免 CDN 缓存用户态页面
- 仅对 `/_next/static` 与公开静态资源做长缓存
- `/api/*` 禁止缓存；SSE 必须关闭代理缓冲
