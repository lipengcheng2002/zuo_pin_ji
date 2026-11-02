"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AgentTraceSnapshot,
  ChatMessage,
  ChatStreamEvent,
  ToolCallRecord,
} from "@/lib/agent/types";
import type { Outfit } from "@/lib/engine/types";
import { ChatProductCard } from "@/components/stylist/ChatProductCard";
import { OutfitAddAll } from "@/components/product/OutfitAddAll";
import { ProductArt } from "@/components/product/ProductArt";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/components/providers/Cart";
import { useToast } from "@/components/providers/Toast";
import { cn, dateTimeLabel, money } from "@/lib/utils/format";

type StylistProfile = {
  name: string;
  archetype: string;
  tags: string[];
  sizes: { top: string; bottom: string; shoes: string };
  body: { height: number; weight: number; bodyType: string };
  priceBand: { min: number; max: number };
  behavior: {
    last30d: number;
    wishlists: number;
    carts: number;
    purchases: number;
  };
  affinities: {
    styles: Array<{ tag: string; weight: number }>;
    colors: Array<{ name: string; weight: number }>;
    occasions: Array<{ tag: string; weight: number }>;
  };
};

type ToolMeta = {
  name: string;
  label: string;
  description: string;
  argsHint: string;
  risk: "low" | "medium";
};

type StylistMeta = {
  enabled: boolean;
  mode: "llm" | "local";
  model: string;
  provider: string;
  planner: "llm" | "rule";
  promptVersion: string;
  variantModel: string;
  tools: ToolMeta[];
};

const STARTERS = [
  { title: "通勤一周", note: "帮我搭三套下周上班的造型", value: "帮我搭三套下周上班的造型，预算 3000 以内。", icon: "briefcase" as const },
  { title: "约会那天", note: "不要太隆重，低饱和一点", value: "下周有约会，想穿得温柔一点，不要太隆重。", icon: "heart" as const },
  { title: "尺码确认", note: "165 / 52，这件选 M 吗？", value: "我 165cm、52kg，雾凇大衣选 M 还是 L？", icon: "sliders" as const },
  { title: "千元羊绒", note: "预算有限，也想穿好面料", value: "一千以内有没有值得买的羊绒单品？", icon: "tag" as const },
];

const SLOT_LABELS: Record<string, string> = {
  outer: "外套",
  top: "上装",
  bottom: "下装",
  dress: "连衣裙",
  shoes: "鞋履",
  bag: "包袋",
  accessory: "配饰",
  categories: "品类",
  colors: "颜色",
  occasions: "场景",
  styles: "风格",
  price: "预算",
};

