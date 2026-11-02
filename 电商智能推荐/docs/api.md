# API 参考 · ZHIYAN

所有接口默认同源；写接口校验 `Origin`，并返回 `Cache-Control: no-store`。
会话通过 HttpOnly Cookie `zy_sid` 绑定。请求体上限约 1 MB（Nginx 层 2 MB）。

## 1. 公共接口

| 方法 | 路径 | 认证 | 限流 | 说明 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 无 | 无 | 健康检查（含 `checks.agent`） |
| GET | `/api/metrics` | 无 | 无 | Prometheus 文本（含 `zhiyan_agent_*`） |
| GET | `/api/agent/capabilities` | 无 | 无 | Agent 能力发现、版本、工具、SSE 事件与限制 |
| GET | `/api/search` | 无 | 无 | 商品检索 |
| POST | `/api/reco` | 无 | 90/min/IP | 推荐结果 + trace |
| GET/POST | `/api/cart` | 会话 Cookie | — | 购物袋 |
| GET/POST | `/api/wishlist` | 会话 Cookie | 60/min/IP | 心愿单 |
| POST | `/api/events` | 会话 Cookie | 180/min/IP | 行为上报 |
| GET/POST | `/api/orders` | 会话 Cookie | POST 12/min/IP | 订单与结算（支持 `Idempotency-Key`） |
| POST | `/api/orders/actions` | 会话 Cookie | 20/min/IP | 取消 / 退货 |
| GET/POST | `/api/profile` | 会话 Cookie | POST 30/min/IP | 画像 |
| POST | `/api/agent/chat` | 会话 Cookie | 24/min/IP | SSE 对话 |
| GET/DELETE | `/api/agent/history` | 会话 Cookie | — | 会话消息 |
| POST | `/api/agent/feedback` | 会话 Cookie | — | 赞/踩 |
| POST | `/api/auth/customer/code` | 无 | 8/min/IP；1/30s/手机号 | 发送登录验证码；演示模式回显 `demoCode` |
| POST | `/api/auth/customer/phone` | 无 | 12/min/IP | 手机号 + 验证码登录/注册 |
| POST | `/api/auth/customer/wechat` | 无 | 10/min/IP | 微信一键登录（演示模式为模拟授权） |
| GET | `/api/auth/wechat/start` | 无 | — | 生成微信 OAuth state 并跳转开放平台 |
| GET | `/api/auth/wechat/callback` | 微信 state Cookie | 20/min/IP | 校验 state、换取 openid、建立会员会话 |
| DELETE | `/api/auth/customer` | 会员 Cookie | — | 撤销会员会话并退出 |
| POST | `/api/ops/orders` | `OPS_TOKEN` Bearer | 60/min/IP | OMS 发货/完成/退款；未配置 Token 时 503 |

会员登录 Cookie `zy_customer` 只保存随机令牌，服务端保存 SHA-256 哈希、IP、UA 与 30 天有效期；登录成功写入 `customer.login` 审计事件，退出写入 `customer.logout`。验证码 5 分钟有效、最多尝试 5 次，且发送按手机号冷却 30 秒。

## 2. Agent 服务契约

