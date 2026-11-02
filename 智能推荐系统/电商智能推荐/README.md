# 织言 ZHIYAN · 电商智能体与推荐系统

> 一个可部署的服装电商平台：编辑级前台 + 可解释推荐引擎 + AI 造型师 Agent + 可观测的 Agent 服务契约。

织言不是单页算法展示，而是一套完整的电商业务系统：用户可以在服装商城浏览、筛选、加购、结算；AI 造型师用自然语言理解场景、预算、尺码与偏好，给出带依据的整套搭配。项目分为**用户端**（`src/app/(store)`）与**独立管理端**（`src/app/admin`）：用户端负责购物与造型体验，管理端负责 Agent 上架/下架、版本、回滚与调用 Key。

**技术栈**：Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Zod · Embedding 召回 · 多路融合排序 · RAG · Agent Tool Calling · PySpark · PyTorch · LightGBM · PostgreSQL（可选）

[项目概览](PROJECT-OVERVIEW.md) · [用户端技术栈](docs/user-app.md) · [管理端技术栈](docs/admin-app.md) · [Agent 平台](docs/agent-platform.md) · [Agent 契约](docs/agent-service-contract.md) · [评测基线](docs/agent-evaluation.md) · [上线差距](docs/production-readiness-gap.md)

![Next.js](https://img.shields.io/badge/Next.js-16-17160f?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)
![Tests](https://img.shields.io/badge/tests-78%20unit%20%2F%2014%20e2e-4f6b57?style=flat-square)
![Agent](https://img.shields.io/badge/agent-tools%20%C3%97%2011%20%C2%B7%20RAG%20%C2%B7%20eval-c9a87b?style=flat-square)

<p align="center">
  <img src="docs/demo.gif" width="330" alt="ZHIYAN 移动端商城、登录、个人中心与 AI 造型师" />
</p>

**系统设计的重点**：造型师不是单一的聊天框，而是一套可解释、可评测、可护栏、可上架/下架、可版本回滚、可签发调用 Key 的 Agent 服务，并与商品、画像、库存、订单等电商事实数据联动。仓库内数据为合成数据，用于功能与工程验证。

---

## 1. 项目定位

系统覆盖的六项核心能力，均有对应的可运行实现：

| 能力方向 | 系统实现 | 可观测位置 |
| --- | --- | --- |
| 个性化推荐算法 | 意图理解 → 5 路召回 → 10 因子融合 → MMR 多样性 → RAG 理由 | 首页「为你精选」/ `/api/reco` trace |
| 智能用户画像 | 静态偏好 + 行为序列 + RFM + 亲和度，实时增量 | 个人中心「风格档案」/ `/api/profile` |
| 商品特征挖掘 | 32 SKU × 32 维属性、评价片段、质量/趋势/毛利/库存 | Agent 商品卡证据 / `capabilities.knowledge` |
| 实时推荐更新 | 浏览/加购/收藏/对话事件写入，分钟级进入排序 | `/api/metrics` / 推荐时延 |
| 多场景推荐 | 首页、造型师、详情页、购物袋、搜索、结算、邮件 | 各前台场景 |
| 推荐效果优化 | A/B 灰度、显著性检验、护栏与离线评估 | `docs/agent-evaluation.md` / 离线产物 |

Agent 链路对应需求中的「意图理解 → 多路召回 → 排序 → 推荐理由生成」，并增加了工具调用、对话记忆、护栏校验与全链路追踪。

**系统边界**：仓库覆盖用户端、管理端、Agent 运行时、推荐引擎、交易与离线 ML，并提供 Docker、健康检查、指标与评测契约。生产环境中的集群、DNS/TLS、密钥托管、微信/短信/支付资质、PIM/ERP/OMS 与真实物流属于外部依赖；接口契约见 [`docs/agent-service-contract.md`](docs/agent-service-contract.md)，上线差距见 [`docs/production-readiness-gap.md`](docs/production-readiness-gap.md)。

### 核心指标（内置实验，30 天）

| 指标 | 对照 A（规则 + Item-CF） | 实验 B（Agent 融合排序） | 提升 |
| --- | --- | --- | --- |
| 支付转化率 | 2.80% | 3.92% | **+40.0%** |
| 满意度指数（NPS） | 41.0 | 65.6 | **+60.0%** |
| 推荐精度 Precision@10 | 0.420 | 0.756 | **+80.0%** |
| 营销效率 ROI | 2.10× | 3.57× | **+70.0%** |

> 指标为内置 A/B 数据与离线产物，不代表真实商业结果。生成逻辑与统计检验在 `src/lib/engine/metrics.ts`、`src/lib/engine/experiment.ts`，评测方法见 `docs/agent-evaluation.md`。

---

## 2. 系统架构

```text
┌────────────────────────────── 浏览器 ──────────────────────────────┐
│  商城前台（RSC + 客户端交互岛）                                     │
│  Home / Shop / PDP / Cart / Checkout / Account / Stylist         │
└───────────────┬───────────────────────────────────────────────────┘
                │ fetch / SSE
┌───────────────▼───────────────────────────────────────────────────┐
│ Next.js Route Handlers                                            │
│  /api/cart  /api/orders  /api/search  /api/reco  /api/profile     │
│  /api/agent/chat (SSE)  /api/agent/capabilities                    │
│  /api/health  /api/metrics  /api/auth/*                            │
└───────────────┬─────────────────────────────┬─────────────────────┘
                │                             │
┌───────────────▼──────────────┐  ┌───────────▼─────────────────────┐
│ 推荐引擎 src/lib/engine      │  │ Agent Runtime src/lib/agent     │
│ 意图 → 召回 → 排序 → 理由    │  │ 规划 → 工具 → 护栏 → 流式输出   │
│ Embedding / CF / 规则 / RAG  │  │ 11 个工具 · 会话记忆 · 追踪     │
└───────────────┬──────────────┘  └───────────┬─────────────────────┘
                └──────────────┬──────────────┘
┌──────────────────────────────▼────────────────────────────────────┐
│ 存储层 src/lib/store                                              │
│ 本地 JSON（原子写） 或 PostgreSQL JSONB（DATABASE_URL）            │
└──────────────────────────────┬────────────────────────────────────┘
                               │ 离线产物
┌──────────────────────────────▼────────────────────────────────────┐
│ ML 管线 ml/                                                       │
│ Spark 特征工程 → PyTorch 双塔 → LightGBM 排序 → 离线评估 → 模型卡 │
└───────────────────────────────────────────────────────────────────┘
```

### 目录结构

```text
src/
  app/
    (store)/            商城：首页、列表、详情、购物袋、结算、账户、造型师、帮助
    login/              会员登录（微信 OAuth / 手机号验证码）
    api/                REST 与 SSE 路由
  components/
    product/            商品线稿、商品卡、详情交互、搭配一键加购
    storefront/         头部、搜索、筛选、购物袋、结算、移动端导航
    stylist/            对话工作台、商品卡、Agent 观测面板
    auth/               会员登录面板
    providers/          Cart / Wishlist / Toast
  lib/
    engine/             intent · recall · rank · reason · profile · features
                        outfit · search · knowledge(RAG) · metrics · experiment
    agent/              LLM 适配 · 工具注册 · 运行时 · 护栏 · 组合回答
    store/              JSON / PostgreSQL 持久化、会话、Cookie
    commerce/           定价、优惠券、运费、库存校验
    data/               32 件秋冬商品、评论、160 个画像、内容
ml/
  spark/                PySpark 特征工程
  train/                PyTorch 双塔召回、LightGBM 排序
  eval/                 离线评估（Precision / Recall / NDCG / Coverage / Novelty）
  scripts/              无依赖复现实验模拟器
  data/  artifacts/     样本数据与产物
nginx/                  SSE 友好的反向代理配置
docs/                   架构、部署、模型卡、运行手册、API、安全
```

---

## 3. 推荐引擎

### 3.1 意图理解

`src/lib/engine/intent.ts` 提供确定性的中文 NLU：

- 品类词典（外套 / 针织 / 衬衫 / 连衣裙 / 裤装 / 半裙 / 鞋履 / 包袋 / 配饰）
- 颜色、场景、风格、尺码、预算（支持「一千以内」「500 元以下」「1000-2000」）
- 意图：造型搭配 / 找货 / 尺码 / 对比 / 面料问答 / 政策 / 订单 / 购物袋 / 偏好记忆
- 话题指代（「这件」「那件」）与多轮槽位合并

### 3.2 五路召回

| 召回源 | 实现 | 作用 |
| --- | --- | --- |
| 向量召回 | 256 维确定性哈希嵌入 + cosine | 语义相似、冷启动 |
| 协同过滤 | Item-CF 共现 + User-CF 相似邻居 | 群体行为信号 |
| 规则召回 | 品类/颜色/尺码/预算/场景硬约束 | 需求精度 |
| 热度召回 | 30 天销量、14 天趋势、评分 | 新客与兜底 |
| 编辑精选 | 主推、上新、编辑标签 | 品牌叙事 |

当硬约束导致候选过少时，系统会**优先放宽颜色，再上浮价格上限**，绝不放宽库存与品类，并在 trace 中标注。

### 3.3 融合排序

十个因子按场景加权后归一化：

```text
semantic · collaborative · constraint · affinity · trend
quality · complement · business · freshness · editorial
```

- 场景权重：`home / stylist / pdp / cart / search / checkout / email`
- 后台可切换 `balanced / conversion / discovery` 权重预设
- 负向约束：超出预算、低库存、已购同款
- MMR 多样性（λ 0.78–0.96）+ 品类配额，避免「一排羊绒衫」

### 3.4 RAG 理由生成

`src/lib/engine/reason.ts` 从三类证据生成可核对理由：

1. 画像：风格亲和度、色彩偏好、RFM 分层、近期行为
2. 商品特征：面料、版型、体感指数、库存、价格
3. 评价 / 搭配规则 / 趋势

每个推荐返回 `headline + detail + evidence[] + confidence`，前台展示，Agent trace 可追溯。未配置 LLM 时使用模板组合；配置 LLM 后可进一步改写（护栏会再次校验价格与库存事实）。

### 3.5 冷启动与解释开关

- 匿名/新客：使用静态画像 + 热度与编辑召回，并在 trace 标记 `coldStart`
- 关闭「推荐理由展示」：商品卡隐藏理由，仅保留编辑说明

---

## 4. AI 造型师 Agent

### 4.1 运行时

`src/lib/agent/runtime.ts` 的单轮流程：

1. 输入清洗（控制字符、长度、PII 掩码）
2. 意图与槽位理解，并合并最近 3 轮上下文
3. 规划工具：规则规划器，或配置 `LLM_PLANNER=true` 后的 LLM 规划器（JSON 结构化、白名单校验）
4. 依次执行工具并记录耗时、参数、产物
5. 组合回答：模板 + RAG 事实 + 可选 LLM 润色
6. 护栏：注入、价格、库存、尺码免责、政策引用、促销一致性、绝对化用语、工具预算、置信度
7. 流式输出（SSE）：stage → trace → products → outfit → delta → suggestions → action → done
8. 持久化消息、槽位与 Agent 日志

### 4.2 工具

| 工具 | 作用 | 风险 |
| --- | --- | --- |
| `search_catalog` | 关键词 + 结构化检索 | 只读 |
| `get_product` | 商品档案与评价 | 只读 |
| `recommend` | 召回 + 排序 + 理由 | 只读 |
| `build_outfit` | 完整搭配（预算感知、去重） | 只读 |
| `size_advisor` | 身形 + 版型 + 评价计算尺码 | 只读 |
| `retrieve_knowledge` | RAG：商品 / 评价 / 政策 | 只读 |
| `compare_products` | 多维度对比 | 只读 |
| `get_cart` | 购物袋与搭配缺口 | 只读 |
| `add_to_cart` | 加购并校验库存 | 写入 |
| `get_orders` | 订单状态/物流 | 只读 |
| `update_preference` | 写入画像偏好 | 写入 |

写入型工具只有在用户明确表达指令时才会执行，且受每轮工具预算限制。

### 4.3 本地模式 vs LLM 模式

- **默认本地模式**：无 API Key 也能完整运行意图、召回、排序、搭配、RAG、尺码、政策与加购
- **环境变量接入**：设置 `LLM_API_KEY`（可用 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`），可选 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_PLANNER=true`
- **平台熔断**：`AGENT_ENABLED=false` 可关闭对话，`AGENT_SIMULATE_LATENCY=true` 仅用于演示
- **密钥安全**：API Key 只从环境变量/密钥管理服务读取，不进入仓库、镜像或前端
- LLM 失败、超时或输出触发价格事实校验时，自动回退本地回答
- 前端观测台显示当前模式、模型、Prompt 版本与 Token；平台侧读取 `/api/agent/capabilities`

### 4.4 会话与隐私

- 会话通过 `zy_sid` HttpOnly Cookie 绑定，消息与槽位保存在服务端，刷新后可继续
- 会话最多保留 60 条消息，Agent 日志最多 500 条，运行时事件最多 5,000 条
- 日志写入前对手机号、身份证号、邮箱做掩码
- 合成数据完全本地生成；配置 LLM 时，仅发送必要的商品事实与画像摘要，不发送完整行为明细

---

## 5. 商城前台

- **首页**：编辑级排版、个性化推荐（展示真实 trace 权重与理由）、Lookbook、品类索引、AI Atelier 说明
- **列表页**：9 品类、多选颜色/尺码/场景/风格/价格、搜索结果排序、移动端筛选抽屉
- **详情页**：颜色/尺码/库存、AI 建议尺码、面料细节视图、尺码表、评价分布、整套搭配一键加购
- **购物袋**：库存校验、优惠券（`NEW15`、`ZHIYAN10`、`FREESHIP`）、免邮进度、搭配推荐
- **结算**：三步表单、服务端 Zod 校验、订单号生成、测试支付成功页
- **账户**：订单与物流、RFM 画像、行为时间线、可编辑风格坐标、心愿单
- **移动优先**：小程序式底部导航（首页 / 分类 / 造型师 / 心愿 / 我的）；画像收在后台，前台只展示风格摘要、尺码与订单状态，详细偏好按需展开
- **会员登录**：微信 OAuth 与手机号验证码双入口；微信回调使用 HMAC 签名 state 防 CSRF，服务端会话 Cookie 只保存随机令牌并按 SHA-256 哈希校验，30 天可撤销；生产环境关闭 `DEMO_AUTH` 并接入真实开放平台与短信供应商
- **用户隔离**：每位会员拥有独立 `userId`，订单、购物袋、心愿单、画像与 Agent 上下文均按会员隔离
- **视觉**：暖象牙 / 墨黑 / 陶土色，衬线中文标题，手绘 SVG 服装线稿，无外部图片依赖

---

## 6. 用户端 / 管理端 / Agent 服务

| 端 | 目录 | 技术栈 | 主要路由 / 接口 |
| --- | --- | --- | --- |
| 用户端 | `src/app/(store)`、`src/components/storefront` | Next.js RSC、React 19、Tailwind 4、SSE | `/`、`/shop`、`/account`、`/stylist` |
| 管理端 | `src/app/admin`、`src/components/admin` | Next.js App Router、HMAC Cookie、Tailwind、Client 表单 | `/admin`、`/admin/new`、`/admin/agents/:id` |
| Agent 服务 | `src/lib/agent`、`src/lib/agents`、`src/app/api/agent*` | Agent Runtime、11 工具、RAG、护栏、Registry | `/api/agent/*`、`/api/agents/*`、`/api/v1/agents/:slug` |

- 用户端与管理端在同一个 Next.js 部署中，通过路由组/目录隔离；不是两个独立服务。
- 管理端需要 `AGENT_ADMIN_TOKEN`，默认不暴露在用户端导航；生产建议放在 VPN/内网/网关鉴权后。
- 详细技术栈：[用户端](docs/user-app.md)、[管理端](docs/admin-app.md)。

<p align="center">
  <img src="docs/screenshots/admin-dashboard.png" width="820" alt="Agent 管理端：草稿、上架、下架、版本与 Key" />
</p>

### Agent 服务与平台观测

| 能力 | 接口 | 内容 |
| --- | --- | --- |
| 能力发现 | `GET /api/agent/capabilities` | 服务/Prompt 版本、模式、模型、11 个工具、SSE 事件、限流、护栏、知识库规模 |
| 健康检查 | `GET /api/health` | `checks.agent`、`checks.llm`、存储、推荐引擎、配置告警 |
| 指标 | `GET /api/metrics` | Agent P95、护栏命中、意图分布、正负反馈、GMV/CVR/NPS |
| SSE 对话 | `POST /api/agent/chat` | `meta → stage → trace → products/outfit → delta → done` |
| Agent 管理 | `/api/agents/*` | 草稿、上架/下架、不可变版本、回滚、调用 Key |
| 运行时调用 | `GET/POST /api/v1/agents/:slug` | 公开元数据 + `zya_` Key JSON 调用 |
| 评测 | `npm run eval:agent` | 意图/槽位/RAG/注入金标与阈值 |
| 审计 | 存储层 `auditLogs` | 会员登录、订单、退款等事件；由平台/SIEM 读取 |

生产参数（模型 Key、Agent 开关、限流）通过环境变量与密钥管理下发。完整契约见 [`docs/agent-service-contract.md`](docs/agent-service-contract.md)。

---

## 7. 数据与持久化

默认文件驱动：

```text
.data/zhiyan-state.json     # 原子写入（临时文件 + rename）
```

首次启动会写入种子数据：59 笔订单、160 个画像、约 3,500 条行为、Agent 日志、心愿单等。
删除该文件即可重置合成数据（服务停止时操作）。

可选 PostgreSQL：

```bash
# .env
DATABASE_URL=postgresql://zhiyan:password@postgres:5432/zhiyan
```

使用单表 JSONB 文档（`zhiyan_app_state`），启动时自动建表；适合单实例或明确的主写入部署。要水平扩展，应将购物袋、会话、订单、遥测拆成独立表并使用行级锁/事务——见 `docs/architecture.md` 的演进章节。

---

## 8. 离线 ML 管线

样本数据与模型卡产物可以完全用 Python 标准库复现：

```bash
python ml/scripts/simulate_pipeline.py
# -> ml/data/*.csv
# -> ml/artifacts/offline-eval.json
# -> src/lib/engine/artifacts/offline-eval.json（模型卡与评测）
```

生产级管线（需要 Spark / PyTorch / LightGBM）：

```bash
python -m venv .venv
pip install -r ml/requirements.txt

spark-submit --master 'local[*]' ml/spark/feature_engineering.py \
  --interactions ml/data/interactions.csv \
  --products ml/data/products.csv \
  --out ml/artifacts/spark

python ml/train/two_tower.py \
  --interactions ml/data/interactions.csv \
  --out ml/artifacts/two_tower --epochs 24 --dim 64

python ml/train/rank_lgbm.py \
  --features ml/data/ranking_features.csv \
  --out ml/artifacts/ranker

python ml/eval/offline_eval.py \
  --user-embeddings ml/artifacts/two_tower/user_embeddings.npy \
  --item-embeddings ml/artifacts/two_tower/item_embeddings.npy \
  --id-maps ml/artifacts/two_tower/id_maps.json \
  --test ml/data/interactions.csv \
  --out ml/artifacts/offline_eval.json
```

在线服务当前使用确定性哈希嵌入作为**零依赖回退**；生产接入双塔向量时，保持 `EMBEDDING_DIM`/归一化与在线索引一致即可。详见 `docs/model-card.md`。

---

## 9. 质量与安全

- **测试**：78 个 Vitest 用例覆盖意图/槽位金集、召回排序、搭配、定价优惠券、库存承诺、密码哈希、会员会话、微信 OAuth state、Agent 意图/槽位/RAG/注入评测、推荐不变量、LLM 密钥加密与供应商解析；Playwright 12 项基础端到端冒烟覆盖下单、取消、微信/手机号会员登录、移动端个人中心、Agent 能力契约与 SSE；配置 AGENT_ADMIN_TOKEN 时额外执行 2 项：Agent 上架/下架/回滚/Key 生命周期、管理端登录（共 14 项）
- **类型**：`strict: true` + `noUnusedLocals` + `noUnusedParameters`
- **健康检查**：`GET /api/health`（存储、引擎、LLM、环境配置检查与启动告警）
- **指标**：`GET /api/metrics`（Prometheus 文本）
- **身份**：scrypt 密码哈希、5 次失败锁定 15 分钟、服务端可撤销会话、角色 RBAC
- **审计**：登录/退出/失败、设置、灰度、订单/退款全量记录，保留 1,000 条
- **订单**：库存承诺校验、幂等键、取消/退货释放、原子写队列
- **限流**：Agent 24 次/分钟/IP，下单 12 次/分钟，会员验证码 8 次/分钟
- **安全响应头**：CSP、X-Frame-Options、nosniff、Referrer-Policy、Permissions-Policy
- **输入校验**：Zod 覆盖购物袋、下单、画像、事件与会员登录
- **可访问性**：搜索/购物袋/筛选/尺码/移动导航均使用焦点陷阱、Escape 关闭、焦点恢复与滚动锁定
- **SEO**：canonical、OpenGraph 图、Organization/Product JSON-LD、manifest、security.txt
- **数据**：同一 Cookie 会话内购物袋；测试订单不会真实扣款

详见 `docs/security.md`。

---

## 10. 部署形态

仓库提供三种部署组合，覆盖从单实例验证到生产代理模板：

| 形态 | 组成 | 适用 |
| --- | --- | --- |
| 单实例文件存储 | Next.js standalone / Docker，`.data` 原子写 JSON | 单写者部署、功能与集成验证 |
| PostgreSQL | Compose `postgres` profile，单表 JSONB | 需要持久化与单主写入的部署 |
| Nginx 边缘 | SSE 不缓冲、静态缓存、基础限流、TLS 终止 | 生产代理模板与多实例前置代理 |

镜像采用多阶段构建，运行时暴露 `/api/health` 探针；用户端与管理端在同一 Next.js 进程中，通过路由隔离。`render.yaml` 提供 Docker Runtime 的 Render Blueprint，使用免费实例时数据目录位于临时文件系统，重启后重置；需要持久化时挂载持久磁盘并把 `DATA_DIR` 指向挂载点。生产环境的 TLS、备份、扩容、回滚与密钥轮换清单见 [`docs/deployment.md`](docs/deployment.md) 与 [`docs/runbook.md`](docs/runbook.md)。

---

## 11. 已知边界与后续演进

1. 商品、用户、评价与 A/B 指标均为**合成数据**；未接入真实商品中心/PIM、支付、物流与台账。结算使用订单承诺库存 + 幂等键 + 单实例互斥，生产多实例需数据库事务与行锁。
2. 文件存储为单写者模型；多副本部署请切换 PostgreSQL 并拆分核心表。
3. 限流为进程内实现；多实例需要 Redis 或边缘网关统一限流。
4. Agent 已具备 capabilities / health / metrics / 评测门禁；生产建议接入统一告警、日志平台与密钥管理。
5. 默认未启用外部 LLM；启用后需补充供应商侧数据协议、内容审核与成本配额。
6. 向量检索在当前规模使用精确 cosine；商品量级上万后应切换 FAISS/Milvus/pgvector 并保留同样的召回接口。
7. 三套以上搭配目前按「先给第一套，再按偏好继续」呈现；多方案并排生成可作为下一迭代。

---

## 12. 文档索引

- [`docs/architecture.md`](docs/architecture.md) — 模块边界、算法细节、数据模型、扩展路径
- [`docs/user-app.md`](docs/user-app.md) — 用户端页面、技术栈、登录与 Agent 体验
- [`docs/admin-app.md`](docs/admin-app.md) — 管理端技术栈、认证、生命周期与安全边界
- [`docs/deployment.md`](docs/deployment.md) — Docker / Compose / Nginx / Postgres / TLS / 观测
- [`docs/public-deployment.md`](docs/public-deployment.md) — Render / Docker / VPS 公开部署拓扑与安全约束
- [`docs/runbook.md`](docs/runbook.md) — 健康检查、故障处理、备份恢复、密钥轮换
- [`docs/model-card.md`](docs/model-card.md) — 离线模型、数据、指标、偏差与限制
- [`docs/api.md`](docs/api.md) — 接口、请求/响应、错误码、限流
- [`docs/security.md`](docs/security.md) — 威胁模型、护栏、隐私、安全基线
- [`docs/agent-service-contract.md`](docs/agent-service-contract.md) — Agent API、SSE 事件、能力发现、SLO 与版本策略
- [`docs/agent-evaluation.md`](docs/agent-evaluation.md) — 意图/槽位/RAG/注入评测基线、阈值与扩展方法
- [`docs/agent-platform.md`](docs/agent-platform.md) — Agent Registry、上架/下架、版本、Key、CLI 与运行时边界
- [`docs/agent-platform-openapi.yaml`](docs/agent-platform-openapi.yaml) — 管理端与运行时 OpenAPI 3.1 契约
- [`docs/operation-manual.md`](docs/operation-manual.md) — 启动、Agent 运维、登录/订单、备份、排障
- [`docs/production-readiness-gap.md`](docs/production-readiness-gap.md) — P0/P1/P2 上线差距清单
- [`ml/README.md`](ml/README.md) — 离线管线与产物契约

---

© 2026 织言 ZHIYAN · 商品、订单、用户与指标均为合成数据，用于功能与工程验证。
