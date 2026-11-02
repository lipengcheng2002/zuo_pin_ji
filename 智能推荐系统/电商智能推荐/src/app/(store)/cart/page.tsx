import type { Metadata } from "next";
import { getCart, getEventStream } from "@/lib/store/db";
import { currentUserId } from "@/lib/customer-auth";
import { getSessionId } from "@/lib/store/session";
import { priceCart } from "@/lib/commerce/pricing";
import { buildProfileView } from "@/lib/engine/profile";
import { recommend } from "@/lib/engine/recommend";
import { CartPageClient } from "@/components/storefront/CartPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "购物袋",
  description: "查看购物袋中的织言单品，使用优惠券并结算。",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const sessionId = await getSessionId();
  const cart = await getCart(sessionId);
  const priced = priceCart(cart);
  const [events, userId] = await Promise.all([getEventStream(), currentUserId()]);
  const profile = buildProfileView(userId, events);
  const trigger = priced.lines[0]?.productId;
  const recommendations = recommend(
    {
      userId,
      scene: priced.lines.length ? "cart" : "home",
      limit: 4,
      triggerProductId: trigger,
      excludeProductIds: priced.lines.map((line) => line.productId),
    },
    { events, userProfile: profile },
  );

  return <CartPageClient initialCart={priced} recommendations={recommendations.items} />;
}