完整契约见 [`agent-service-contract.md`](agent-service-contract.md)。关键端点：

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/agent/capabilities` | 无 | 服务/Prompt 版本、工具、SSE 事件、限流、护栏 |
| POST | `/api/agent/chat` | 匿名 `zy_sid` | SSE 对话，首包 `meta`，结束 `done` 或 `error` |
| GET | `/api/health` | 无 | `checks.agent` / `checks.llm` |
| GET | `/api/metrics` | 无 | Prometheus，含 `zhiyan_agent_*` |

管理端 `/admin` 使用 `AGENT_ADMIN_TOKEN` 登录；模型 Key/Agent 开关等生产参数仍由环境变量与密钥管理下发。

## 3. 请求与响应

### 3.1 `GET /api/search`

```http
GET /api/search?q=通勤大衣&limit=5
```

```json
{
  "products": [ /* Product[] */ ],
  "total": 5,
  "tookMs": 1.2,
  "suggestions": ["雾凇双面羊绒大衣", "长堤双排扣风衣"]
}
```

### 3.2 `POST /api/reco`

```json
{
  "scene": "home",
  "limit": 8,
  "query": "通勤 大衣",
  "constraints": {
    "categories": ["outerwear"],
    "colors": ["驼色"],
    "priceMax": 3000
  }
}
```

响应：

```json
{
  "items": [
    {
      "product": { "id": "p03", "name": "长堤双排扣风衣", "price": 2580 },
      "score": 0.81,
      "rank": 1,
      "sources": ["vector", "collaborative", "rule"],
      "factors": [{ "key": "affinity", "label": "画像亲和", "weight": 0.17, "contribution": 0.14 }],
      "reason": {
        "headline": "法式衣橱的下一件",
        "detail": "……",
        "evidence": [{ "source": "商品特征", "label": "棉 65% · 保暖 3/5", "detail": "…" }],
        "confidence": 0.9,
        "generator": "template"
      },
      "matchedTags": ["驼色偏好", "通勤", "现货"]
    }
  ],
  "trace": {
    "requestId": "rec_…",
    "variant": "B",
    "recall": [
      { "source": "vector", "label": "向量召回 · Embedding ANN", "candidates": 32, "contributed": 6, "latencyMs": 2.1 }
    ],
    "weights": { "semantic": 0.2, "collaborative": 0.19, "…": 0 },
    "rankingFormula": "语义匹配 20% + 协同信号 19% + …",
    "totalLatencyMs": 12.4
  },
  "profile": { "archetype": "静奢极简", "tags": ["高价值", "静奢偏好"], "coldStart": false }
}
```

### 3.3 购物袋

GET：

```json
{
  "cart": {
    "sessionId": "s_…",
    "lines": [
      {
        "productId": "p05",
        "product": { "…": "…" },
        "size": "M",
        "color": "燕麦",
        "qty": 1,
        "unitPrice": 1680,
        "lineTotal": 1680,
        "stock": 14,
        "valid": true,
        "issue": null
      }
    ],
    "summary": {
      "subtotal": 1680,
      "discount": 0,
      "shipping": 0,
      "total": 1680,
      "points": 168,
      "freeShippingUnlocked": true,
      "couponCode": null,
      "couponError": null
    }
  }
}
```

POST body：

```json
{ "action": "add", "productId": "p05", "size": "M", "color": "燕麦", "qty": 1 }
{ "action": "update", "index": 0, "qty": 2 }
{ "action": "remove", "index": 0 }
{ "action": "coupon", "code": "NEW15" }
```

### 3.4 结算

```json
{
  "address": {
    "name": "林知夏",
    "phone": "13800000000",
    "province": "上海市",
    "city": "上海",
    "district": "静安区",
    "detail": "南京西路 1266 号 8 栋 1201"
  },
  "paymentMethod": "支付宝",
  "couponCode": "NEW15",
  "channel": "官网",
  "note": "周末送达"
}
```

成功：`201 { "order": { "orderNo": "ZY2026…", … } }`。
库存不足/优惠券不满足返回 `409`/`400`，错误在 `error` 字段。

幂等：客户端应为一次结算生成稳定的 `Idempotency-Key`（8–128 字符，匹配 `[A-Za-z0-9._:-]`）。相同 Key 的重试返回原订单与 `200`，并带 `Idempotency-Replayed: true`，不会重复扣减库存。

取消/退货：`POST /api/orders/actions`，body `{ "orderNo": "ZY…", "action": "cancel" | "return" }`。`cancel` 仅限待发货；`return` 仅限已发货/已完成。状态变更写入订单时间线与审计日志，库存承诺随之释放。

### 3.5 画像

`POST /api/profile`：

```json
{
  "styleKeywords": ["静奢", "极简"],
  "favoriteColors": ["燕麦", "炭灰"],
  "occasions": ["通勤", "约会"],
  "budget": { "min": 800, "max": 3200 },
  "height": 165,
  "weight": 52,
  "sizes": { "top": "M", "bottom": "M", "shoes": "37" },
  "preferredFit": "直身",
  "archetype": "静奢极简"
}
```

`GET /api/profile` 返回合并后的用户、覆盖字段、画像摘要（标签、RFM、行为、亲和度、尺码、身形）。

### 3.6 Agent SSE

```http
POST /api/agent/chat
Content-Type: application/json

{ "message": "下周去上海出差，帮我搭三套通勤，预算 3000" }
```

响应：`text/event-stream`，每条 `data: {...}\n\n`。

| 事件 | 数据 | 说明 |
| --- | --- | --- |
| `stage` | `{ stage, label }` | 理解 / 召回 / 排序 / RAG 阶段 |
| `trace` | `AgentTraceSnapshot` | 意图、槽位、计划、工具、召回、护栏、模式 |
| `products` | `{ items: AgentProductCard[] }` | 可渲染的商品卡 |
| `outfit` | `{ outfit: Outfit }` | 整套搭配 |
| `delta` | `{ text }` | 回答文本增量 |
| `suggestions` | `{ items: string[] }` | 后续建议 |
| `action` | `AgentAction` | 加购 / 偏好写入 |
| `done` | `{ messageId, latencyMs }` | 结束 |
| `error` | `{ message, code }` | 可展示错误 |

注意事项：

- 必须关闭代理缓冲，否则 `delta` 会被聚合
- 一行事件可能很大（商品卡包含完整摘要），不要按行截断
- `trace.tools[].status` 可能为 `skipped`（安全拦截）或 `error`

### 3.7 健康检查

```json
{
  "status": "ok",
  "version": "1.1.0",
  "uptimeSeconds": 42,
  "checks": {
    "storage": { "status": "ok", "detail": "file · schema v3", "latencyMs": 3 },
    "engine": { "status": "ok", "detail": "4 items · 5 sources · 12ms" },
    "llm": { "status": "ok", "detail": "local planner (no LLM key configured)" }
  }
}
```

`status` 为 `down` 时 HTTP 503；`degraded` 仍为 200。

## 4. 错误码

| HTTP | 场景 |
| --- | --- |
| 400 | Zod 校验失败 / 非法动作 / 请求体非 JSON |
| 401 | 会员会话无效 / 验证码错误 |
| 403 | 跨站请求 / 角色无权操作 |
| 404 | 商品/订单/日志不存在 |
| 409 | 库存不足、购物袋为空、冲突 |
| 423 | 账号锁定（连续失败 5 次，15 分钟） |
| 429 | 限流 |
| 503 | 推荐/搜索服务异常、Agent 维护中 |

错误体：

```json
{ "error": "该尺码暂时缺货" }
```

## 5. 示例

```bash
# 推荐
curl -s -X POST http://localhost:3000/api/reco \
  -H 'Content-Type: application/json' \
  -d '{"scene":"home","limit":3}' | jq '.items[].product.name'

# 加购（需要 Cookie）
curl -s -c cookies.txt http://localhost:3000/api/cart > /dev/null
curl -s -b cookies.txt -X POST http://localhost:3000/api/cart \
  -H 'Content-Type: application/json' \
  -d '{"action":"add","productId":"p05","size":"M","color":"燕麦"}'

# Agent（SSE）
curl -N -X POST http://localhost:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"帮我搭一套通勤"}' -c cookies.txt
```
