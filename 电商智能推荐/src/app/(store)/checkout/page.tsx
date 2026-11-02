import type { Metadata } from "next";
import Link from "next/link";
import { USER_MAP } from "@/lib/data/community";
import { demoAddress, DEMO_USER_ID } from "@/lib/data/community";
import { getCart, getProfileBase } from "@/lib/store/db";
import { currentCustomer } from "@/lib/customer-auth";
import { getSessionId } from "@/lib/store/session";
import { priceCart } from "@/lib/commerce/pricing";
import { CheckoutClient } from "@/components/storefront/CheckoutClient";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "结算",
  description: "填写配送信息并完成订单。",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const sessionId = await getSessionId();
  const cart = await getCart(sessionId);
  const priced = priceCart(cart);
  const customer = await currentCustomer();
  const user =
    (customer ? await getProfileBase(customer.userId) : undefined) ??
    USER_MAP[DEMO_USER_ID];
  const defaults = {
    ...demoAddress,
    name: user.name,
    phone: "",
    province: demoAddress.province,
    city: demoAddress.city,
    district: demoAddress.district,
    detail: demoAddress.detail.startsWith(demoAddress.district)
      ? demoAddress.detail.slice(demoAddress.district.length).trim()
      : demoAddress.detail,
  };

  if (!priced.lines.length) {
    return (
      <div className="container-x flex min-h-[52vh] flex-col items-center justify-center py-20 text-center">
        <Icon name="bag" size={30} className="text-muted-light" />
        <h1 className="display mt-5 text-[34px]">购物袋为空，无法结算。</h1>
        <p className="mt-3 max-w-sm text-[12px] leading-6 text-muted">
          先挑一件喜欢的单品，或让 AI 造型师按场合与预算帮你搭一套。
        </p>
        <div className="mt-6 flex gap-2">
          <Link href="/shop" className="btn btn-primary">浏览单品</Link>
          <Link href="/stylist" className="btn btn-ghost">让造型师帮我搭</Link>
        </div>
      </div>
    );
  }

  return <CheckoutClient initialCart={priced} defaults={defaults} />;
}
