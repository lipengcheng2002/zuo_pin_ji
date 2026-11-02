import { CATEGORY_MAP } from "@/lib/data/catalog";
import type { ToolContext } from "@/lib/agent/tools";
import { outfitSlotLabel } from "@/lib/engine/outfit";
import { INTENT_LABEL } from "@/lib/engine/intent";
import type { Order, Product } from "@/lib/types";

export type ComposedAnswer = {
  answer: string;
  suggestions: string[];
  followUp: string | null;
};

const money = (value: number) => `¥${value.toLocaleString("zh-CN")}`;

const slotSummary = (ctx: ToolContext): string => {
  const { slots } = ctx.intent;
  const parts: string[] = [];
  if (slots.categories.length) {
    parts.push(slots.categories.map((c) => CATEGORY_MAP[c]?.label ?? c).join("、"));
  }
  if (slots.colors.length) parts.push(slots.colors.join("、"));
  if (slots.occasions.length) parts.push(slots.occasions.join("、") + "场景");
  if (slots.styles.length) parts.push(slots.styles.join("、"));
  if (slots.budget) parts.push(`${money(slots.budget.max)} 以内`);
  return parts.length ? parts.join(" · ") : "你的近期偏好";
};

const orderLine = (order: Order): string =>
  `${order.orderNo} 当前状态「${order.status}」${order.trackingNo ? `，顺丰运单 ${order.trackingNo}` : ""}，包含 ${order.items.map((i) => `${i.name}（${i.color}/${i.size}）`).join("、")}，实付 ${money(order.total)}。`;

const productLine = (product: Product, note?: string): string =>
  `· ${product.name} ${money(product.price)}${note ? ` — ${note}` : ""}`;

