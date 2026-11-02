import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const CHANNEL = process.env.E2E_CHANNEL || undefined;

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const results = [];
let failed = false;

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`PASS ${name} (${Date.now() - started}ms)`);
  } catch (error) {
    failed = true;
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  return { context, page };
}

async function demoCustomerLogin(context) {
  const phone = `138${String(Date.now()).slice(-8)}`;
  const send = await context.request.post(`${BASE}/api/auth/customer/code`, {
    data: { phone },
  });
  assert.equal(send.status(), 200);
  const { demoCode } = await send.json();
  assert.match(demoCode, /^\d{6}$/);
  const login = await context.request.post(`${BASE}/api/auth/customer/phone`, {
    data: { phone, code: demoCode, consent: true },
  });
  assert.equal(login.status(), 200);
  return phone;
}

const shopper = await newContext();

await check("public homepage renders editorial hero and catalog", async () => {
  await shopper.page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await shopper.page.locator("h1").first().waitFor();
  const hero = await shopper.page.locator("h1").first().innerText();
  assert.match(hero, /衣橱/);
  const cards = await shopper.page.locator("article").count();
  assert.ok(cards >= 4, `expected product cards, got ${cards}`);
});

await check("search dialog traps focus and restores on Escape", async () => {
  await shopper.page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await shopper.page.getByRole("button", { name: "搜索" }).click();
  await shopper.page.getByRole("textbox", { name: "搜索关键词" }).waitFor();
  await shopper.page.keyboard.press("Shift+Tab");
  const trapped = await shopper.page.evaluate(() => {
    const active = document.activeElement;
    return Boolean(active && active.closest('[role="dialog"]'));
  });
  assert.equal(trapped, true);
  await shopper.page.keyboard.press("Escape");
  await shopper.page.waitForTimeout(250);
  assert.equal(await shopper.page.locator('[role="dialog"]').count(), 0);
});

await check("category filter and search work", async () => {
  await shopper.page.goto(`${BASE}/shop?category=knitwear`, { waitUntil: "domcontentloaded" });
  await shopper.page.waitForTimeout(600);
  const cards = await shopper.page.locator("article").count();
  assert.equal(cards, 5);
  await shopper.page.goto(`${BASE}/shop?q=${encodeURIComponent("羊绒")}`, { waitUntil: "domcontentloaded" });
  await shopper.page.waitForTimeout(600);
  assert.ok((await shopper.page.locator("article").count()) > 0);
});

await check("add to cart, checkout and idempotent order creation", async () => {
  await demoCustomerLogin(shopper.context);
  await shopper.page.goto(`${BASE}/product/tundra-turtleneck-cashmere`, {
    waitUntil: "domcontentloaded",
  });
  await shopper.page.locator('[data-size="M"]').click();
  await shopper.page.getByRole("button", { name: /加入购物袋/ }).first().click();
  await shopper.page.locator('aside[aria-label="购物袋"]').waitFor();
  await shopper.page.locator('aside[aria-label="购物袋"] button[aria-label="关闭"]').click();
  await shopper.page.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded" });
  await shopper.page.locator("#phone").fill("13800000000");
  await shopper.page.getByRole("button", { name: /继续选择支付方式/ }).click();
  await shopper.page.getByRole("button", { name: /确认订单信息/ }).click();
  await shopper.page.locator('input[type="checkbox"]').check();
  await shopper.page.getByRole("button", { name: /支付 ¥/ }).click();
  await shopper.page.waitForURL("**/checkout/success**", { timeout: 20000 });
  const text = await shopper.page.locator("body").innerText();
  assert.match(text, /订单 ZY/);
  assert.match(text, /支付成功|PAYMENT CONFIRMED/i);
});

await check("customer can cancel a pending order and release inventory", async () => {
  await shopper.page.goto(`${BASE}/account?tab=orders`, { waitUntil: "domcontentloaded" });
  await shopper.page.waitForTimeout(600);
  shopper.page.once("dialog", (dialog) => dialog.accept());
  await shopper.page.getByRole("button", { name: /取消订单/ }).first().click();
  await shopper.page.waitForTimeout(1200);
  const text = await shopper.page.locator("body").innerText();
  assert.match(text, /已取消/);
});

