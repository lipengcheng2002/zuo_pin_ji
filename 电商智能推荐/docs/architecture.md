# 架构设计 · ZHIYAN

## 1. 目标与非目标

### 目标

- 一个进程内可运行的完整服装电商：商品浏览、筛选、购物袋、结算、订单、账户
- 可解释推荐：每一次推荐都能回溯意图、召回、排序权重与理由证据
- 可用的 AI 造型师：理解自然语言、调用工具、读写购物袋与画像、受护栏约束
- 可观测：Agent 通过 capabilities / health / metrics 暴露版本、工具、限流与运行指标
- 可部署：Docker、健康检查、持久卷、Postgres 选项、Nginx/SSE 配置

### 非目标（当前演示）

- 真实支付、物流承运商、发票、库存中心、PIM 对接
- 多租户隔离、平台侧 SSO、真实商品图片资产
- 大规模 ANN 索引与在线特征平台（接口已预留）

## 2. 运行时拓扑

```text
                        ┌─────────────────────┐
  Browser ──────────────▶  Next.js (Node)      │
   │  HTML / RSC         │  Route Handlers     │
   │  fetch / SSE        │  RSC pages           │
   │                     └───────┬─────────────┘
   │                             │
   │              ┌──────────────┼────────────────┐
   │              ▼              ▼                ▼
   │         reco engine    agent runtime     commerce/store
   │         (pure TS)      (server-only)     (JSON / PG)
   │              │              │                │
   └──────────────┴──────────────┴────────────────┘
                             │
                    Offline: Spark / PyTorch / LightGBM
```

- 所有智能能力在 Next.js Node runtime 中执行；没有单独的推理微服务，降低演示部署复杂度。
- `src/lib/engine/*` 为纯函数模块，可在 Vitest 中独立测试，不依赖 Web 框架。
- `src/lib/store/*` 与 `src/lib/agent/*` 仅在服务端导入，前端通过 API 访问。

## 3. 推荐请求生命周期

```text
POST /api/reco { scene, constraints, query, triggerProductId }
  1. 读取会话（zy_sid Cookie）与运行时事件流
  2. buildProfileView(userId, events)
       - 静态画像（风格、颜色、场合、预算、尺码）
       - 最近行为加权 + 28 天指数衰减
       - RFM、行为计数、画像标签
  3. recall(profile, scene, constraints, trigger, query)
       - vector / collaborative / rule / trending / editorial
       - 硬约束过滤 + 候选不足时放宽颜色/价格（记录 trace）
  4. rankCandidates(...)
       - 场景权重 + 后台预设（balanced/conversion/discovery）
       - 负向惩罚（超预算、低库存、已购）
       - MMR 多样性 + 品类配额
  5. enrichWithReasons(...)
       - RAG 证据选择 → headline/detail/evidence/confidence
  6. 返回 items + trace + profile 摘要
```

关键不变式：

- 推荐返回的商品必须**有库存**（除非显式放宽 `inStockOnly`）。
- **不会**推荐触发商品自身（详情页）。
- 所有候选都经过硬约束；放宽只作用于颜色与价格。
- trace 必须包含五路召回的候选量、贡献量与耗时，以及最终权重与公式。

## 4. 画像与特征

### 4.1 画像

`ProfileView` 由四部分组成：

| 部分 | 来源 | 更新 |
| --- | --- | --- |
| 静态 | 账户、对话写入的偏好 | 即时 |
| 行为 | 浏览、点击、收藏、加购、购买、搜索、对话 | 实时增量（可关闭） |
| 亲和度 | 行为商品 × 事件权重 × 时间衰减 | 每次请求计算并缓存 |
| RFM | 最近活跃、购买频率、累计消费 | 请求时推导 |

行为事件权重：`view 1 / click 2 / wishlist 3.5 / add_to_cart 5 / purchase 8 / search 1.2 / chat 1.5`。

### 4.2 商品特征

`getFeatureStore()` 从行为事件即时计算：

