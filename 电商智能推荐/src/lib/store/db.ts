import { promises as fs } from "node:fs";
import path from "node:path";
import type { BehaviorEvent, Cart, Order, UserProfile } from "@/lib/types";
import { BEHAVIORS, DEMO_USER_ID, ORDERS, USER_MAP } from "@/lib/data/community";
import { seedAgentLogs } from "@/lib/data/agent-seeds";
import { seedAgents, seedAgentVersions } from "@/lib/data/agent-registry";
import {
  makeMemberProfile,
  seedCustomerProfiles,
  seedCustomers,
  seedTestOrders,
} from "@/lib/data/member-seeds";
import { setExperimentConfig } from "@/lib/engine/experiment";
import {
  registerUserOverrides,
  registerUserProfiles,
} from "@/lib/engine/profile";
import { setRankWeightsPreset } from "@/lib/engine/rank";
import {
  setExplanationsEnabled,
  setPersonalizationEnabled,
} from "@/lib/engine/recommend";
import type { AgentLog, ChatMessage } from "@/lib/agent/types";
import {
  DEFAULT_SETTINGS,
  type AgentApiKey,
  type AgentDefinition,
  type AgentRuntimeConfig,
  type AgentVersion,
  type AppSettings,
  type AppState,
  type AuditEvent,
  type AuditSeverity,
  type Customer,
  type CustomerOtp,
  type CustomerSession,
  type CustomerSource,
  type SessionRecord,
} from "@/lib/store/types";
import { createSessionToken, hashSessionToken } from "@/lib/auth/passwords";

const SCHEMA_VERSION = 8;
export const CUSTOMER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const demoUserId = DEMO_USER_ID;
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const STATE_FILE = path.join(DATA_DIR, "zhiyan-state.json");
const USE_POSTGRES = Boolean(process.env.DATABASE_URL);

type GlobalStore = {
  state: AppState | null;
  loading: Promise<AppState> | null;
  writeQueue: Promise<void>;
  pgPool: unknown;
  eventCache: { length: number; events: BehaviorEvent[] } | null;
};

const globalStore: GlobalStore = ((
  globalThis as unknown as { __ZHIYAN_STORE__?: GlobalStore }
).__ZHIYAN_STORE__ ??= {
  state: null,
  loading: null,
  writeQueue: Promise.resolve(),
  pgPool: null,
  eventCache: null,
});

const seedAuditLogs = (): AuditEvent[] => {
  const now = Date.now();
  const entry = (
    minutesAgo: number,
    action: string,
    detail: string,
    severity: AuditSeverity = "info",
  ): AuditEvent => ({
    id: `audit_seed_${minutesAgo}`,
    ts: new Date(now - minutesAgo * 60_000).toISOString(),
    operatorId: null,
    operatorName: "system",
    action,
    resource: "platform",
    detail,
    ip: "127.0.0.1",
    userAgent: "seed",
    severity,
  });
  return [
    entry(8, "system.start", "演示服务启动完成"),
    entry(22, "experiment.update", "v2 实验全量运行"),
    entry(47, "settings.update", "默认运行参数加载"),
    entry(160, "order.refund", "订单 ZY2026100021 退款 ¥1,280", "warning"),
    entry(320, "customer.login", "会员登录（种子）"),
    entry(1440, "system.seed", "演示环境初始化完成"),
  ];
};

const initialState = (): AppState => ({
  schemaVersion: SCHEMA_VERSION,
  createdAt: new Date().toISOString(),
  orders: [...seedTestOrders(), ...ORDERS],
  carts: {},
  wishlists: {
    [DEMO_USER_ID]: ["p03", "p26", "p18"],
  },
  profileOverrides: {},
  events: [],
  sessions: {},
  agentLogs: seedAgentLogs(),
  agents: seedAgents(),
  agentVersions: seedAgentVersions(),
  agentApiKeys: [],
  customers: seedCustomers(),
  customerProfiles: {
    ...seedCustomerProfiles(),
    [DEMO_USER_ID]: { ...USER_MAP[DEMO_USER_ID] },
  },
  customerSessions: {},
  otps: {},
  auditLogs: seedAuditLogs(),
  idempotency: {},
  settings: { ...DEFAULT_SETTINGS },
});