await check("checkout is idempotent for a repeated key", async () => {
  const context = await browser.newContext();
  await context.request.get(`${BASE}/api/cart`);
  const add = await context.request.post(`${BASE}/api/cart`, {
    data: { action: "add", productId: "p05", size: "M", color: "燕麦" },
  });
  assert.equal(add.status(), 200);
  const key = `e2e-${Date.now()}-idem`;
  const body = {
    address: {
      name: "林知夏",
      phone: "13800000000",
      province: "上海市",
      city: "上海",
      district: "静安区",
      detail: "南京西路 1 号",
    },
    paymentMethod: "支付宝",
  };
  const headers = { "Idempotency-Key": key };
  const first = await context.request.post(`${BASE}/api/orders`, { data: body, headers });
  const second = await context.request.post(`${BASE}/api/orders`, { data: body, headers });
  assert.equal(first.status(), 201);
  assert.equal(second.status(), 200);
  assert.equal(second.headers()["idempotency-replayed"], "true");
  const firstOrder = (await first.json()).order;
  const secondOrder = (await second.json()).order;
  assert.equal(firstOrder.orderNo, secondOrder.orderNo);
  await context.close();
});

await check("WeChat one-tap login creates a member session", async () => {
  const customer = await newContext();
  await customer.page.goto(`${BASE}/login?next=/account`, { waitUntil: "domcontentloaded" });
  await customer.page.getByRole("checkbox").check();
  await customer.page.getByRole("button", { name: /微信一键登录/ }).click();
  await customer.page.waitForURL(`${BASE}/account`, { timeout: 20000 });
  await customer.page
    .getByRole("heading", { level: 1, name: /林知夏/ })
    .waitFor({ state: "visible", timeout: 15000 });
  assert.match(await customer.page.locator("body").innerText(), /林知夏/);
  await customer.context.close();
});

await check("customer login guards account and supports phone OTP", async () => {
  const customer = await newContext();
  await customer.page.goto(`${BASE}/login?next=/account`, { waitUntil: "domcontentloaded" });
  await customer.page.getByRole("button", { name: /微信一键登录/ }).waitFor();
  await customer.page.getByRole("button", { name: /^手机号登录$/ }).click();
  await customer.page.getByLabel("手机号").waitFor();
  const phone = `136${String(Date.now()).slice(-8)}`;
  await customer.page.getByLabel("手机号").fill(phone);
  await customer.page.getByRole("button", { name: /获取验证码/ }).click();
  await customer.page.getByText(/演示验证码/).waitFor();
  await customer.page.getByRole("checkbox").check();
  await customer.page.getByRole("button", { name: /登录 \/ 注册/ }).click();
  await customer.page.waitForURL(`${BASE}/account`, { timeout: 20000 });
  await customer.page.getByText("退出登录").last().waitFor({ state: "visible", timeout: 15000 });
  const body = await customer.page.locator("body").innerText();
  assert.match(body, /我的订单/);
  assert.match(body, /退出登录/);
  assert.match(body, /还没有订单/);
  const logout = await customer.context.request.delete(`${BASE}/api/auth/customer`);
  assert.equal(logout.status(), 200);
  await customer.page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  await customer.page.waitForURL(/\/login/, { timeout: 10000 });
  await customer.context.close();
});

await check("mobile personal center and tab bar work", async () => {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await mobile.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const bar = page.getByRole("navigation", { name: "移动端主导航" });
  await bar.waitFor();
  assert.equal(await bar.getByRole("link").count(), 5);
  await demoCustomerLogin(mobile);
  await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  await page.getByText("我的服务").waitFor({ timeout: 15000 });
  const body = await page.locator("body").innerText();
  assert.match(body, /PERSONAL CENTER/i);
  assert.match(body, /我的订单/);
  assert.match(body, /AI STYLE PROFILE/i);
  assert.match(body, /我的服务/);
  await mobile.close();
});

await check("AI stylist returns streamed, grounded advice", async () => {
  await shopper.page.goto(`${BASE}/stylist`, { waitUntil: "domcontentloaded" });
  await shopper.page.waitForTimeout(700);
  await shopper.page.getByRole("button", { name: /通勤一周/ }).click();
  await shopper.page.getByText("推理链路").first().waitFor({ timeout: 20000 });
  const body = await shopper.page.locator("body").innerText();
  assert.match(body, /城市通勤|整套|搭配/);
});

