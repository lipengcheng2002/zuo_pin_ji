# 运行手册 · ZHIYAN

## 1. 服务一览

| 组件 | 检查方式 | 期望 |
| --- | --- | --- |
| Web | `GET /api/health` | `200`，`status: ok` |
| 存储 | health.checks.storage | `ok` |
| 引擎 | health.checks.engine | `ok`，返回 items |
| Agent | health.checks.agent | `ok`；维护模式为 `degraded` |
| LLM | health.checks.llm | `ok`（local 或 LLM） |
| 能力契约 | `GET /api/agent/capabilities` | `200`，含 `apiVersion` / `promptVersion` / `tools` |
| 指标 | `GET /api/metrics` | Prometheus 文本 |
| 会员登录 | `/login` | 微信按钮/手机号表单可加载，登录后进入账户 |
| Agent | `POST /api/agent/chat` | SSE 事件流，`meta` 开始，`done` 结束 |

```bash
curl -s http://127.0.0.1:3000/api/health | jq
curl -s http://127.0.0.1:3000/api/metrics | grep zhiyan_kpi_cvr
docker compose ps
docker compose logs --tail=200 web
```

## 2. 常见问题

### 2.1 `/api/health` 返回 503

1. 看 `checks.storage`：文件权限/磁盘空间/数据库连接
2. 看 `checks.engine`：若存储正常但引擎报错，检查 `.data` 是否可读、运行时异常日志
3. 数据库模式：`docker compose logs postgres`，确认 `pg_isready`
4. 恢复后 Docker healthcheck 会自动转绿

### 2.2 会员登录失败

- 演示环境要求 `DEMO_AUTH` 不为 `false`；验证码固定为 `DEMO_OTP_CODE`（默认 `246810`），页面会自动填入
- 验证码 5 分钟过期、最多尝试 5 次；重新获取需等待手机号 30 秒冷却
- 如果看到“短信服务尚未接入”，说明 `DEMO_AUTH=false` 但还没有接短信供应商
- 微信按钮返回 503 时，检查 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` / `WECHAT_OAUTH_SCOPE` 是否完整
- 微信 OAuth 报“redirect_uri 参数错误”：确认 `NEXT_PUBLIC_SITE_URL` 为公网 HTTPS，且 `https://<域名>/api/auth/wechat/callback` 已登记为授权回调域
- 授权后回到登录页：检查 `zy_wx_state` Cookie 是否被浏览器/代理剥离，或 state 已超过 10 分钟
- Cookie 被拒绝：生产必须 HTTPS；`zy_customer` 为 HttpOnly + SameSite=Lax + Secure
- `/account` 未登录会跳转 `/login?next=...`；检查 `next` 是否为站内路径
- 移动端底部导航在 `/checkout` 自动隐藏；其他页面若被遮挡，检查 `env(safe-area-inset-bottom)` 与页脚 padding

### 2.3 AI 造型师无响应/中断

- 检查 `/api/agent/chat` 是否返回 SSE；Nginx 必须关闭 `proxy_buffering`
- 检查 `AGENT_ENABLED` 与 `/api/health` 的 `checks.agent` / `checks.llm`
- 若配置了 LLM：查看应用日志中的 `[llm]` 超时；系统会自动回退本地模式
- 浏览器侧：打开 DevTools Network，确认 `done` 事件是否到达
- 会话历史在服务端；新浏览器会话仍可继续

### 2.4 加购/下单失败

- 库存：详情页/购物袋的库存来自种子数据；同一尺码库存为 0 会拒绝
- 优惠券：`NEW15` 最高减 300；`ZHIYAN10` 需满 800；不可叠加
- 手机号：必须 11 位大陆手机号
- 订单接口限流 12 次/分钟
- 持久化失败：检查 `/data` 权限与磁盘空间；`persist failed` 会出现在日志

### 2.5 页面无样式

- Tailwind 源清单未同步：运行 `node scripts/sync-tailwind-sources.mjs` 后重新构建
- 构建输出 CSS 过小（< 30KB）通常意味着 source 列表未生效
- Next 静态资源 404：确认部署包含 `.next/static` 与 `public`
- Nginx：`/_next/static` 必须代理到 Next，不能只托管 `.next` 目录（standalone 结构）