export function composeAnswer(ctx: ToolContext): ComposedAnswer {
  const top = ctx.recommendations.slice(0, 3);
  const focus = ctx.focusProduct ?? top[0]?.product;
  const intent = ctx.intent.intent;

  const genericSuggestions = [
    "帮我搭一套通勤",
    "预算一千以内推荐",
    "我的尺码是多少",
    "查看我的购物袋",
  ];

  switch (intent) {
    case "greeting":
      return {
        answer:
          "你好，我是织言的 AI 造型师。可以按场合、预算或风格帮你找单品，也能直接搭一整套。今天想先看通勤、约会，还是旅行？",
        suggestions: ["通勤一周穿搭", "约会连衣裙", "千元内羊绒", "我的尺码是多少"],
        followUp: null,
      };

    case "styling": {
      if (ctx.outfit) {
        const outfit = ctx.outfit;
        const wantsMultiple = /(三|两|几|多)套/.test(ctx.message);
        const lines = outfit.items
          .map(
            (item) =>
              `· ${outfitSlotLabel(item.slot)}：${item.product.name}（${money(item.product.price)}）`,
          )
          .join("\n");
        return {
          answer: `${wantsMultiple ? "先给你第一套完整方案。" : ""}按你的${ctx.profile.archetype}偏好和${outfit.occasion}场景，我搭了这套「${outfit.title}」：\n${lines}\n整套 ${money(outfit.total)}，${outfit.harmony.join("、")}。${outfit.notes.split("。")[0]}。`,
          suggestions: wantsMultiple
            ? ["再搭一套裙装", "再来一套更正式的", "整套加入购物袋", "预算再低一点"]
            : ["整套加入购物袋", "换成更通勤的版本", "预算再低一点", "看第一件的面料"],
          followUp: wantsMultiple
            ? "如果更偏裙装或更正式，我可以按同一预算再补两套。"
            : "需要我把整套加入购物袋，还是先看其中某一件的细节？",
        };
      }
      if (top.length) {
        return {
          answer: `我先按${slotSummary(ctx)}挑了几件可以互相组合的单品：\n${top
            .map((item) => productLine(item.product, item.reason.headline))
            .join("\n")}\n其中「${top[0].product.name}」最贴合你的衣橱——${top[0].reason.detail}`,
          suggestions: ["帮我搭成一套", "换一个场景", "看更便宜的选择", "为什么推荐这件"],
          followUp: "想让我把它们组成一套，还是先看某一件的尺码？",
        };
      }
      break;
    }

    case "find_product": {
      if (top.length) {
        const budgetNote =
          ctx.intent.slots.budget?.max
            ? `预算控制在 ${money(ctx.intent.slots.budget.max)} 以内，`
            : "";
        return {
          answer: `我按${slotSummary(ctx)}筛了一遍，${budgetNote}保留了匹配度最高的 ${top.length} 件：\n${top
            .map((item) => productLine(item.product, item.matchedTags.slice(0, 2).join(" · ")))
            .join("\n")}\n${top[0].reason.detail}`,
          suggestions: budgetNote
            ? ["再便宜一点", "看看这一套的搭配", "换个颜色", "加入购物袋"]
            : ["帮我搭成一套", "换成通勤场景", "千元以内", "加入购物袋"],
          followUp: ctx.intent.slots.occasions.length
            ? "你更在意版型还是面料？我可以再收窄一轮。"
            : "这次主要穿去什么场合？我可以把推荐范围再收窄。",
        };
      }
      if (ctx.searchResult?.products.length) {
        return {
          answer: `我找到 ${ctx.searchResult.products.length} 件相关单品，先看这几件：\n${ctx.searchResult.products
            .slice(0, 4)
            .map((p) => productLine(p, p.styleTags.slice(0, 2).join(" · ")))
            .join("\n")}`,
          suggestions: ["帮我搭成一套", "只看羊绒", "一千以内", "加入购物袋"],
          followUp: "需要我按你的尺码再确认一遍现货吗？",
        };
      }
      return {
        answer:
          "这个组合下暂时没有完全匹配的现货。你可以放宽一个条件——比如把预算提高 10%，或者从固定颜色换成同色系（燕麦 / 雾白 / 炭灰），我马上重新筛一遍。",
        suggestions: ["预算放宽到 2000", "同色系也可以", "看通勤外套", "看针织"],
        followUp: "哪个条件可以先放宽？",
      };
    }

    case "size_advice": {
      if (ctx.sizeAdvice) {
        const advice = ctx.sizeAdvice;
        const alternativeNote = advice.alternative
          ? advice.alternativeDirection === "down"
            ? `；如果你更喜欢合身的效果，可试 ${advice.alternative}`
            : `；如果你偏好更宽松的版型，可试 ${advice.alternative}`
          : "";
        const intro =
          advice.productId && ctx.focusProduct
            ? `按 ${ctx.profile.body.height}cm / ${ctx.profile.body.weight}kg 与常穿 ${ctx.profile.sizes.top} 码，${advice.productName} 建议 ${advice.recommended} 码${alternativeNote}。`
            : `你的基础尺码参考：上衣 ${advice.recommended}，下装 ${advice.alternative ?? ctx.profile.sizes.bottom}。`;
        return {
          answer: `${intro}\n${advice.fitNote}\n${advice.reviewNote}\n${advice.disclaimer}`,
          suggestions: ["看看这件商品的评价", "推荐我这个尺码的针织", "换一个版型", "加入购物袋"],
          followUp: "如果你告诉我具体用途，我可以顺便看看这件和你的衣橱是否好搭。",
        };
      }
      break;
    }

    case "compare": {
      if (ctx.comparison) {
        const { items, dimensions, verdict } = ctx.comparison;
        const keyDims = dimensions.filter((d) =>
          ["价格", "面料", "保暖", "正式度"].includes(d.label),
        );
        return {
          answer: `「${items[0].product.name}」与「${items[1].product.name}」的差异：\n${keyDims
            .map((d) => `· ${d.label}：${d.a} / ${d.b}${d.winner === "A" ? "（前者更优）" : d.winner === "B" ? "（后者更优）" : ""}`)
            .join("\n")}\n${verdict}`,
          suggestions: ["把更适合的那件加入购物袋", "看第三件替代", "哪件更适合通勤", "面料有什么区别"],
          followUp: "要我按你的预算再补一件备选吗？",
        };
      }
      break;
    }

    case "product_qa": {
      if (focus) {
        const docs = ctx.knowledge.filter((d) => d.type === "product" && d.productId === focus.id);
        const reviewDoc = ctx.knowledge.find((d) => d.type === "review" && d.productId === focus.id);
        const core = [
          `${focus.name}：${focus.materials.map((m) => `${m.name} ${m.pct}%`).join("、")}，${focus.fit}，${focus.length}。`,
          `体感指标——保暖 ${focus.features.warmth}/5、透气 ${focus.features.breathability}/5、弹性 ${focus.features.stretch}/5；适合${focus.occasions.join("、")}。`,
          `养护：${focus.care}`,
        ];
        if (reviewDoc) core.push(`买家反馈：${reviewDoc.text.slice(0, 70)}…`);
        else if (docs.length) core.push(docs[0].text.split("\n")[1] ?? "");
        return {
          answer: core.join("\n"),
          suggestions: ["按我的尺码有货吗", "帮我搭一套", "有别的颜色吗", "怎么保养"],
          followUp: "想让我按你的尺码确认现货吗？",
        };
      }
      if (ctx.knowledge.length) {
        const doc = ctx.knowledge[0];
        return {
          answer: `根据《${doc.title}》：${doc.text.slice(0, 180)}${doc.text.length > 180 ? "…" : ""}`,
          suggestions: ["我的订单到哪了", "尺码表在哪里看", "退货运费谁承担"],
          followUp: null,
        };
      }
      break;
    }

    case "policy": {
      const doc = ctx.knowledge[0];
      if (doc) {
        return {
          answer: `根据《${doc.title}》：${doc.text}`,
          suggestions: ["我的订单到哪了", "如何申请退货", "尺码表在哪里看", "积分怎么用"],
          followUp: "如果你有具体订单，我可以帮你对照政策确认。",
        };
      }
      return {
        answer:
          "这项政策我暂时没有检索到明确条款，建议转接人工客服确认。你可以先告诉我订单号，我帮你一起整理信息。",
        suggestions: ["转人工", "我的订单到哪了", "退换政策"],
        followUp: null,
      };
    }

    case "order_status": {
      if (ctx.orders?.length) {
        return {
          answer: `查到 ${ctx.orders.length} 笔订单。\n${orderLine(ctx.orders[0])}${ctx.orders[1] ? `\n另一笔：${orderLine(ctx.orders[1])}` : ""}`,
          suggestions: ["怎么申请退货", "推荐搭配这件外套的单品", "客服在哪", "继续逛逛"],
          followUp: "需要我帮你查另一笔订单，或直接发起退换申请吗？",
        };
      }
      return {
        answer:
          "没有查到对应订单。请确认订单号（以 ZY 开头）或下单手机号，我再帮你核对。",
        suggestions: ["查看我的订单", "联系客服", "回到首页"],
        followUp: null,
      };
    }

    case "cart": {
      if (ctx.actions.some((a) => a.type === "added_to_cart")) {
        const action = ctx.actions.find((a) => a.type === "added_to_cart");
        const added = action && action.type === "added_to_cart" ? action : null;
        return {
          answer: added
            ? `已把「${added.name}」${added.color} / ${added.size} 加入购物袋。${ctx.cart ? `当前共 ${ctx.cart.itemCount} 件，合计 ${money(ctx.cart.summary.total)}${ctx.cart.summary.freeShippingUnlocked ? "，已享免运费" : `，再选 ${money(ctx.cart.summary.freeShippingRemaining)} 可免运费`}。` : ""}`
            : "已加入购物袋。",
          suggestions: ["去结算", "搭配还缺什么", "看看购物袋", "继续挑"],
          followUp: "需要我再搭一件与它互补的单品吗？",
        };
      }
      if (ctx.cart) {
        if (!ctx.cart.lines.length) {
          return {
            answer: "你的购物袋还是空的。可以先告诉我场合和预算，我直接帮你挑一套。",
            suggestions: ["通勤一周穿搭", "约会连衣裙", "千元内针织", "看看热销"],
            followUp: null,
          };
        }
        return {
          answer: `购物袋里有 ${ctx.cart.itemCount} 件，合计 ${money(ctx.cart.summary.total)}。\n${ctx.cart.lines
            .map((l) => `· ${l.product.name}（${l.color}/${l.size}）×${l.qty}`)
            .join("\n")}${top.length ? `\n搭配建议：${top.map((t) => t.product.name).join("、")} 与现有单品互补。` : ""}`,
          suggestions: ["去结算", "搭配还缺什么", "看看购物袋", "继续挑"],
          followUp: "需要我帮你补齐一整套吗？",
        };
      }
      break;
    }

    case "profile_update": {
      const action = ctx.actions.find((a) => a.type === "preference_updated");
      const tags = action && action.type === "preference_updated" ? action.tags : [];
      return {
        answer: `已记住${tags.length ? `：${tags.join("、")}` : "你的更新"}。之后的推荐会优先匹配这些偏好，你随时可以在「账户 - 风格偏好」里修改。`,
        suggestions: ["按新偏好推荐", "我的画像里有什么", "重置偏好"],
        followUp: "要我按更新后的偏好重新挑一轮吗？",
      };
    }

    case "smalltalk":
      return {
        answer:
          "谢谢你的反馈。如果愿意，我可以继续把刚才那几件按场景重新组合，或者换一个预算区间试试。",
        suggestions: ["重新搭一套", "换个预算", "看看别的颜色"],
        followUp: null,
      };
  }

  // Fallback
  return {
    answer: top.length
      ? `我先按${INTENT_LABEL[intent]}的方向挑了几件：\n${top
          .map((item) => productLine(item.product, item.reason.headline))
          .join("\n")}\n告诉我场合或预算，我可以再精确一些。`
      : "我需要再确认一下你的需求：想看哪类单品、什么场合、预算大概多少？",
    suggestions: genericSuggestions,
    followUp: "你更想先看单品，还是直接要一套搭配？",
  };
}