const Panel = ({
  trace,
  meta,
  profile,
  tab,
  onTab,
  messages,
}: {
  trace: AgentTraceSnapshot | null;
  meta: StylistMeta;
  profile: StylistProfile;
  tab: "trace" | "profile" | "tools";
  onTab: (tab: "trace" | "profile" | "tools") => void;
  messages: ChatMessage[];
}) => {
  const tools = trace?.tools ?? [];
  const recall = trace?.recall;
  const weights = recall?.weights ?? {};
  const maxWeight = Math.max(...Object.values(weights), 0.01);
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant" && message.trace);

  return (
    <div className="flex h-full flex-col bg-ink text-ivory">
      <div className="border-b border-ivory/10 px-5 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#c9a87b]" />
            <span className="text-[8.5px] uppercase tracking-[0.2em] text-ivory/45">
              Agent Observability
            </span>
          </div>
          <span className="num text-[8.5px] text-ivory/30">{meta.variantModel}</span>
        </div>
        <div className="mt-3 flex gap-5">
          {[
            { key: "trace" as const, label: "观测" },
            { key: "profile" as const, label: "画像" },
            { key: "tools" as const, label: "工具" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => onTab(item.key)}
              className={cn(
                "border-b pb-2 text-[10.5px] tracking-wide transition",
                tab === item.key
                  ? "border-[#c9a87b] text-ivory"
                  : "border-transparent text-ivory/40 hover:text-ivory/70",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {tab === "trace" ? (
          trace ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[
                  ["时延", `${trace.latencyMs}ms`],
                  ["意图置信", `${Math.round(trace.confidence * 100)}%`],
                  ["工具调用", `${tools.length}`],
                  ["Token", trace.tokens ? trace.tokens.toLocaleString("zh-CN") : "本地"],
                ].map(([label, value]) => (
                  <div key={label} className="border border-ivory/10 p-2.5">
                    <p className="num text-[15px] leading-none text-ivory/90">{value}</p>
                    <p className="mt-1.5 text-[8px] tracking-wide text-ivory/35">{label}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Request</p>
                <p className="num mt-2 break-all text-[9px] text-ivory/55">{trace.requestId}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="border border-ivory/15 px-1.5 py-0.5 text-[8px] text-ivory/55">
                    {trace.mode === "llm" ? "LLM 增强" : "本地规划器"}
                  </span>
                  <span className="border border-ivory/15 px-1.5 py-0.5 text-[8px] text-ivory/55">
                    {trace.model}
                  </span>
                  <span className="border border-ivory/15 px-1.5 py-0.5 text-[8px] text-ivory/55">
                    {trace.variant} 组
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Intent & Slots</p>
                <p className="mt-2 text-[12px]">{trace.intentLabel}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(trace.slots)
                    .filter(([, value]) => {
                      if (Array.isArray(value)) return value.length > 0;
                      if (typeof value === "boolean") return value;
                      return Boolean(value);
                    })
                    .map(([key, value]) => (
                      <span key={key} className="border border-ivory/15 px-1.5 py-0.5 text-[8px] text-ivory/55">
                        {SLOT_LABELS[key] ?? key} ·{" "}
                        {Array.isArray(value)
                          ? value.join(" / ")
                          : typeof value === "object" && value
                            ? `¥${(value as { max?: number }).max ?? ""}`
                            : String(value)}
                      </span>
                    ))}
                </div>
              </div>

              <div>
                <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Execution Plan</p>
                <ol className="mt-2 space-y-2">
                  {trace.plan.map((step, index) => (
                    <li key={index} className="flex gap-2 text-[9.5px] leading-4 text-ivory/55">
                      <span className="num shrink-0 text-[8px] text-[#c9a87b]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {recall ? (
                <>
                  <div>
                    <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">
                      Recall Sources · {recall.candidateCount} candidates
                    </p>
                    <div className="mt-3 space-y-3">
                      {recall.recall.map((source) => {
                        const max = Math.max(...recall.recall.map((item) => item.candidates), 1);
                        return (
                          <div key={source.source}>
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="text-ivory/55">{source.label}</span>
                              <span className="num text-ivory/35">{source.contributed} / {source.candidates}</span>
                            </div>
                            <div className="mt-1.5 h-[2px] bg-ivory/10">
                              <div
                                className="h-full bg-[#c9a87b]/70"
                                style={{ width: `${Math.max(4, (source.candidates / max) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-[8px] leading-4 text-ivory/30">
                      {recall.rankingFormula}
                    </p>
                  </div>

                  <div>
                    <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Fusion Weights</p>
                    <div className="mt-3 space-y-2">
                      {Object.entries(weights)
                        .filter(([, value]) => value > 0.02)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="w-14 shrink-0 text-[8.5px] text-ivory/45">
                              {SLOT_LABELS[key] ?? key}
                            </span>
                            <div className="h-[2px] flex-1 bg-ivory/10">
                              <div
                                className="h-full bg-ivory/45"
                                style={{ width: `${(value / maxWeight) * 100}%` }}
                              />
                            </div>
                            <span className="num w-7 text-right text-[8px] text-ivory/35">
                              {(value * 100).toFixed(0)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              ) : null}

              <div>
                <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Tool Calls</p>
                <div className="mt-2 space-y-2">
                  {tools.length ? (
                    tools.map((tool) => <ToolRow key={tool.id} tool={tool} />)
                  ) : (
                    <p className="text-[9px] text-ivory/30">本轮未调用工具。</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Guardrails</p>
                <div className="mt-2 space-y-1.5">
                  {trace.guardrails.checks.map((check) => (
                    <div key={check.id} className="flex items-start gap-2">
                      <Icon
                        name={check.passed ? "check" : check.severity === "block" ? "alert" : "info"}
                        size={10}
                        className={cn(
                          "mt-0.5",
                          check.passed ? "text-[#9db39f]" : check.severity === "block" ? "text-[#d98d7c]" : "text-[#c9a87b]",
                        )}
                      />
                      <div>
                        <p className="text-[9px] text-ivory/60">{check.label}</p>
                        <p className="text-[8px] leading-3.5 text-ivory/30">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Icon name="activity" size={24} className="text-ivory/20" />
              <p className="mt-4 text-[11px] text-ivory/45">还没有可观测的对话</p>
              <p className="mt-1.5 max-w-[220px] text-[9px] leading-4 text-ivory/25">
                发送一条消息后，这里会显示意图、召回、排序、工具与护栏的完整链路。
              </p>
            </div>
          )
        ) : null}

        {tab === "profile" ? (
          <div className="space-y-6">
            <div>
              <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Style Persona</p>
              <p className="mt-2 font-display text-[24px] leading-tight">{profile.name}</p>
              <p className="mt-1 text-[10px] text-ivory/45">{profile.archetype}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profile.tags.slice(0, 8).map((tag) => (
                  <span key={tag} className="border border-ivory/15 px-1.5 py-0.5 text-[8px] text-ivory/55">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ["近30天互动", profile.behavior.last30d],
                ["收藏", profile.behavior.wishlists],
                ["加购", profile.behavior.carts],
                ["购买", profile.behavior.purchases],
              ].map(([label, value]) => (
                <div key={label} className="border border-ivory/10 px-2.5 py-2">
                  <p className="num text-[16px] leading-none">{value}</p>
                  <p className="mt-1 text-[8px] text-ivory/35">{label}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Affinity</p>
              <div className="mt-3 space-y-2.5">
                {profile.affinities.styles.slice(0, 3).map((item) => (
                  <div key={item.tag}>
                    <div className="flex justify-between text-[9px] text-ivory/50">
                      <span>风格 · {item.tag}</span>
                      <span className="num">{Math.round(item.weight * 100)}</span>
                    </div>
                    <div className="mt-1 h-[2px] bg-ivory/10">
                      <div className="h-full bg-[#c9a87b]" style={{ width: `${item.weight * 100}%` }} />
                    </div>
                  </div>
                ))}
                {profile.affinities.colors.slice(0, 2).map((item) => (
                  <div key={item.name}>
                    <div className="flex justify-between text-[9px] text-ivory/50">
                      <span>颜色 · {item.name}</span>
                      <span className="num">{Math.round(item.weight * 100)}</span>
                    </div>
                    <div className="mt-1 h-[2px] bg-ivory/10">
                      <div className="h-full bg-ivory/40" style={{ width: `${item.weight * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-ivory/10 pt-4 text-[9px] leading-5 text-ivory/40">
              <p>身形 {profile.body.height}cm / {profile.body.weight}kg · {profile.body.bodyType}</p>
              <p>尺码 {profile.sizes.top} / {profile.sizes.bottom} / {profile.sizes.shoes}</p>
              <p>价格带 ¥{profile.priceBand.min} – ¥{profile.priceBand.max}</p>
            </div>

            <Link
              href="/account?tab=profile"
              className="flex items-center justify-between border border-ivory/20 px-3 py-2.5 text-[9.5px] text-ivory/65 transition hover:border-ivory/50"
            >
              修改画像偏好
              <Icon name="arrow-up-right" size={12} />
            </Link>

            {lastAssistant ? (
              <p className="text-[8px] leading-3.5 text-ivory/25">
                最近一次建议基于 {lastAssistant.trace?.tools.length ?? 0} 个工具调用生成，可切换至「观测」查看依据。
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "tools" ? (
          <div className="space-y-2">
            <p className="text-[8.5px] uppercase tracking-[0.18em] text-ivory/35">Registered Tools</p>
            {meta.tools.map((tool) => (
              <details key={tool.name} className="group border border-ivory/10 px-3 py-2.5">
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <span className="text-[10px] text-ivory/70">{tool.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="num text-[8px] text-ivory/25">{tool.name}</span>
                    <Icon name="chevron-down" size={10} className="text-ivory/30 transition group-open:rotate-180" />
                  </span>
                </summary>
                <p className="mt-2 text-[8.5px] leading-4 text-ivory/35">{tool.description}</p>
                <p className="num mt-1.5 text-[8px] text-ivory/25">{tool.argsHint}</p>
                <p className="mt-1 text-[8px] text-ivory/25">
                  风险等级 · {tool.risk === "medium" ? "需明确用户指令" : "只读"}
                </p>
              </details>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-ivory/10 px-5 py-3">
        <div className="flex items-center justify-between text-[8px] text-ivory/30">
          <span>{meta.planner === "llm" ? "LLM 规划器" : "确定性规划器"} · {meta.promptVersion}</span>
          <span className="num">{meta.mode === "llm" ? "LLM" : "LOCAL"}</span>
        </div>
      </div>
    </div>
  );
};

const ToolRow = ({ tool }: { tool: ToolCallRecord }) => (
  <details className="group border border-ivory/10 px-2.5 py-2">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "h-1 w-1 shrink-0 rounded-full",
            tool.status === "ok" ? "bg-[#9db39f]" : tool.status === "skipped" ? "bg-[#c9a87b]" : "bg-[#d98d7c]",
          )}
        />
        <span className="truncate text-[9px] text-ivory/60">{tool.label}</span>
      </span>
      <span className="num shrink-0 text-[7.5px] text-ivory/25">{tool.latencyMs}ms</span>
    </summary>
    <p className="mt-1.5 text-[8px] leading-3.5 text-ivory/35">{tool.summary}</p>
    <p className="num mt-1 text-[7.5px] text-ivory/20">{tool.tool}</p>
  </details>
);

export function StylistWorkspace({
  initialPrompt,
  profile,
  meta,
}: {
  initialPrompt: string;
  profile: StylistProfile;
  meta: StylistMeta;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [stageLabel, setStageLabel] = useState("");
  const [activeTrace, setActiveTrace] = useState<AgentTraceSnapshot | null>(null);
  const [tab, setTab] = useState<"trace" | "profile" | "tools">("profile");
  const [panelOpen, setPanelOpen] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
  const endRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const { refresh: refreshCart } = useCart();
  const { push } = useToast();

  const hasConversation = messages.some((message) => message.role === "user");
  const latestTrace = activeTrace ?? messages.findLast?.((message) => message.trace)?.trace ?? null;

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (initialPrompt.trim()) {
      void sendRef.current(initialPrompt);
      window.history.replaceState({}, "", "/stylist");
      return;
    }
    fetch("/api/agent/history", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { messages?: ChatMessage[] } | null) => {
        if (data?.messages?.length) {
          setMessages(data.messages);
          const lastTrace = [...data.messages].reverse().find((message) => message.trace)?.trace ?? null;
          setActiveTrace(lastTrace);
        }
      })
      .catch(() => undefined);
  }, [initialPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth", block: "end" });
  }, [messages, streaming, stageLabel]);

  const send = useCallback(
    async (raw?: string) => {
      const content = (raw ?? input).trim();
      if (!content || streaming) return;
      setInput("");
      setStageLabel("正在理解你的需求…");
      const userId = `local_u_${Date.now()}`;
      const assistantId = `local_a_${Date.now()}`;
      const now = new Date().toISOString();
      setMessages((current) => [
        ...current,
        { id: userId, role: "user", content, ts: now },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          ts: now,
          products: [],
          trace: null,
          outfit: null,
          suggestions: [],
          action: null,
        },
      ]);
      setStreaming(true);
      setActiveTrace(null);
      setTab("trace");

      try {
        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content }),
        });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "造型师暂时不可用");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        const updateMessage = (updater: (message: ChatMessage) => ChatMessage) => {
          setMessages((current) =>
            current.map((message) => (message.id === assistantId ? updater(message) : message)),
          );
        };

        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const dataLine = part
              .split("\n")
              .find((line) => line.startsWith("data:"));
            if (!dataLine) continue;
            let event: ChatStreamEvent;
            try {
              event = JSON.parse(dataLine.slice(5)) as ChatStreamEvent;
            } catch {
              continue;
            }
            switch (event.type) {
              case "stage":
                setStageLabel(event.data.label);
                break;
              case "trace":
                setActiveTrace(event.data);
                updateMessage((message) => ({ ...message, trace: event.data }));
                break;
              case "products":
                updateMessage((message) => ({ ...message, products: event.data.items }));
                break;
              case "outfit":
                updateMessage((message) => ({ ...message, outfit: event.data.outfit }));
                break;
              case "suggestions":
                updateMessage((message) => ({ ...message, suggestions: event.data.items }));
                break;
              case "delta":
                setStageLabel("");
                updateMessage((message) => ({
                  ...message,
                  content: message.content + event.data.text,
                }));
                break;
              case "action":
                updateMessage((message) => ({ ...message, action: event.data }));
                if (event.data.type === "added_to_cart") void refreshCart();
                break;
              case "done":
                setStreaming(false);
                setStageLabel("");
                break;
              case "error":
                updateMessage((message) => ({
                  ...message,
                  content: event.data.message,
                }));
                push(event.data.message, { tone: "error" });
                break;
              default:
                break;
            }
          }
        }
      } catch (error) {
        const message = (error as Error).message || "造型师暂时走神了，请稍后重试。";
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, content: `抱歉，${message}。你可以稍后重试，或者直接浏览当季单品。` }
              : item,
          ),
        );
      } finally {
        setStreaming(false);
        setStageLabel("");
      }
    },
    [input, push, refreshCart, streaming],
  );

  sendRef.current = send;

  const startNewChat = async () => {
    if (streaming) return;
    if (messages.length && !window.confirm("开启新对话会清空当前会话记录，确定吗？")) return;
    try {
      await fetch("/api/agent/history", { method: "DELETE" });
      setMessages([]);
      setActiveTrace(null);
      setStageLabel("");
      router.refresh();
    } catch {
      push("清空会话失败，请稍后重试", { tone: "error" });
    }
  };

  const rate = async (messageId: string, rating: "up" | "down") => {
    setFeedback((current) => ({ ...current, [messageId]: rating }));
    try {
      await fetch("/api/agent/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      push(rating === "up" ? "谢谢，已记录" : "感谢反馈，我们会改进", { tone: "success" });
    } catch {
      // feedback is non-critical
    }
  };

  const openTrace = (messageId: string) => {
    setActiveTrace(messages.find((message) => message.id === messageId)?.trace ?? null);
    setTab("trace");
    setPanelOpen(true);
  };

  const outfitSize = (product: Outfit["items"][number]["product"]) => {
    const desired =
      product.role === "bottom"
        ? profile.sizes.bottom
        : product.role === "shoes"
          ? profile.sizes.shoes
          : profile.sizes.top;
    return product.sizes.find((size) => size.label === desired && size.stock > 0)?.label ??
      product.sizes.find((size) => size.stock > 0)?.label ??
      desired;
  };

  return (
    <div className="flex h-[calc(100dvh-108px)] flex-col border-b border-line md:h-[calc(100dvh-116px)]">
      <div className="flex items-center justify-between border-b border-line bg-ivory/90 px-4 py-3 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <span className="relative flex h-8 w-8 items-center justify-center border border-ink/15 bg-paper">
            <Icon name="sparkle" size={15} className="text-clay" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-ivory bg-moss" />
          </span>
          <div>
            <p className="text-[12.5px] tracking-wide">织言 AI 造型师</p>
            <p className="text-[8.5px] text-muted">
              <span className="hidden sm:inline">
                {meta.mode === "llm" ? `${meta.provider} · ${meta.model}` : "本地规划器 · 不依赖外部 API"}
                {" · "}
                已读取 {profile.tags.length} 个画像标签
              </span>
              <span className="sm:hidden">本地规划器 · 已读取画像</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setTab("trace");
              setPanelOpen(true);
            }}
            aria-label="打开 Agent 观测台"
            className="flex h-8 items-center gap-1.5 border border-line-strong px-2 text-[9.5px] text-muted transition hover:border-ink hover:text-ink sm:px-2.5 xl:hidden"
          >
            <Icon name="activity" size={12} />
            <span className="hidden sm:inline">观测</span>
          </button>
          <button
            onClick={startNewChat}
            aria-label="开启新对话"
            className="flex h-8 items-center gap-1.5 border border-line-strong px-2 text-[9.5px] text-muted transition hover:border-ink hover:text-ink sm:px-2.5"
          >
            <Icon name="plus" size={12} />
            <span className="hidden whitespace-nowrap sm:inline">新对话</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
            <div className="mx-auto w-full max-w-[760px]">
              {!hasConversation ? (
                <div className="pb-6">
                  <div className="flex items-center gap-3">
                    <span className="h-px w-8 bg-ink/35" />
                    <p className="eyebrow eyebrow-ink">Personal Styling Session</p>
                  </div>
                  <h1 className="display mt-5 text-[40px] leading-[1.05] md:text-[54px]">
                    今天，想穿成
                    <br />
                    <span className="text-clay">什么样？</span>
                  </h1>
                  <p className="mt-4 max-w-lg text-[12px] leading-6 text-muted">
                    我已经了解你的{profile.archetype}偏好、{profile.body.height}cm / {profile.body.weight}kg 的身形与
                    {profile.tags.slice(0, 2).join("、")}。告诉我场合、预算或一件想搭配的单品，我会给出整套方案与理由。
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-2">
                    {STARTERS.map((starter) => {
                      const iconName =
                        starter.icon === "briefcase"
                          ? "bag"
                          : starter.icon === "sliders"
                            ? "sliders"
                            : starter.icon === "tag"
                              ? "tag"
                              : "heart";
                      return (
                        <button
                          key={starter.title}
                          onClick={() => sendRef.current(starter.value)}
                          className="group flex items-start justify-between gap-2 border border-line bg-paper px-3 py-3 text-left transition hover:border-ink sm:gap-4 sm:px-4 sm:py-3.5"
                        >
                          <div>
                            <p className="flex items-center gap-2 text-[10.5px] sm:text-[11px]">
                              <Icon name={iconName} size={13} className="hidden shrink-0 text-clay sm:block" />
                              {starter.title}
                            </p>
                            <p className="mt-1.5 text-[9px] leading-4 text-muted sm:text-[9.5px]">{starter.note}</p>
                          </div>
                          <Icon
                            name="arrow-up-right"
                            size={13}
                            className="mt-0.5 hidden shrink-0 text-muted transition group-hover:text-clay sm:block"
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-6 flex flex-wrap gap-1.5">
                    {profile.tags.slice(0, 6).map((tag) => (
                      <span key={tag} className="chip chip-clay h-6 text-[8.5px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[85%] bg-ink px-4 py-3 text-[12.5px] leading-6 text-ivory">
                          {message.content}
                        </div>
                      </div>
                    ) : (
                      <div key={message.id} className="flex gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-ink/15 bg-paper">
                          <Icon name="sparkle" size={13} className="text-clay" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] tracking-wide">AI 造型师</span>
                            <span className="num text-[8px] text-muted">{dateTimeLabel(message.ts)}</span>
                            {message.trace ? (
                              <span className="num ml-auto text-[8px] text-muted">
                                {message.trace.latencyMs}ms
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-[12.5px] leading-7 text-ink-soft/90">
                            {message.content ? (
                              message.content.split("\n").map((line, index) =>
                                line.startsWith("· ") ? (
                                  <div key={index} className="flex gap-2 pl-1">
                                    <span className="mt-[12px] h-[3px] w-[3px] shrink-0 bg-clay" />
                                    <span>{line.slice(2)}</span>
                                  </div>
                                ) : line ? (
                                  <p key={index} className="first:mt-0 mt-1.5">
                                    {line}
                                  </p>
                                ) : null,
                              )
                            ) : (
                              <div className="flex items-center gap-2 py-1 text-[11px] text-muted">
                                <span className="flex gap-1">
                                  <span className="pulse-dot h-1 w-1 rounded-full bg-clay" />
                                  <span className="pulse-dot h-1 w-1 rounded-full bg-clay [animation-delay:150ms]" />
                                  <span className="pulse-dot h-1 w-1 rounded-full bg-clay [animation-delay:300ms]" />
                                </span>
                                {stageLabel || "正在思考…"}
                              </div>
                            )}
                          </div>

                          {message.products && message.products.length ? (
                            <div className="mt-4 -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                              {message.products.map((product) => (
                                <ChatProductCard key={product.id} card={product} />
                              ))}
                            </div>
                          ) : null}

                          {message.outfit ? (
                            <div className="mt-4 border border-line bg-paper">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
                                <div>
                                  <p className="text-[10px] tracking-wide">{message.outfit.title}</p>
                                  <p className="mt-0.5 text-[8.5px] text-muted">
                                    {message.outfit.harmony.join(" · ")}
                                  </p>
                                </div>
                                <p className="num text-[11px]">{money(message.outfit.total)}</p>
                              </div>
                              <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-5">
                                {message.outfit.items.map((item) => (
                                  <Link
                                    key={item.product.id}
                                    href={`/product/${item.product.slug}`}
                                    className="group"
                                  >
                                    <div
                                      className="aspect-[4/5] overflow-hidden"
                                      style={{
                                        background: `linear-gradient(150deg, ${item.product.editorial.palette[0]}, ${item.product.editorial.palette[1]})`,
                                      }}
                                    >
                                      <ProductArtLite
                                        art={item.product.editorial.art}
                                        color={item.product.colors[0].hex}
                                        accent={item.product.editorial.accent}
                                      />
                                    </div>
                                    <p className="mt-1 text-[7.5px] uppercase tracking-[0.1em] text-clay">
                                      {SLOT_LABELS[item.slot] ?? item.slot}
                                    </p>
                                    <p className="truncate text-[9px] group-hover:text-clay">
                                      {item.product.name}
                                    </p>
                                  </Link>
                                ))}
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2.5">
                                <p className="text-[8.5px] text-muted">
                                  已按你的尺码配比 · 整套可一键加入
                                </p>
                                <OutfitAddAll
                                  label="整套加入"
                                  items={message.outfit.items.map((item) => ({
                                    productId: item.product.id,
                                    name: item.product.name,
                                    size: outfitSize(item.product),
                                    color: item.product.colors[0].name,
                                    price: item.product.price,
                                  }))}
                                />
                              </div>
                            </div>
                          ) : null}

                          {message.action?.type === "added_to_cart" ? (
                            <div className="mt-3 flex items-center gap-2 border border-moss/25 bg-moss-soft/60 px-3 py-2 text-[9.5px] text-moss">
                              <Icon name="check" size={12} />
                              已加入购物袋：{message.action.name} · {message.action.color} / {message.action.size}
                              <Link href="/cart" className="ml-auto underline underline-offset-4">
                                查看
                              </Link>
                            </div>
                          ) : null}

                          {message.trace ? (
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2.5 text-[8.5px] text-muted">
                              <button
                                onClick={() => openTrace(message.id)}
                                className="flex items-center gap-1 text-clay hover:underline"
                              >
                                <Icon name="activity" size={10} />
                                推理链路
                              </button>
                              <span>{message.trace.intentLabel}</span>
                              <span>{message.trace.tools.length} 个工具</span>
                              <span>{message.trace.latencyMs}ms</span>
                              <span className="hidden sm:inline">
                                {message.trace.mode === "llm" ? "LLM 增强" : "本地规划"}
                              </span>
                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  onClick={() => rate(message.id, "up")}
                                  aria-label="回答有帮助"
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center border border-transparent transition hover:border-line-strong",
                                    feedback[message.id] === "up" && "text-moss",
                                  )}
                                >
                                  <Icon name="check" size={11} />
                                </button>
                                <button
                                  onClick={() => rate(message.id, "down")}
                                  aria-label="需要改进"
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center border border-transparent transition hover:border-line-strong",
                                    feedback[message.id] === "down" && "text-danger",
                                  )}
                                >
                                  <Icon name="more-horizontal" size={11} />
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {message.suggestions && message.suggestions.length && !streaming ? (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {message.suggestions.map((suggestion) => (
                                <button
                                  key={suggestion}
                                  onClick={() => sendRef.current(suggestion)}
                                  className="chip h-7 bg-paper text-[9px] transition hover:border-ink hover:text-ink"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ),
                  )}
                  <div ref={endRef} />
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-line bg-ivory px-4 py-3 md:px-8">
            <div className="mx-auto w-full max-w-[760px]">
              {hasConversation && streaming ? (
                <p className="mb-2 flex items-center gap-2 text-[9px] text-muted">
                  <span className="pulse-dot h-1 w-1 rounded-full bg-clay" />
                  {stageLabel || "正在生成…"}
                </p>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="relative border border-line-strong bg-paper focus-within:border-ink"
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value.slice(0, 600));
                    const element = event.target;
                    element.style.height = "auto";
                    element.style.height = `${Math.min(120, element.scrollHeight)}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  aria-label="输入你的造型需求"
                  placeholder="例如：下周去上海出差，帮我搭三套通勤，预算 3000。"
                  className="max-h-[120px] w-full resize-none bg-transparent px-4 pb-10 pt-3 text-[12px] leading-6 focus:outline-none"
                />
                <div className="absolute inset-x-3 bottom-2 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[8px] text-muted">
                    <span className="hidden sm:flex items-center gap-1">
                      <Icon name="shield" size={10} />
                      可解释 · 可回溯
                    </span>
                    <span className="num">{input.length}/600</span>
                  </div>
                  <button
                    type="submit"
                    disabled={!input.trim() || streaming}
                    className="flex h-8 items-center gap-1.5 bg-ink px-3 text-[9.5px] tracking-wide text-ivory transition hover:bg-clay disabled:opacity-30"
                  >
                    {streaming ? "生成中" : "发送"}
                    {streaming ? <Icon name="pause" size={11} /> : <Icon name="send" size={11} />}
                  </button>
                </div>
              </form>
              <p className="mt-1.5 text-center text-[8px] text-muted">
                AI 推荐基于画像与商品数据生成，仅供参考。购买前请核对尺码与库存。
              </p>
            </div>
          </div>
        </div>

        <aside className="hidden w-[360px] shrink-0 border-l border-ivory/10 xl:block 2xl:w-[400px]">
          <Panel
            trace={latestTrace}
            meta={meta}
            profile={profile}
            tab={tab}
            onTab={setTab}
            messages={messages}
          />
        </aside>
      </div>

      {panelOpen ? (
        <div className="fixed inset-0 z-[96] xl:hidden">
          <button
            aria-label="关闭观测台"
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-[420px] animate-fade-in">
            <button
              onClick={() => setPanelOpen(false)}
              aria-label="关闭"
              className="absolute right-3 top-3 z-10 p-2 text-ivory/60 hover:text-ivory"
            >
              <Icon name="close" size={18} />
            </button>
            <Panel
              trace={latestTrace}
              meta={meta}
              profile={profile}
              tab={tab}
              onTab={setTab}
              messages={messages}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductArtLite({
  art,
  color,
  accent,
}: {
  art: Outfit["items"][number]["product"]["editorial"]["art"];
  color: string;
  accent: string;
}) {
  return (
    <ProductArt
      art={art}
      color={color}
      accent={accent}
      className="transition duration-500 group-hover:scale-[1.04]"
    />
  );
}
