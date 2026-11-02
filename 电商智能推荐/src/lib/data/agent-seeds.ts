import type { AgentLog, AgentToolName } from "@/lib/agent/types";
import { INTENT_LABEL, understand } from "@/lib/engine/intent";
import { mulberry32 } from "@/lib/data/community";

const MESSAGES = [
  "下周去上海出差，帮我搭三套通勤造型",
  "165cm 52kg，羊绒高领穿 M 还是 L？",
  "有没有一千以内的羊绒单品？",
  "雾凇大衣和长堤风衣，哪个更适合小个子？",
  "真丝衬衫怎么洗才不会变形？",
  "退货的话多久能到账？",
  "我想找一条约会穿的裙子，不要太隆重",
  "想要老钱风，但预算控制在两千以内",
  "可以搭配我上次买的那条阔腿裤吗？",
  "帮我看看购物袋里还缺什么",
  "送朋友的生日礼物，预算 800 左右",
  "黑色短靴有 37 码吗？",
  "羊绒穿久了会不会起球？",
  "这套可以穿去上班吗？",
  "周末去杭州，想轻装出行，推荐一套",
  "有没有适合梨形身材的直筒裤？",
  "我的订单到哪了？",
  "把苔原高领加入购物袋，M 码燕麦色",
  "这个面料会不会扎皮肤？",
  "法式和静奢有什么区别，我更适合哪种？",
  "天冷了，想买一件保暖但不臃肿的外套",
  "搭一套参加婚礼的，不要黑色",
  "帮我记住：我更喜欢直筒版型，不喜欢紧身",
  "真丝方巾可以当发带吗？",
  "这件大衣有别的颜色吗？",
  "我平常穿 37，这双方头短靴要选大半码吗？",
  "预算三千，配一套秋冬见客户的着装",
  "推荐几条半裙，长度过膝的",
  "为什么给我推荐这件？",
  "会员积分怎么用？",
];

const TOOL_SETS: Record<string, AgentToolName[]> = {
  styling: ["recommend", "build_outfit"],
  find_product: ["search_catalog", "recommend"],
  size_advice: ["get_product", "size_advisor"],
  compare: ["get_product", "compare_products"],
  product_qa: ["retrieve_knowledge"],
  policy: ["retrieve_knowledge"],
  order_status: ["get_orders"],
  cart: ["add_to_cart"],
  profile_update: ["update_preference"],
  greeting: [],
  smalltalk: [],
};

export function seedAgentLogs(): AgentLog[] {
  const rnd = mulberry32(8842);
  const now = Date.now();
  return MESSAGES.map((message, index) => {
    const intent = understand(message);
    const mode = index % 7 === 0 ? "llm" : "local";
    const tools = (TOOL_SETS[intent.intent] ?? ["search_catalog"]) as AgentToolName[];
    const confidence = Number(
      Math.min(0.98, intent.confidence + (rnd() - 0.4) * 0.08).toFixed(2),
    );
    return {
      id: `log_${String(index + 1).padStart(4, "0")}`,
      sessionId: `s_seed_${Math.floor(index / 3)}`,
      userId: index % 5 === 0 ? "u_guest_003" : "u_linzhixia",
      userMessage: message,
      answerPreview:
        intent.intent === "size_advice"
          ? "按你的身形数据，建议 M 码；这款版型偏直身，介于两码之间时选小一码会更利落。"
          : intent.intent === "policy"
            ? "已为你找到对应的服务政策：满 ¥599 免运费，签收后 30 天内保持吊牌完整可退换。"
            : "根据你的风格与场景，我筛选了几件匹配度较高的单品，并附上了推荐依据。",
      intent: intent.intent,
      intentLabel: INTENT_LABEL[intent.intent],
      confidence,
      mode: mode as "llm" | "local",
      model: mode === "llm" ? "deepseek-chat" : "zhiyan-local-planner-v2",
      tools,
      toolCalls: tools.length + (rnd() > 0.7 ? 1 : 0),
      guardrailsTriggered:
        intent.intent === "size_advice"
          ? ["尺码建议免责声明"]
          : intent.intent === "policy"
            ? ["政策引用校验"]
            : [],
      latencyMs: Math.round(48 + rnd() * 260),
      tokens: mode === "llm" ? Math.round(210 + rnd() * 580) : 0,
      variant: "B",
      feedback: rnd() > 0.82 ? "down" : rnd() > 0.35 ? "up" : null,
      ts: new Date(now - index * 3.4 * 3600000 - rnd() * 3600000).toISOString(),
    };
  });
}