export function groundingFor(ctx: ToolContext): string[] {
  const lines: string[] = [];
  ctx.recommendations.slice(0, 4).forEach((item) => {
    lines.push(
      `${item.product.name} ¥${item.product.price}；${item.product.materials.map((m) => `${m.name}${m.pct}%`).join("、")}；${item.product.fit}；场景 ${item.product.occasions.join("/")}；推荐理由：${item.reason.headline} — ${item.reason.detail}`,
    );
  });
  ctx.knowledge.slice(0, 3).forEach((doc) => {
    lines.push(`知识库《${doc.title}》：${doc.text.slice(0, 220)}`);
  });
  if (ctx.sizeAdvice) {
    lines.push(
      `尺码：${ctx.sizeAdvice.productName} 建议 ${ctx.sizeAdvice.recommended} 码；${ctx.sizeAdvice.fitNote}`,
    );
  }
  if (ctx.outfit) {
    lines.push(
      `搭配：${ctx.outfit.title}，共 ¥${ctx.outfit.total}，${ctx.outfit.items.map((i) => i.product.name).join("、")}。`,
    );
  }
  if (ctx.orders?.length) {
    lines.push(`订单：${ctx.orders.slice(0, 2).map(orderLine).join(" ")}`);
  }
  return lines;
}