const migrateState = (
  raw: Partial<AppState> & { schemaVersion?: number },
): AppState => {
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `state schema ${raw.schemaVersion} is newer than supported ${SCHEMA_VERSION}`,
    );
  }
  const state = raw as AppState;
  if (!state.agents?.length) state.agents = seedAgents();
  if (!state.agentVersions) state.agentVersions = seedAgentVersions();
  if (!state.agentApiKeys) state.agentApiKeys = [];
  if (!state.customers?.length) state.customers = seedCustomers();
  if (!state.customerProfiles) state.customerProfiles = seedCustomerProfiles();
  if (!state.customerProfiles[DEMO_USER_ID]) {
    state.customerProfiles[DEMO_USER_ID] = { ...USER_MAP[DEMO_USER_ID] };
  }
  if (!state.customers.some((customer) => customer.wechatOpenId === "demo_wechat_member")) {
    state.customers.unshift(seedCustomers()[0]);
  }
  for (const customer of state.customers) {
    const legacy = customer as Customer & { userId?: string };
    if (!legacy.userId) legacy.userId = `u_${customer.id}`;
    if (!state.customerProfiles[legacy.userId]) {
      state.customerProfiles[legacy.userId] = makeMemberProfile({
        userId: legacy.userId,
        nickname: customer.nickname,
        phone: customer.phone,
      });
    }
  }
  if (!state.customerSessions) state.customerSessions = {};
  if (!state.otps) state.otps = {};
  if (!state.auditLogs?.length) state.auditLogs = seedAuditLogs();
  if (!state.idempotency) state.idempotency = {};
  state.schemaVersion = SCHEMA_VERSION;
  return state;
};

async function loadFromFile(): Promise<AppState | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppState> & { schemaVersion?: number };
    const migrated = migrateState(parsed);
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      await persistToFile(migrated);
    }
    return migrated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("[store] failed to read state file, starting fresh", error);
    return null;
  }
}

async function persistToFile(state: AppState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state), "utf8");
  await fs.rename(tmp, STATE_FILE);
}

async function getPgPool(): Promise<any> {
  if (globalStore.pgPool) return globalStore.pgPool;
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await pool.query(
    "CREATE TABLE IF NOT EXISTS zhiyan_app_state (id integer PRIMARY KEY, doc jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())",
  );
  globalStore.pgPool = pool;
  return pool;
}

async function loadFromPostgres(): Promise<AppState | null> {
  const pool = await getPgPool();
  const result = await pool.query("SELECT doc FROM zhiyan_app_state WHERE id = 1");
  const doc = result.rows[0]?.doc;
  if (!doc) return null;
  const migrated = migrateState(doc);
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    await persistToPostgres(migrated);
  }
  return migrated;
}

async function persistToPostgres(state: AppState): Promise<void> {
  const pool = await getPgPool();
  await pool.query(
    `INSERT INTO zhiyan_app_state (id, doc, updated_at) VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    [JSON.stringify(state)],
  );
}

async function persist(state: AppState): Promise<void> {
  if (USE_POSTGRES) {
    await persistToPostgres(state);
  } else {
    await persistToFile(state);
  }
}

const syncDerivedConfig = (state: AppState) => {
  registerUserOverrides(state.profileOverrides);
  registerUserProfiles(state.customerProfiles ?? {});
  setExperimentConfig({ trafficB: state.settings.trafficB });
  setRankWeightsPreset(state.settings.weightsPreset);
  setPersonalizationEnabled(state.settings.personalization);
  setExplanationsEnabled(state.settings.explanations);
};

async function init(): Promise<AppState> {
  let state: AppState | null = USE_POSTGRES ? await loadFromPostgres() : await loadFromFile();
  if (!state) {
    state = initialState();
    await persist(state);
  }
  globalStore.state = state;
  globalStore.eventCache = null;
  syncDerivedConfig(state);
  return state;
}

export async function getStore(): Promise<AppState> {
  if (globalStore.state) return globalStore.state;
  if (!globalStore.loading) {
    globalStore.loading = init().finally(() => {
      globalStore.loading = null;
    });
  }
  return globalStore.loading;
}

export async function updateStore<T>(mutator: (state: AppState) => T): Promise<T> {
  const state = await getStore();
  const result = mutator(state);
  globalStore.eventCache = null;
  const snapshot = JSON.parse(JSON.stringify(state)) as AppState;
  globalStore.writeQueue = globalStore.writeQueue
    .catch(() => undefined)
    .then(() => persist(snapshot))
    .catch((error) => {
      console.error("[store] persist failed", error);
    });
  await globalStore.writeQueue;
  return result;
}

export async function getEventStream(): Promise<BehaviorEvent[]> {
  const state = await getStore();
  if (!state.settings.realtimeSignals) {
    // Realtime signals disabled from the console: rank on the seeded stream only.
    return BEHAVIORS;
  }
  const length = state.events.length;
  if (globalStore.eventCache && globalStore.eventCache.length === length) {
    return globalStore.eventCache.events;
  }
  const events = [...state.events, ...BEHAVIORS].sort((a, b) => (a.ts < b.ts ? 1 : -1));
  globalStore.eventCache = { length, events };
  return events;
}

export async function appendEvent(input: Omit<BehaviorEvent, "id" | "ts">): Promise<BehaviorEvent> {
  const event: BehaviorEvent = {
    ...input,
    id: `ev_rt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    ts: new Date().toISOString(),
  };
  await updateStore((state) => {
    state.events.unshift(event);
    if (state.events.length > 5000) state.events.length = 5000;
  });
  return event;
}

