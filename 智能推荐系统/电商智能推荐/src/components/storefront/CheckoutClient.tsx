"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CartView } from "@/lib/commerce/pricing";
import type { Address } from "@/lib/types";
import { useCart } from "@/components/providers/Cart";
import { useToast } from "@/components/providers/Toast";
import { ProductArt } from "@/components/product/ProductArt";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/utils/format";

type Step = 1 | 2 | 3;

const PAYMENTS = [
  { key: "支付宝" as const, label: "支付宝", note: "推荐 · 即时到账", icon: "zap" as const },
  { key: "微信支付" as const, label: "微信支付", note: "扫码或免密支付", icon: "phone" as const },
  { key: "银联卡" as const, label: "银联卡", note: "支持境内借记卡 / 信用卡", icon: "shield" as const },
];

export function CheckoutClient({
  initialCart,
  defaults,
}: {
  initialCart: CartView;
  defaults: Address;
}) {
  const router = useRouter();
  const { cart: liveCart, refresh } = useCart();
  const cart = liveCart ?? initialCart;
  const { push } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [address, setAddress] = useState({
    name: defaults.name,
    phone: "",
    province: defaults.province,
    city: defaults.city,
    district: defaults.district,
    detail: defaults.detail,
  });
  const [payment, setPayment] = useState<(typeof PAYMENTS)[number]["key"]>("支付宝");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef(
    globalThis.crypto?.randomUUID?.() ?? `checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );

  const summary = cart.summary;
  const invalid = cart.lines.some((line) => !line.valid);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!address.name.trim()) next.name = "请填写收件人姓名";
    if (!/^1[3-9]\d{9}$/.test(address.phone)) next.phone = "请填写有效的 11 位手机号";
    if (!address.province.trim()) next.province = "请填写省份";
    if (!address.city.trim()) next.city = "请填写城市";
    if (!address.district.trim()) next.district = "请填写区县";
    if (address.detail.trim().length < 4) next.detail = "请填写详细地址（至少 4 个字）";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (step === 1 && !validate()) return;
    setStep((current) => (current === 3 ? 3 : ((current + 1) as Step)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!validate()) {
      setStep(1);
      push("请先补全配送信息", { tone: "error" });
      return;
    }
    if (!agreed) {
      push("请先阅读并同意服务条款", { tone: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          address,
          paymentMethod: payment,
          couponCode: summary.couponCode,
          channel: "官网",
          note: note.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { order?: { orderNo: string }; error?: string };
      if (!response.ok || !data.order) {
        throw new Error(data.error ?? "下单失败，请稍后重试");
      }
      await refresh();
      router.push(`/checkout/success?orderNo=${encodeURIComponent(data.order.orderNo)}`);
    } catch (error) {
      push((error as Error).message, { tone: "error" });
      setSubmitting(false);
    }
  };

  return (
    <div className="container-x pt-8 md:pt-10">
      <div className="border-b border-line pb-6">
        <p className="eyebrow">Secure Checkout</p>
        <h1 className="display mt-2 text-[42px] leading-none md:text-[54px]">结算</h1>
      </div>

      <div className="mt-6 flex items-center gap-4 overflow-x-auto border-b border-line pb-4">
        {[
          { no: 1, label: "配送信息" },
          { no: 2, label: "支付方式" },
          { no: 3, label: "确认下单" },
        ].map((item, index) => (
          <button
            key={item.no}
            onClick={() => item.no < step && setStep(item.no as Step)}
            className="flex shrink-0 items-center gap-2"
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] ${
                step === item.no
                  ? "border-ink bg-ink text-ivory"
                  : step > item.no
                    ? "border-clay bg-clay text-white"
                    : "border-line-strong text-muted"
              }`}
            >
              {step > item.no ? <Icon name="check" size={12} /> : `0${item.no}`}
            </span>
            <span className={`text-[11px] tracking-wide ${step === item.no ? "text-ink" : "text-muted"}`}>
              {item.label}
            </span>
            {index < 2 ? <span className="ml-2 hidden h-px w-10 bg-line sm:block" /> : null}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          {step === 1 ? (
            <section className="animate-fade-in">
              <h2 className="text-[16px]">配送信息</h2>
              <p className="mt-1.5 text-[10.5px] text-muted">
                顺丰标准配送，工作日 16:00 前下单当天发出。
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="name">收件人</label>
                  <input
                    id="name"
                    className={`field ${errors.name ? "field-error" : ""}`}
                    value={address.name}
                    onChange={(event) => setAddress({ ...address, name: event.target.value })}
                    autoComplete="name"
                  />
                  {errors.name ? <p className="mt-1 text-[9.5px] text-danger">{errors.name}</p> : null}
                </div>
                <div>
                  <label className="label" htmlFor="phone">手机号</label>
                  <input
                    id="phone"
                    className={`field ${errors.phone ? "field-error" : ""}`}
                    value={address.phone}
                    onChange={(event) =>
                      setAddress({ ...address, phone: event.target.value.replace(/\D/g, "").slice(0, 11) })
                    }
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="用于接收物流通知"
                  />
                  {errors.phone ? <p className="mt-1 text-[9.5px] text-danger">{errors.phone}</p> : null}
                </div>
                <div>
                  <label className="label" htmlFor="province">省份</label>
                  <input
                    id="province"
                    className={`field ${errors.province ? "field-error" : ""}`}
                    value={address.province}
                    onChange={(event) => setAddress({ ...address, province: event.target.value })}
                    autoComplete="address-level1"
                  />
                  {errors.province ? <p className="mt-1 text-[9.5px] text-danger">{errors.province}</p> : null}
                </div>
                <div>
                  <label className="label" htmlFor="city">城市</label>
                  <input
                    id="city"
                    className={`field ${errors.city ? "field-error" : ""}`}
                    value={address.city}
                    onChange={(event) => setAddress({ ...address, city: event.target.value })}
                    autoComplete="address-level2"
                  />
                  {errors.city ? <p className="mt-1 text-[9.5px] text-danger">{errors.city}</p> : null}
                </div>
                <div>
                  <label className="label" htmlFor="district">区 / 县</label>
                  <input
                    id="district"
                    className={`field ${errors.district ? "field-error" : ""}`}
                    value={address.district}
                    onChange={(event) => setAddress({ ...address, district: event.target.value })}
                    autoComplete="address-level3"
                  />
                  {errors.district ? <p className="mt-1 text-[9.5px] text-danger">{errors.district}</p> : null}
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="detail">详细地址</label>
                  <input
                    id="detail"
                    className={`field ${errors.detail ? "field-error" : ""}`}
                    value={address.detail}
                    onChange={(event) => setAddress({ ...address, detail: event.target.value })}
                    autoComplete="street-address"
                    placeholder="街道、门牌号、楼栋与房间号"
                  />
                  {errors.detail ? <p className="mt-1 text-[9.5px] text-danger">{errors.detail}</p> : null}
                </div>
              </div>

              <div className="mt-6 border border-line bg-paper p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px]">
                    <Icon name="truck" size={14} className="text-clay" />
                    顺丰标准配送
                  </div>
                  <span className="num text-[11px]">{summary.shipping === 0 ? "免运费" : money(summary.shipping)}</span>
                </div>
                <p className="mt-1.5 text-[9.5px] text-muted">
                  {summary.freeShippingUnlocked
                    ? "已满足免运费条件，预计 2–4 个工作日送达。"
                    : `再选 ${money(summary.freeShippingRemaining)} 可免运费；当前运费将按标准收取。`}
                </p>
              </div>

              <button onClick={goNext} className="btn btn-primary mt-6 w-full sm:w-auto">
                继续选择支付方式
                <Icon name="arrow-right" size={14} />
              </button>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="animate-fade-in">
              <h2 className="text-[16px]">支付方式</h2>
              <p className="mt-1.5 text-[10.5px] text-muted">
                演示环境不会产生真实扣款。生产环境可接入支付宝 / 微信 / 银联。
              </p>
              <div className="mt-6 space-y-2">
                {PAYMENTS.map((method) => (
                  <button
                    key={method.key}
                    onClick={() => setPayment(method.key)}
                    className={`flex w-full items-center justify-between border p-4 text-left transition ${
                      payment === method.key ? "border-ink bg-paper" : "border-line hover:border-muted"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon name={method.icon} size={18} className="text-clay" />
                      <div>
                        <p className="text-[12px]">{method.label}</p>
                        <p className="mt-0.5 text-[9.5px] text-muted">{method.note}</p>
                      </div>
                    </div>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        payment === method.key ? "border-ink bg-ink" : "border-line-strong"
                      }`}
                    >
                      {payment === method.key ? <span className="h-1.5 w-1.5 rounded-full bg-ivory" /> : null}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <label className="label" htmlFor="note">订单备注（选填）</label>
                <textarea
                  id="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 200))}
                  rows={3}
                  className="field"
                  placeholder="如礼物包装、指定配送时间"
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={() => setStep(1)} className="btn btn-ghost">
                  返回配送
                </button>
                <button onClick={goNext} className="btn btn-primary">
                  确认订单信息
                  <Icon name="arrow-right" size={14} />
                </button>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="animate-fade-in">
              <h2 className="text-[16px]">确认并支付</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="border border-line p-4">
                  <div className="flex items-center justify-between">
                    <p className="label mb-0">配送至</p>
                    <button onClick={() => setStep(1)} className="text-[9.5px] text-clay hover:underline">
                      修改
                    </button>
                  </div>
                  <p className="mt-2 text-[12px]">{address.name} · {address.phone}</p>
                  <p className="mt-1 text-[10.5px] leading-5 text-muted">
                    {address.province}{address.city}{address.district}
                    <br />
                    {address.detail}
                  </p>
                </div>
                <div className="border border-line p-4">
                  <div className="flex items-center justify-between">
                    <p className="label mb-0">支付方式</p>
                    <button onClick={() => setStep(2)} className="text-[9.5px] text-clay hover:underline">
                      修改
                    </button>
                  </div>
                  <p className="mt-2 text-[12px]">{payment}</p>
                  <p className="mt-1 text-[10.5px] text-muted">演示支付 · 不会真实扣款</p>
                </div>
              </div>

              <div className="mt-5 border border-line">
                {cart.lines.map((line) => (
                  <div key={`${line.productId}-${line.size}-${line.color}`} className="flex items-center gap-3 border-b border-line/70 p-3 last:border-b-0">
                    <div
                      className="h-16 w-13 shrink-0 overflow-hidden"
                      style={{
                        background: `linear-gradient(150deg, ${line.product.editorial.palette[0]}, ${line.product.editorial.palette[1]})`,
                      }}
                    >
                      <ProductArt
                        art={line.product.editorial.art}
                        color={line.product.colors[0].hex}
                        accent={line.product.editorial.accent}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px]">{line.product.name}</p>
                      <p className="mt-0.5 text-[9.5px] text-muted">
                        {line.color} / {line.size} · ×{line.qty}
                      </p>
                    </div>
                    <p className="num text-[11px]">{money(line.lineTotal)}</p>
                  </div>
                ))}
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-[10px] leading-5 text-muted">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-1 h-3.5 w-3.5 accent-[#17160f]"
                />
                <span>
                  我已阅读并同意《使用条款》《隐私政策》与《AI 推荐说明》，并确认收货信息无误。
                </span>
              </label>

              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={() => setStep(2)} className="btn btn-ghost">
                  返回支付
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || invalid}
                  className="btn btn-primary flex-1 sm:flex-none sm:min-w-[260px]"
                >
                  {submitting ? "正在提交…" : `支付 ${money(summary.total)}`}
                  {!submitting ? <Icon name="shield" size={14} /> : null}
                </button>
              </div>
              {invalid ? (
                <p className="mt-2 text-[9.5px] text-danger">购物袋中有商品库存不足，请返回购物袋调整。</p>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="lg:col-span-5">
          <div className="border border-line bg-paper p-5 lg:sticky lg:top-28">
            <div className="flex items-center justify-between">
              <h2 className="text-[12px] tracking-wide">订单摘要</h2>
              <Link href="/cart" className="text-[9.5px] text-muted hover:text-ink">
                返回购物袋
              </Link>
            </div>
            <div className="mt-4 max-h-[300px] space-y-3 overflow-y-auto pr-1">
              {cart.lines.map((line) => (
                <div key={`${line.productId}-${line.size}-${line.color}`} className="flex items-center gap-3">
                  <div
                    className="h-14 w-11 shrink-0 overflow-hidden"
                    style={{
                      background: `linear-gradient(150deg, ${line.product.editorial.palette[0]}, ${line.product.editorial.palette[1]})`,
                    }}
                  >
                    <ProductArt
                      art={line.product.editorial.art}
                      color={line.product.colors[0].hex}
                      accent={line.product.editorial.accent}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10.5px]">{line.product.name}</p>
                    <p className="text-[9px] text-muted">{line.color} / {line.size} ×{line.qty}</p>
                  </div>
                  <p className="num text-[10px]">{money(line.lineTotal)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-[11px]">
              <div className="flex justify-between text-muted">
                <span>商品小计</span>
                <span className="num text-ink">{money(summary.subtotal)}</span>
              </div>
              {summary.discount > 0 ? (
                <div className="flex justify-between text-clay">
                  <span>优惠 {summary.couponCode}</span>
                  <span className="num">-{money(summary.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-muted">
                <span>配送</span>
                <span className="num text-ink">
                  {summary.shipping === 0 ? "免运费" : money(summary.shipping)}
                </span>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-[14px]">
                <span>应付</span>
                <span className="num">{money(summary.total)}</span>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-[9.5px] text-muted">
              <p className="flex items-center gap-2"><Icon name="truck" size={12} /> 顺丰配送 · 预计 2–4 个工作日</p>
              <p className="flex items-center gap-2"><Icon name="refresh" size={12} /> 30 天无理由退换</p>
              <p className="flex items-center gap-2"><Icon name="shield" size={12} /> 安全支付 · 信息加密传输</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
