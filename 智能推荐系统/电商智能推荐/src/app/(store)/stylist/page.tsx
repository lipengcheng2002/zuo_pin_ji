import type { Metadata } from "next";
import { agentMeta } from "@/lib/agent/runtime";
import { getEventStream } from "@/lib/store/db";
import { buildProfileView } from "@/lib/engine/profile";
import { currentUserId } from "@/lib/customer-auth";
import { StylistWorkspace } from "@/components/stylist/StylistWorkspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI 造型师",
  description:
    "告诉织言 AI 造型师你的场合、预算与身形，获得可解释的整套搭配、尺码建议与购物建议。",
};

export default async function StylistPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { prompt } = await searchParams;
  const [meta, events, userId] = await Promise.all([
    agentMeta(),
    getEventStream(),
    currentUserId(),
  ]);
  const profile = buildProfileView(userId, events);

  return (
    <StylistWorkspace
      initialPrompt={typeof prompt === "string" ? prompt.slice(0, 300) : ""}
      meta={meta}
      profile={{
        name: profile.name,
        archetype: profile.archetype,
        tags: profile.tags,
        sizes: profile.sizes,
        body: profile.body,
        priceBand: profile.priceBand,
        behavior: {
          last30d: profile.behavior.last30d,
          wishlists: profile.behavior.wishlists,
          carts: profile.behavior.carts,
          purchases: profile.behavior.purchases,
        },
        affinities: {
          styles: profile.affinities.styles,
          colors: profile.affinities.colors,
          occasions: profile.affinities.occasions,
        },
      }}
    />
  );
}