- CTR/CVR 采用贝叶斯平滑：`(clicks + 10) / (impressions + 240)`
- 质量分 = 评分（62%）+ 评价量（24%）+ 退货率（14%）
- 趋势分 = 近 7 日行为 + 评分
- 同会话共现矩阵 → Item-CF
- 角色互补矩阵（top/bottom/outer/dress/shoes/bag/accessory）+ 色彩和谐 + 正式度差

线上与离线共用字段语义；离线 Spark 作业见 `ml/spark/feature_engineering.py`。

## 5. 排序

```text
score = Σ (weight_scene,preset × factor)
factors = {
  semantic, collaborative, constraint, affinity, trend,
  quality, complement, business, freshness, editorial
}
```

- 权重先按场景合并，再乘以后台预设（`conversion` 提升协同/亲和/商业；`discovery` 提升上新/编辑/语义）。
- 权重归一化后写入 trace，前后台显示同一组数值。
- MMR：`argmax λ·score − (1−λ)·max_sim(selected)`，λ 与品类上限随场景变化。
- 结果不足时以剩余候选补齐，避免空列表。

## 6. RAG 与理由

知识库由三类文档构成：

1. 商品知识卡（32）— 面料、版型、尺码、护理、产地、评分
2. 评价片段（96）— 尺码反馈与真实穿着感受
3. 品牌政策（10）— 配送、退换、尺码、养护、会员、优惠、发票、可持续、AI 透明度、品牌

检索使用 cosine + 词项覆盖 + 类型/商品 boost。理由生成只允许引用检索到的证据；输出护栏会再次核对价格、库存与政策引用。

## 7. Agent 架构

```text
message
  → sanitize / PII mask
  → understand() + context merge
  → planner (rule | LLM JSON plan)
  → tool execution (mutable tools gated by explicit intent)
  → compose (template | LLM polish with grounding)
  → guardrails (block/warn)
  → SSE stream
  → persist message / slots / log
```

### 工具权限

- 只读工具：可在同一轮并行/串行调用，受 `maxToolsPerTurn` 限制。
- 写入工具（`add_to_cart`、`update_preference`）：要求用户明确指令，规划器不可自行触发。
- LLM 规划器输出经过工具白名单与参数清洗，非法工具与超长参数被丢弃。

### 失败降级

| 失败 | 行为 |
| --- | --- |
| LLM 未配置 | 本地规划器 + 模板回答，功能完整 |
| LLM 超时/错误 | 自动回退本地回答，trace 标记 local |
| 工具异常 | 记录 `status: error`，继续其余工具与回答 |
| 注入/越权 | 阻止工具调用，返回固定拒答 |
| 政策未命中 | 建议转人工，不编造条款 |
| 价格/库存无依据 | 护栏标记；LLM 模式回退初稿 |

## 8. 数据与一致性

### 文件驱动

- 单个 JSON 文档，原子写：写临时文件 → `rename`。
- 写队列串行化，避免并发覆盖。
- 适合单实例、演示、边缘部署；扩容需迁移。

### PostgreSQL 驱动

- 单表 `zhiyan_app_state(id=1, doc jsonb, updated_at)`，启动自动建表。
- 仍然整文档写入；适合单写实例。
- 迁移方向：
  - `carts/orders/sessions/events/agent_logs` 拆表
  - 购物袋与库存使用行锁/事务
  - 事件流进入消息队列（Kafka/Redis Streams）
  - 画像与特征存储进入 Redis/特征库

### 订单与库存一致性

- 可售库存 = 商品基础库存 − 未取消/未退货订单的承诺量（`src/lib/commerce/inventory.ts`）。
- 结算在进程内互斥窗口重新校验库存，然后写入订单、清理购物袋与记录审计；客户端提供 `Idempotency-Key`，重复请求返回原订单。
- 取消/退货更新订单状态与时间线，承诺量自动释放。
- 限制：互斥为单实例；多实例必须用数据库事务 + 行锁/唯一约束实现同等语义。

### 平台观测与审计

