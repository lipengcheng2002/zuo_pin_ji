import type { Metadata } from "next";
import Link from "next/link";
import { ALL_POLICIES } from "@/lib/engine/knowledge";
import { SIZE_TABLE } from "@/lib/data/size-guide";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "帮助中心",
  description: "配送、退换、尺码、面料养护、会员与 AI 推荐说明。",
};

const SECTIONS = [
  { id: "shipping", policyId: "policy_shipping", label: "配送与运费" },
  { id: "returns", policyId: "policy_return", label: "退换政策" },
  { id: "size", policyId: "policy_size", label: "尺码指南" },
  { id: "care", policyId: "policy_care", label: "面料与养护" },
  { id: "member", policyId: "policy_member", label: "会员与积分" },
  { id: "coupon", policyId: "policy_coupon", label: "优惠券" },
  { id: "invoice", policyId: "policy_invoice", label: "发票与售后" },
  { id: "sustainability", policyId: "policy_sustainability", label: "可持续" },
  { id: "ai", policyId: "policy_ai", label: "AI 推荐说明" },
];

export default function HelpPage() {
  const byId = new Map(ALL_POLICIES.map((policy) => [policy.id, policy]));

  return (
    <div className="pb-20">
      <section className="border-b border-line bg-paper">
        <div className="container-x py-12 md:py-16">
          <p className="eyebrow">Help Center · 服务与政策</p>
          <h1 className="display mt-4 text-[46px] leading-[1.02] md:text-[64px]">
            把问题说清楚，
            <br />
            是好服务的开始。
          </h1>
          <p className="mt-5 max-w-xl text-[12.5px] leading-6 text-muted">
            关于配送、退换、尺码、面料养护与 AI 推荐的完整说明。若这里没有你需要的答案，
            AI 造型师与人工客服都在。
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href="/stylist" className="btn btn-primary btn-sm">
              <Icon name="sparkle" size={12} />
              问 AI 造型师
            </Link>
            <Link href="/account?tab=orders" className="btn btn-ghost btn-sm">
              查看我的订单
            </Link>
          </div>
        </div>
      </section>

      <div className="container-x grid gap-10 pt-10 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <div className="sticky top-28 border-t border-ink/60 pt-4">
            <p className="eyebrow">Contents</p>
            <nav className="mt-4 space-y-2.5">
              {SECTIONS.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-baseline gap-3 text-[11px] text-muted transition hover:text-clay"
                >
                  <span className="num text-[8.5px] text-muted-light">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {section.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="lg:col-span-8 lg:col-start-5">
          {SECTIONS.map((section, index) => {
            const policy = byId.get(section.policyId);
            if (!policy) return null;
            return (
              <section key={section.id} id={section.id} className="scroll-mt-28 border-t border-line py-10 first:border-t-0 first:pt-0">
                <div className="flex items-baseline gap-4">
                  <span className="num text-[9px] text-clay">{String(index + 1).padStart(2, "0")}</span>
                  <h2 className="display text-[28px] md:text-[34px]">{section.label}</h2>
                </div>
                <p className="mt-4 text-[12px] leading-7 text-ink-soft/80">{policy.text}</p>

                {section.id === "size" ? (
                  <div className="mt-6 grid gap-6 sm:grid-cols-2">
                    <div className="border border-line bg-paper p-4">
                      <p className="label">上衣 / 连衣裙（身体净尺寸 cm）</p>
                      <table className="w-full text-left text-[10px]">
                        <thead>
                          <tr className="border-b border-line text-[8.5px] uppercase tracking-[0.1em] text-muted">
                            <th className="py-2 font-normal">尺码</th>
                            <th className="py-2 font-normal">胸围</th>
                            <th className="py-2 font-normal">腰围</th>
                            <th className="py-2 font-normal">臀围</th>
                          </tr>
                        </thead>
                        <tbody>
                          {SIZE_TABLE.tops.map((row) => (
                            <tr key={row.size} className="border-b border-line/70 last:border-b-0">
                              <td className="py-2">{row.size}</td>
                              <td className="py-2">{row.bust}</td>
                              <td className="py-2">{row.waist}</td>
                              <td className="py-2">{row.hip}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border border-line bg-paper p-4">
                      <p className="label">鞋履（脚长 cm）</p>
                      <table className="w-full text-left text-[10px]">
                        <thead>
                          <tr className="border-b border-line text-[8.5px] uppercase tracking-[0.1em] text-muted">
                            <th className="py-2 font-normal">尺码</th>
                            <th className="py-2 font-normal">脚长</th>
                          </tr>
                        </thead>
                        <tbody>
                          {SIZE_TABLE.shoes.map((row) => (
                            <tr key={row.size} className="border-b border-line/70 last:border-b-0">
                              <td className="py-2">{row.size}</td>
                              <td className="py-2">{row.foot}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {section.id === "ai" ? (
                  <div className="mt-5 border-l-2 border-clay pl-4">
                    <p className="text-[10.5px] leading-6 text-muted">
                      织言的推荐链路：意图理解 → 五路召回 → 十因子融合排序 → MMR 多样性 → RAG 理由生成 → 护栏校验。
                      每一件推荐都会展示依据来源与置信度；你可以要求「为什么推荐这件」，也可以直接修改画像。
                    </p>
                    <Link href="/stylist" className="mt-3 inline-flex items-center gap-1 text-[10px] text-clay hover:underline">
                      和 AI 造型师聊聊
                      <Icon name="arrow-right" size={11} />
                    </Link>
                  </div>
                ) : null}
              </section>
            );
          })}

          <div className="mt-4 flex flex-col items-start justify-between gap-4 border border-line bg-[#eee8dd] px-6 py-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-[13px]">还需要帮助？</p>
              <p className="mt-1 text-[10.5px] text-muted">客服在线 09:00–22:00，复杂问题承诺 24 小时内响应。</p>
            </div>
            <div className="flex gap-2">
              <Link href="/stylist" className="btn btn-primary btn-sm">问 AI 造型师</Link>
              <a href="mailto:care@zhiyan.example" className="btn btn-ghost btn-sm">
                发送邮件
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
