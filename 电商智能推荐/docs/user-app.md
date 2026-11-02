# 用户端（Storefront）

> 目录：`src/app/(store)`、`src/components/storefront`、`src/components/product`、`src/components/stylist`、`src/components/auth`

## 1. 定位

面向消费者的服装商城 + 会员中心 + AI 造型师，移动优先（390px 设计验证），同时支持桌面编辑级排版。

## 2. 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Next.js 16 App Router / React 19 Server Components |
| 语言 | TypeScript strict |
| 样式 | Tailwind CSS 4（CSS-first tokens）+ 手绘 SVG 商品线稿 |
| 状态 | React client islands + Context（Cart / Wishlist / Toast） |
| 数据 | Store 层（JSON 文件或 PostgreSQL JSONB） |
| 登录 | 微信 OAuth / 手机号验证码，服务端会话 Cookie |
| Agent | SSE `/api/agent/chat`、RAG 商品卡、搭配与尺码工具 |
| 部署 | Next.js standalone / Docker / Nginx（SSE 不缓冲） |

## 3. 页面与交互

| 路由 | 内容 |
| --- | --- |
| `/` | 移动端底部导航、编辑级 Hero、个性化「为你精选」、LOOKBOOK、品类 |
| `/shop` | 多选筛选、排序、语义搜索 |
| `/product/[slug]` | 颜色/尺码/库存、AI 尺码、RAG 理由、整套搭配 |
| `/cart` | 库存校验、优惠券、免邮进度、搭配建议 |
| `/checkout` | 三步表单、幂等下单、演示支付 |
| `/checkout/success` | 订单确认与推荐 |
| `/login` | 微信一键登录 / 手机号验证码 |
| `/account` | 移动端个人中心：订单状态、风格档案、心愿单、服务、退出 |
| `/stylist` | SSE 造型师对话 + Agent 观测面板 |
| `/help` | 配送、退换、尺码、养护、AI 透明度 |

## 4. 用户数据与权限

- `zy_sid`：匿名会话（购物袋、对话），HttpOnly。
- `zy_customer`：会员会话，HttpOnly + SHA-256 哈希 + 30 天，可撤销。
- 每个会员独立 `userId`；订单、购物袋、心愿单、画像按会员隔离。
- `/account` 未登录跳转 `/login?next=…`，`next` 只接受站内路径。
- 测试会员由种子数据生成，其他手机号创建独立会员；生产设置 `DEMO_AUTH=false` 并接入真实微信/短信供应商。

## 5. Agent 在用户端的表现

- 首页「为你精选」和商品详情理由由推荐引擎 + RAG 生成。
- 造型师通过 `POST /api/agent/chat` 返回 SSE：
  `meta → stage → trace → products/outfit → delta → done`。
- 工具包括推荐、整套搭配、尺码、政策检索、对比、购物袋、订单、偏好更新。
- 下架默认 Agent 后，用户端对话返回 503；前端应显示维护态。
- 前端观测面板展示意图、槽位、工具、召回来源、护栏、时延；不展示后台管理能力。

## 6. 工程验证

- Vitest 覆盖购物袋、结算、会员会话、订单状态与 Agent 相关逻辑。
- Playwright 冒烟覆盖下单、取消、会员登录、移动端个人中心、Agent 契约与生命周期；配置 `AGENT_ADMIN_TOKEN` 时额外执行管理端用例。
- 界面截图位于 `docs/screenshots/*`，移动端流程 GIF 位于 `docs/demo.gif`。

## 7. 边界

- 微信/SMS/支付/物流是演示或待接资质；真实上线见 [`production-readiness-gap.md`](production-readiness-gap.md)。
- 用户端与管理端在同一个 Next.js 应用中，通过路由组隔离；不是两个独立服务。