- `/admin` 管理端使用 `AGENT_ADMIN_TOKEN` + HMAC Cookie；Agent 开关、模型 Key、限流通过环境变量/密钥管理下发。
- `/api/agent/capabilities` 暴露版本、工具、SSE 事件与限制；`/api/health` 暴露 `checks.agent`；`/api/metrics` 暴露 Agent 指标。
- 会员登录、订单、退款等写入只追加审计事件（1,000 条滚动保留），由平台/SIEM 读取。

### 会员登录

- `/login` 提供微信一键登录与手机号验证码两个入口；页面在服务端先校验已有会话。
- 验证码以 SHA-256 哈希保存，5 分钟过期、5 次尝试上限、手机号 30 秒发送冷却。
- 登录后写 `customers` 与 `customerSessions`；Cookie 只保存随机令牌，服务端保存哈希、IP、UA、30 天有效期。
- `/account` 在服务端 `requireCustomer()`，未登录跳转 `/login?next=…`，`next` 只接受站内路径。
- 配置 `WECHAT_APP_ID/SECRET` 后，`/api/auth/wechat/start` 生成 HMAC 签名 state 并跳转微信；`/api/auth/wechat/callback` 校验后换 `openid`、建立会话。未配置时回退演示授权。
- 移动端使用固定底部导航（首页 / 分类 / 造型师 / 心愿 / 我的）；个人中心将画像降为后台摘要，只展示可理解的风格、尺码、预算与订单状态，详细偏好按需展开。
- 演示模式 `DEMO_AUTH=true` 模拟微信 OAuth 并回显固定验证码；生产替换供应商后关闭。

## 9. 可观测性

- `/api/health`：存储、引擎、Agent 开关、LLM 模式；Docker healthcheck 使用
- `/api/metrics`：Prometheus 文本（Agent P95、护栏、意图、反馈、GMV、CVR、NPS、事件量、uptime）
- `/api/agent/capabilities`：平台能力发现与发布比对
- Agent 日志记录意图、工具、时延、Tokens、模式、护栏命中、用户反馈；前端观测面板展示 trace
- 结构化日志输出到 stdout，由容器平台采集

## 10. 扩展路径

| 规模/需求 | 建议 |
| --- | --- |
| 10k+ SKU | 向量索引迁移到 pgvector / Milvus / FAISS，保留 `recall()` 接口 |
| 多副本 | Postgres 拆表 + Redis 会话/限流 + 只读副本 |
| 实时性 | 事件入 Kafka/Redis Streams，Flink/Spark Streaming 更新特征 |
| 排序演进 | 离线 LightGBM → ONNX Runtime 在线打分，保持因子输出可解释 |
| LLM 规模化 | 独立推理网关、超时/重试、成本配额、输出审核、PII 网关 |
| 多品牌/多租户 | 引入 tenant_id，路由与权重配置按租户隔离；平台侧 SSO 与网关鉴权 |
| 运营闭环 | 实验平台、人群圈选、消息触达、优惠券与 CRM 集成 |

## 11. 关键代码地图

| 关注点 | 文件 |
| --- | --- |
| 意图/槽位 | `src/lib/engine/intent.ts` |
| 画像 | `src/lib/engine/profile.ts` |
| 召回 | `src/lib/engine/recall.ts` |
| 排序 + MMR | `src/lib/engine/rank.ts` |
| 理由 / RAG | `src/lib/engine/reason.ts`, `knowledge.ts` |
| 推荐编排 | `src/lib/engine/recommend.ts` |
| 搭配 | `src/lib/engine/outfit.ts` |
| Agent 运行时 | `src/lib/agent/runtime.ts` |
| 工具 | `src/lib/agent/tools.ts` |
| 护栏 | `src/lib/agent/guardrails.ts` |
| 流式接口 | `src/app/api/agent/chat/route.ts` |
| 能力契约 | `src/app/api/agent/capabilities/route.ts`, `src/lib/agent/config.ts` |
| 健康/指标 | `src/app/api/health/route.ts`, `src/app/api/metrics/route.ts` |
| 存储 | `src/lib/store/db.ts` |