### 2.6 SSE 在生产被缓冲

- Nginx：`proxy_buffering off; proxy_cache off; X-Accel-Buffering: no;`
- 云负载均衡：开启流式/关闭响应缓冲；空闲超时 ≥ 300s
- CDN：不要缓存 `/api/agent/*`

## 3. 数据恢复

### 文件驱动

```bash
# 停止写入
docker compose stop web
# 备份当前
docker run --rm -v zhiyan-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/before-restore.tar.gz -C /data .
# 恢复
docker run --rm -v zhiyan-data:/data -v "$PWD:/backup" alpine \
  tar xzf /backup/zhiyan-backup.tar.gz -C /data
docker compose start web
```

### PostgreSQL

```bash
docker compose exec -T postgres pg_restore -U zhiyan -d zhiyan --clean < backup.dump
```

恢复后检查：

- `/api/health` 为 ok
- 订单数、会话数、Agent 日志与备份前一致（可从 `/api/metrics` 或数据库核对）
- 随机打开一笔订单，确认地址与商品

## 4. 密钥轮换

| 密钥 | 步骤 | 影响 |
| --- | --- | --- |
| `LLM_API_KEY` | 更新后重启 | 下一次请求使用新 Key；旧 Key 立即废弃 |
| `WECHAT_APP_SECRET` | 更新后重启 | 进行中的 OAuth state 失效，用户需重新授权 |
| 数据库密码 | 更新 PG 与应用 `.env`，滚动重启 | 短暂连接失败 |

## 5. 重置演示数据

仅文件驱动：

```bash
docker compose stop web
docker run --rm -v zhiyan-data:/data alpine rm -f /data/zhiyan-state.json
docker compose start web
```

Postgres：

```sql
TRUNCATE zhiyan_app_state;
```

重启后自动重新播种。**这会删除所有订单、购物袋、会话与运行日志。**

## 6. 日志与追踪

- Web 日志：`docker compose logs -f web`（stdout JSON/文本）
- 关键前缀：
  - `[store]` 持久化错误
  - `[agent]` 对话流/持久化错误
  - `[llm]` 外部模型失败
  - `[search]`/`[reco]` 服务异常
- Agent 日志保存在存储层，包含意图、时延、工具、护栏命中与反馈；平台/SIEM 可直接查询
- 每个推荐 trace 有 `requestId`；每轮 Agent 的 `meta` / `done` / trace 共享同一 `requestId`
- 用户反馈（赞/踩）写入 Agent 日志；`/api/metrics` 提供正负反馈聚合

## 7. 告警建议

| 告警 | 阈值 |
| --- | --- |
| 健康检查失败 | 连续 3 次 |
| 5xx 比例 | > 1% / 5 分钟 |
| Agent 错误率 | > 5% / 10 分钟 |
| Agent P95 时延 | > 800ms |
| 推荐 P95 时延 | > 120ms |
| 磁盘使用 | > 80% |
| PostgreSQL 连接 | > 80% pool |
| 订单创建失败 | 任意连续 3 次 |

## 8. 故障分级

| 级别 | 示例 | 响应 |
| --- | --- | --- |
| P0 | 全站 5xx、数据丢失 | 立即回滚/恢复，通知负责人 |
| P1 | Agent 全不可用、支付不可用 | 30 分钟内定位，降级到本地/人工 |
| P2 | 推荐质量下降、单场景异常 | 4 小时内处理，观察指标 |
| P3 | 样式/文案问题 | 正常迭代 |

## 9. 回滚

1. 切换镜像标签到上一版本
2. 如涉及存储结构，先恢复备份
3. 验证 health / 订单 / Agent
4. 记录事故：时间、影响面、根因、行动项

## 10. 联系与责任

演示项目：推荐算法组（林屿）维护推荐与 Agent，前端与设计共同维护商城体验；
生产部署需补充 on-call 轮值、升级路径与供应商联系人。