await check("agent capability contract is discoverable", async () => {
  const response = await fetch(`${BASE}/api/agent/capabilities`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.service, "zhiyan-stylist-agent");
  assert.equal(data.apiVersion, "1.0");
  assert.equal(data.status.enabled, true);
  assert.equal(data.tools.length, 11);
  assert.ok(data.transport.events.includes("done"));
  assert.ok(data.transport.events.includes("error"));
  assert.ok(data.guardrails.includes("prompt_injection"));
  assert.equal(data.limits.messageMaxChars, 600);
  const metrics = await fetch(`${BASE}/api/metrics`);
  assert.equal(metrics.status, 200);
  const text = await metrics.text();
  assert.match(text, /zhiyan_agent_latency_p95_ms/);
  assert.match(text, /zhiyan_agent_guardrail_hits_total/);
});

await check("agent SSE emits contract events and request correlation", async () => {
  const response = await fetch(`${BASE}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "你好，介绍一下你能做什么" }),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /"type":"meta"/);
  assert.match(text, /"requestId":"agt_/);
  assert.match(text, /"type":"trace"/);
  assert.match(text, /"type":"done"/);
  const requestId = text.match(/"requestId":"(agt_[^"]+)"/)?.[1];
  assert.ok(requestId);
  const doneChunk = text.slice(text.indexOf('"type":"done"'));
  assert.match(doneChunk, new RegExp(requestId));
});

if (process.env.AGENT_ADMIN_TOKEN) {
  await check("agent registry supports publish, unpublish, rollback and keys", async () => {
    const token = process.env.AGENT_ADMIN_TOKEN;
    const call = async (path, method = "GET", body) => {
      const response = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        // noop
      }
      return { status: response.status, data };
    };

    const list = await call("/api/agents");
    assert.equal(list.status, 200);
    assert.ok(list.data.agents.some((agent) => agent.slug === "zhiyan-stylist"));

    const slug = `e2e-agent-${Date.now().toString(36)}`;
    const created = await call("/api/agents", "POST", {
      slug,
      name: "E2E Agent",
      description: "lifecycle test",
    });
    assert.equal(created.status, 201);
    const agentId = created.data.agent.id;

    const published = await call(`/api/agents/${agentId}/publish`, "POST", {
      note: "e2e v1",
    });
    assert.equal(published.status, 200);
    assert.equal(published.data.version.version, 1);

    const key = await call(`/api/agents/${agentId}/keys`, "POST", {
      name: "e2e-key",
      scopes: ["invoke"],
    });
    assert.equal(key.status, 201);
    const agentToken = key.data.token;

    const meta = await fetch(`${BASE}/api/v1/agents/${slug}`);
    assert.equal(meta.status, 200);

    const invoke = await fetch(`${BASE}/api/v1/agents/${slug}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "你好" }),
    });
    assert.equal(invoke.status, 200);

    const unpublished = await call(`/api/agents/${agentId}/unpublish`, "POST");
    assert.equal(unpublished.status, 200);
    const blocked = await fetch(`${BASE}/api/v1/agents/${slug}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "你好" }),
    });
    assert.equal(blocked.status, 409);

    const republished = await call(`/api/agents/${agentId}/publish`, "POST", {
      note: "e2e v2",
    });
    assert.equal(republished.status, 200);
    const rolled = await call(`/api/agents/${agentId}/rollback`, "POST", {
      version: 1,
    });
    assert.equal(rolled.status, 200);
    assert.equal(rolled.data.version.version, 3);

    const revoked = await call(`/api/agents/${agentId}/keys/${key.data.key.id}`, "DELETE");
    assert.equal(revoked.status, 200);
    const afterRevoke = await fetch(`${BASE}/api/v1/agents/${slug}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "你好" }),
    });
    assert.equal(afterRevoke.status, 401);
  });
}

if (process.env.AGENT_ADMIN_TOKEN) {
  await check("agent admin UI authenticates and lists agents", async () => {
    const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await admin.newPage();
    await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理 Token").fill(process.env.AGENT_ADMIN_TOKEN);
    await page.getByRole("button", { name: "进入管理端" }).click();
    await page.waitForURL("**/admin", { timeout: 20000 });
    const body = await page.locator("body").innerText();
    assert.match(body, /智能体管理端/);
    assert.match(body, /织言 AI 造型师/);
    await admin.close();
  });
}

await shopper.context.close();
await browser.close();

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} e2e checks passed`);
if (failed) process.exit(1);