export async function getCart(sessionId: string): Promise<Cart> {
  const state = await getStore();
  return (
    state.carts[sessionId] ?? {
      sessionId,
      userId: DEMO_USER_ID,
      lines: [],
      couponCode: null,
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function saveCart(cart: Cart): Promise<Cart> {
  const next = { ...cart, updatedAt: new Date().toISOString() };
  await updateStore((state) => {
    state.carts[next.sessionId] = next;
  });
  return next;
}

export async function getWishlist(userId: string): Promise<string[]> {
  const state = await getStore();
  return state.wishlists[userId] ?? [];
}

export async function toggleWishlist(
  userId: string,
  productId: string,
): Promise<{ wishlisted: boolean; items: string[] }> {
  return updateStore((state) => {
    const current = new Set(state.wishlists[userId] ?? []);
    const wishlisted = !current.has(productId);
    if (wishlisted) current.add(productId);
    else current.delete(productId);
    state.wishlists[userId] = [...current];
    return { wishlisted, items: state.wishlists[userId] };
  });
}

export async function getProfileOverride(userId: string): Promise<Partial<UserProfile>> {
  const state = await getStore();
  return state.profileOverrides[userId] ?? {};
}

export async function saveProfileOverride(
  userId: string,
  patch: Partial<UserProfile>,
): Promise<Partial<UserProfile>> {
  const merged = await updateStore((state) => {
    state.profileOverrides[userId] = {
      ...(state.profileOverrides[userId] ?? {}),
      ...patch,
      sizes: {
        ...(state.profileOverrides[userId]?.sizes ?? {}),
        ...(patch.sizes ?? {}),
      } as UserProfile["sizes"],
    };
    registerUserOverrides(state.profileOverrides);
    return state.profileOverrides[userId];
  });
  return merged;
}

export async function getOrdersForUser(userId: string): Promise<Order[]> {
  const state = await getStore();
  return state.orders
    .filter((order) => order.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getOrderByNo(orderNo: string): Promise<Order | undefined> {
  const state = await getStore();
  return state.orders.find(
    (order) => order.orderNo.toUpperCase() === orderNo.toUpperCase(),
  );
}

export async function getAllOrders(): Promise<Order[]> {
  const state = await getStore();
  return [...state.orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createOrder(
  order: Omit<Order, "id" | "orderNo">,
  idempotencyKey?: string | null,
): Promise<Order> {
  return updateStore((state) => {
    const created = new Date(order.createdAt);
    const sequence = 100000 + state.orders.length + 1;
    const orderNo = `ZY${created.getFullYear()}${String(sequence).padStart(6, "0")}`;
    const full: Order = {
      ...order,
      id: `ord_${sequence}`,
      orderNo,
      statusHistory: order.statusHistory ?? [
        { status: order.status, at: order.createdAt, by: "system" },
      ],
    };
    state.orders.unshift(full);

    const member = state.customerProfiles[order.userId];
    if (member) {
      member.ordersCount += 1;
      member.lifetimeValue += order.total;
      member.points += order.pointsEarned;
      member.lastActiveAt = order.createdAt;
      if (member.ordersCount >= 6) member.memberTier = "黑金";
      else if (member.ordersCount >= 2) member.memberTier = "白金";
    }

    // The order and its replay key land in the same atomic write, so a retry
    // can never observe one without the other.
    if (idempotencyKey) {
      state.idempotency[idempotencyKey] = {
        orderNo,
        createdAt: order.createdAt,
      };
      const entries = Object.entries(state.idempotency);
      if (entries.length > 500) {
        entries
          .sort((a, b) => (a[1].createdAt < b[1].createdAt ? -1 : 1))
          .slice(0, entries.length - 500)
          .forEach(([oldKey]) => delete state.idempotency[oldKey]);
      }
    }

    return full;
  });
}

export async function findOrderByNo(orderNo: string): Promise<Order | undefined> {
  const state = await getStore();
  return state.orders.find(
    (order) => order.orderNo.toUpperCase() === orderNo.toUpperCase(),
  );
}

export async function setOrderStatus(input: {
  orderNo: string;
  userId: string;
  status: Order["status"];
  actor: string;
}): Promise<Order | null> {
  return updateStore((state) => {
    const order = state.orders.find(
      (entry) => entry.orderNo.toUpperCase() === input.orderNo.toUpperCase(),
    );
    if (!order || order.userId !== input.userId) return null;
    order.status = input.status;
    order.statusHistory = [
      ...(order.statusHistory ?? [
        { status: "待发货" as const, at: order.createdAt, by: "system" },
      ]),
      {
        status: input.status,
        at: new Date().toISOString(),
        by: input.actor,
      },
    ];
    return order;
  });
}

export type OpsOrderAction = "ship" | "complete" | "refund";

export async function transitionOrder(input: {
  orderNo: string;
  action: OpsOrderAction;
  trackingNo?: string;
  amount?: number;
  actor: string;
}): Promise<{ ok: true; order: Order } | { ok: false; error: string }> {
  return updateStore((state) => {
    const order = state.orders.find(
      (entry) => entry.orderNo.toUpperCase() === input.orderNo.toUpperCase(),
    );
    if (!order) return { ok: false as const, error: "订单不存在" };
    const history = order.statusHistory ?? [
      { status: "待发货" as const, at: order.createdAt, by: "system" },
    ];
    const push = (status: Order["status"]) => {
      order.statusHistory = [
        ...history,
        { status, at: new Date().toISOString(), by: input.actor },
      ];
    };

    if (input.action === "ship") {
      if (order.status !== "待发货") {
        return { ok: false as const, error: "只有待发货订单可以发货" };
      }
      if (!input.trackingNo?.trim()) {
        return { ok: false as const, error: "发货必须提供运单号" };
      }
      order.status = "已发货";
      order.trackingNo = input.trackingNo.trim();
      order.paymentStatus ??= "paid";
      push("已发货");
      return { ok: true as const, order };
    }

    if (input.action === "complete") {
      if (order.status !== "已发货") {
        return { ok: false as const, error: "只有已发货订单可以完成" };
      }
      order.status = "已完成";
      order.paymentStatus ??= "paid";
      push("已完成");
      return { ok: true as const, order };
    }

    if (order.paymentStatus === "refunded") {
      return { ok: false as const, error: "该订单已退款" };
    }
    if (!["已发货", "已完成", "已退货"].includes(order.status)) {
      return { ok: false as const, error: "只有已发货/已完成/已退货订单可以退款" };
    }
    const amount = Math.min(
      order.total,
      Math.max(0, Math.round(input.amount ?? order.total)),
    );
    order.status = "已退货";
    order.paymentStatus = "refunded";
    order.refundAmount = amount;
    order.refundedAt = new Date().toISOString();
    push("已退货");
    return { ok: true as const, order };
  });
}

export async function getIdempotentOrder(
  key: string,
): Promise<Order | undefined> {
  const state = await getStore();
  const record = state.idempotency[key];
  if (!record) return undefined;
  return state.orders.find((order) => order.orderNo === record.orderNo);
}

export async function getSessionRecord(
  sessionId: string,
  userId = DEMO_USER_ID,
): Promise<SessionRecord> {
  const state = await getStore();
  return (
    state.sessions[sessionId] ?? {
      id: sessionId,
      userId,
      messages: [],
      lastSlots: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function getRecentMessages(
  sessionId: string,
  limit = 12,
  userId?: string,
): Promise<ChatMessage[]> {
  const session = await getSessionRecord(sessionId, userId);
  if (userId && session.userId !== userId) return [];
  return session.messages.slice(-limit);
}

export async function appendMessage(
  sessionId: string,
  userId: string,
  message: ChatMessage,
): Promise<void> {
  await updateStore((state) => {
    const session =
      state.sessions[sessionId] ??
      ({
        id: sessionId,
        userId,
        messages: [],
        lastSlots: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies SessionRecord);
    session.messages.push(message);
    if (session.messages.length > 60) session.messages = session.messages.slice(-60);
    session.updatedAt = new Date().toISOString();
    state.sessions[sessionId] = session;
  });
}

export async function saveSessionSlots(
  sessionId: string,
  userId: string,
  slots: Record<string, unknown>,
): Promise<void> {
  await updateStore((state) => {
    const session = state.sessions[sessionId];
    if (session) {
      session.lastSlots = slots;
      session.updatedAt = new Date().toISOString();
    } else {
      state.sessions[sessionId] = {
        id: sessionId,
        userId,
        messages: [],
        lastSlots: slots,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  });
}

export async function appendAgentLog(log: AgentLog): Promise<void> {
  await updateStore((state) => {
    state.agentLogs.unshift(log);
    if (state.agentLogs.length > 500) state.agentLogs.length = 500;
  });
}

export async function listAgentLogs(limit = 60): Promise<AgentLog[]> {
  const state = await getStore();
  return state.agentLogs.slice(0, limit);
}

export async function rateAgentLog(id: string, feedback: "up" | "down" | null): Promise<void> {
  await updateStore((state) => {
    const log = state.agentLogs.find((l) => l.id === id);
    if (log) log.feedback = feedback;
  });
}

export async function getProfileBase(userId: string): Promise<UserProfile | undefined> {
  const state = await getStore();
  return state.customerProfiles[userId] ?? USER_MAP[userId];
}

export async function listAgents(): Promise<AgentDefinition[]> {
  const state = await getStore();
  return [...state.agents].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getAgentById(id: string): Promise<AgentDefinition | undefined> {
  const state = await getStore();
  return state.agents.find((agent) => agent.id === id);
}

export async function getAgentBySlug(slug: string): Promise<AgentDefinition | undefined> {
  const state = await getStore();
  return state.agents.find((agent) => agent.slug === slug.toLowerCase());
}

export async function createAgent(input: {
  slug: string;
  name: string;
  description: string;
  owner: string;
  channels: AgentDefinition["channels"];
  config: AgentRuntimeConfig;
  actor: string;
}): Promise<{ ok: true; agent: AgentDefinition } | { ok: false; error: string }> {
  return updateStore((state) => {
    const slug = input.slug.trim().toLowerCase();
    if (state.agents.some((agent) => agent.slug === slug)) {
      return { ok: false as const, error: "Agent slug 已存在" };
    }
    const now = new Date().toISOString();
    const agent: AgentDefinition = {
      id: `agent_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      slug,
      name: input.name.trim(),
      description: input.description.trim(),
      owner: input.owner.trim() || "agent-team",
      adapter: "stylist",
      status: "draft",
      channels: input.channels,
      config: JSON.parse(JSON.stringify(input.config)) as AgentRuntimeConfig,
      currentVersion: null,
      publishedVersion: null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actor,
      updatedBy: input.actor,
    };
    state.agents.unshift(agent);
    return { ok: true as const, agent };
  });
}

export async function updateAgent(
  id: string,
  patch: Partial<
    Pick<AgentDefinition, "name" | "description" | "owner" | "channels" | "config">
  >,
  actor: string,
): Promise<AgentDefinition | null> {
  return updateStore((state) => {
    const agent = state.agents.find((entry) => entry.id === id);
    if (!agent) return null;
    if (patch.name !== undefined) agent.name = patch.name.trim();
    if (patch.description !== undefined) agent.description = patch.description.trim();
    if (patch.owner !== undefined) agent.owner = patch.owner.trim();
    if (patch.channels !== undefined) agent.channels = patch.channels;
    if (patch.config !== undefined) {
      agent.config = JSON.parse(JSON.stringify(patch.config)) as AgentRuntimeConfig;
    }
    agent.updatedAt = new Date().toISOString();
    agent.updatedBy = actor;
    return agent;
  });
}

export async function publishAgent(
  id: string,
  note: string,
  actor: string,
): Promise<
  { ok: true; agent: AgentDefinition; version: AgentVersion } | { ok: false; error: string }
> {
  return updateStore((state) => {
    const agent = state.agents.find((entry) => entry.id === id);
    if (!agent) return { ok: false as const, error: "Agent 不存在" };
    const versionNumber = (agent.currentVersion ?? 0) + 1;
    const now = new Date().toISOString();
    const version: AgentVersion = {
      id: `${agent.id}_v${versionNumber}`,
      agentId: agent.id,
      version: versionNumber,
      config: JSON.parse(JSON.stringify(agent.config)) as AgentRuntimeConfig,
      channels: [...agent.channels],
      note: note.trim() || `发布 v${versionNumber}`,
      createdAt: now,
      createdBy: actor,
    };
    state.agentVersions.unshift(version);
    agent.currentVersion = versionNumber;
    agent.publishedVersion = versionNumber;
    agent.status = "published";
    agent.updatedAt = now;
    agent.updatedBy = actor;
    return { ok: true as const, agent, version };
  });
}

export async function unpublishAgent(
  id: string,
  actor: string,
): Promise<{ ok: true; agent: AgentDefinition } | { ok: false; error: string }> {
  return updateStore((state) => {
    const agent = state.agents.find((entry) => entry.id === id);
    if (!agent) return { ok: false as const, error: "Agent 不存在" };
    if (agent.status !== "published") {
      return { ok: false as const, error: "只有已上架 Agent 可以下架" };
    }
    agent.status = "unpublished";
    agent.updatedAt = new Date().toISOString();
    agent.updatedBy = actor;
    return { ok: true as const, agent };
  });
}

export async function rollbackAgent(
  id: string,
  targetVersion: number,
  actor: string,
): Promise<
  { ok: true; agent: AgentDefinition; version: AgentVersion } | { ok: false; error: string }
> {
  return updateStore((state) => {
    const agent = state.agents.find((entry) => entry.id === id);
    if (!agent) return { ok: false as const, error: "Agent 不存在" };
    const target = state.agentVersions.find(
      (version) => version.agentId === id && version.version === targetVersion,
    );
    if (!target) return { ok: false as const, error: "目标版本不存在" };
    const versionNumber = (agent.currentVersion ?? 0) + 1;
    const now = new Date().toISOString();
    const version: AgentVersion = {
      id: `${agent.id}_v${versionNumber}`,
      agentId: agent.id,
      version: versionNumber,
      config: JSON.parse(JSON.stringify(target.config)) as AgentRuntimeConfig,
      channels: [...target.channels],
      note: `回滚自 v${targetVersion}`,
      createdAt: now,
      createdBy: actor,
    };
    state.agentVersions.unshift(version);
    agent.config = JSON.parse(JSON.stringify(target.config)) as AgentRuntimeConfig;
    agent.channels = [...target.channels];
    agent.currentVersion = versionNumber;
    agent.publishedVersion = versionNumber;
    agent.status = "published";
    agent.updatedAt = now;
    agent.updatedBy = actor;
    return { ok: true as const, agent, version };
  });
}

export async function listAgentVersions(agentId: string): Promise<AgentVersion[]> {
  const state = await getStore();
  return state.agentVersions
    .filter((version) => version.agentId === agentId)
    .sort((a, b) => b.version - a.version);
}

export async function createAgentApiKey(input: {
  agentId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: AgentApiKey["scopes"];
  expiresAt: string | null;
  actor: string;
}): Promise<AgentApiKey> {
  return updateStore((state) => {
    const key: AgentApiKey = {
      id: `key_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      agentId: input.agentId,
      name: input.name.trim() || "default",
      prefix: input.prefix,
      keyHash: input.keyHash,
      scopes: input.scopes,
      createdAt: new Date().toISOString(),
      createdBy: input.actor,
      lastUsedAt: null,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    state.agentApiKeys.unshift(key);
    return key;
  });
}

export async function listAgentApiKeys(agentId: string): Promise<AgentApiKey[]> {
  const state = await getStore();
  return state.agentApiKeys.filter((key) => key.agentId === agentId);
}

export async function revokeAgentApiKey(
  agentId: string,
  keyId: string,
): Promise<AgentApiKey | null> {
  return updateStore((state) => {
    const key = state.agentApiKeys.find(
      (entry) => entry.id === keyId && entry.agentId === agentId,
    );
    if (!key) return null;
    key.revokedAt = new Date().toISOString();
    return key;
  });
}

export async function findAgentApiKey(
  keyHash: string,
): Promise<{ key: AgentApiKey; agent: AgentDefinition } | null> {
  const state = await getStore();
  const key = state.agentApiKeys.find((entry) => entry.keyHash === keyHash);
  if (!key || key.revokedAt) return null;
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) return null;
  const agent = state.agents.find((entry) => entry.id === key.agentId);
  if (!agent) return null;
  return { key, agent };
}

export async function noteAgentApiKeyUse(keyId: string): Promise<void> {
  await updateStore((state) => {
    const key = state.agentApiKeys.find((entry) => entry.id === keyId);
    if (key) key.lastUsedAt = new Date().toISOString();
  });
}

export async function getSettings(): Promise<AppSettings> {
  const state = await getStore();
  const override = process.env.AGENT_ENABLED;
  const agentEnabled =
    override === "true" ? true : override === "false" ? false : state.settings.agentEnabled;
  return agentEnabled === state.settings.agentEnabled
    ? state.settings
    : { ...state.settings, agentEnabled };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = await updateStore((state) => {
    state.settings = {
      ...state.settings,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: "system",
    };
    return state.settings;
  });
  const state = await getStore();
  syncDerivedConfig(state);
  return next;
}

export async function getStoreHealth(): Promise<{
  driver: "postgres" | "file";
  schemaVersion: number;
  orders: number;
  sessions: number;
  runtimeEvents: number;
  agentLogs: number;
  createdAt: string;
}> {
  const state = await getStore();
  return {
    driver: USE_POSTGRES ? "postgres" : "file",
    schemaVersion: state.schemaVersion,
    orders: state.orders.length,
    sessions: Object.keys(state.sessions).length,
    runtimeEvents: state.events.length,
    agentLogs: state.agentLogs.length,
    createdAt: state.createdAt,
  };
}

export async function getDashboardCounts(): Promise<{
  orders: number;
  sessions: number;
  agentLogs: number;
  runtimeEvents: number;
  carts: number;
  wishlists: number;
}> {
  const state = await getStore();
  return {
    orders: state.orders.length,
    sessions: Object.keys(state.sessions).length,
    agentLogs: state.agentLogs.length,
    runtimeEvents: state.events.length,
    carts: Object.keys(state.carts).length,
    wishlists: Object.values(state.wishlists).reduce((sum, list) => sum + list.length, 0),
  };
}

export async function upsertCustomer(input: {
  phone?: string | null;
  wechatOpenId?: string | null;
  nickname?: string;
  source: CustomerSource;
}): Promise<Customer> {
  return updateStore((state) => {
    const phone = input.phone ?? null;
    const wechatOpenId = input.wechatOpenId ?? null;
    const existing = state.customers.find((entry) =>
      phone ? entry.phone === phone : Boolean(wechatOpenId && entry.wechatOpenId === wechatOpenId),
    );
    const now = new Date().toISOString();
    if (existing) {
      existing.lastLoginAt = now;
      if (phone) existing.phone = phone;
      if (wechatOpenId) existing.wechatOpenId = wechatOpenId;
      if (input.nickname) existing.nickname = input.nickname.slice(0, 24);
      if (!state.customerProfiles[existing.userId] && !USER_MAP[existing.userId]) {
        state.customerProfiles[existing.userId] = makeMemberProfile({
          userId: existing.userId,
          nickname: existing.nickname,
          phone: existing.phone,
        });
      }
      registerUserProfiles(state.customerProfiles);
      return existing;
    }
    const suffix = phone?.slice(-4) ?? "微信";
    const tones = ["#c9a87b", "#7d8a72", "#a58b7a", "#8a9ba8"];
    const id = `cus_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const nickname = input.nickname?.slice(0, 24) || (phone ? `会员 ${suffix}` : "微信会员");
    const customer: Customer = {
      id,
      userId: `u_${id}`,
      phone,
      wechatOpenId,
      nickname,
      avatarTone: tones[state.customers.length % tones.length],
      source: input.source,
      createdAt: now,
      lastLoginAt: now,
    };
    state.customers.unshift(customer);
    state.customerProfiles[customer.userId] = makeMemberProfile({
      userId: customer.userId,
      nickname,
      phone,
    });
    registerUserProfiles(state.customerProfiles);
    if (state.customers.length > 5000) state.customers.length = 5000;
    return customer;
  });
}

export async function createCustomerSession(input: {
  customerId: string;
  ip: string;
  userAgent: string;
}): Promise<{ token: string; session: CustomerSession }> {
  const token = createSessionToken();
  const sessionId = hashSessionToken(token);
  const now = Date.now();
  const session: CustomerSession = {
    id: sessionId,
    customerId: input.customerId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CUSTOMER_TTL_MS).toISOString(),
    ip: input.ip,
    userAgent: input.userAgent.slice(0, 180),
    revokedAt: null,
  };
  await updateStore((state) => {
    for (const [key, value] of Object.entries(state.customerSessions)) {
      if (value.revokedAt || new Date(value.expiresAt).getTime() < now) {
        delete state.customerSessions[key];
      }
    }
    state.customerSessions[sessionId] = session;
    const keys = Object.keys(state.customerSessions);
    if (keys.length > 2000) {
      keys.slice(0, keys.length - 2000).forEach((key) => delete state.customerSessions[key]);
    }
  });
  return { token, session };
}

export async function findCustomerSession(
  token: string,
): Promise<{ session: CustomerSession; customer: Customer } | null> {
  if (!token) return null;
  const state = await getStore();
  const session = state.customerSessions[hashSessionToken(token)];
  if (!session || session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  const customer = state.customers.find((entry) => entry.id === session.customerId);
  if (!customer) return null;
  return { session, customer };
}

export async function revokeCustomerSession(token: string): Promise<void> {
  if (!token) return;
  const sessionId = hashSessionToken(token);
  await updateStore((state) => {
    const session = state.customerSessions[sessionId];
    if (session) session.revokedAt = new Date().toISOString();
  });
}

export async function saveCustomerOtp(input: {
  phone: string;
  codeHash: string;
  ttlMs: number;
}): Promise<void> {
  const now = Date.now();
  const record: CustomerOtp = {
    phone: input.phone,
    codeHash: input.codeHash,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + input.ttlMs).toISOString(),
    attempts: 0,
  };
  await updateStore((state) => {
    for (const [phone, value] of Object.entries(state.otps)) {
      if (new Date(value.expiresAt).getTime() < now) delete state.otps[phone];
    }
    state.otps[input.phone] = record;
    const keys = Object.keys(state.otps);
    if (keys.length > 500) {
      keys.slice(0, keys.length - 500).forEach((phone) => delete state.otps[phone]);
    }
  });
}

export async function consumeCustomerOtp(
  phone: string,
  codeHash: string,
): Promise<"ok" | "missing" | "expired" | "invalid" | "locked"> {
  return updateStore((state) => {
    const record = state.otps[phone];
    if (!record) return "missing";
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      delete state.otps[phone];
      return "expired";
    }
    if (record.attempts >= 5) {
      delete state.otps[phone];
      return "locked";
    }
    if (record.codeHash !== codeHash) {
      record.attempts += 1;
      return "invalid";
    }
    delete state.otps[phone];
    return "ok";
  });
}

export async function appendAudit(
  input: Omit<AuditEvent, "id" | "ts">,
): Promise<AuditEvent> {
  const event: AuditEvent = {
    ...input,
    id: `audit_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
  };
  await updateStore((state) => {
    state.auditLogs.unshift(event);
    if (state.auditLogs.length > 1000) state.auditLogs.length = 1000;
  });
  return event;
}

